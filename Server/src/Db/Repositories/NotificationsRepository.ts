import type { Notification, NotificationLevel } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { newId, nowIso } from '../Ids';

interface NotificationRow extends Row {
  id: string;
  source: string;
  level: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  data: string | null;
}

/** How many notifications are kept; older ones are trimmed on insert. */
export const NOTIFICATION_LIMIT = 500;

function toNotification(row: NotificationRow): Notification {
  let data: Record<string, unknown> | null = null;
  if (row.data) {
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }
  return { id: row.id, source: row.source, level: row.level as NotificationLevel, title: row.title, body: row.body, createdAt: row.created_at, readAt: row.read_at, data };
}

export class NotificationsRepository {
  constructor(private readonly db: Database) {}

  list(limit = 200): Notification[] {
    return this.db.all<NotificationRow>('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?', limit).map(toNotification);
  }

  create(input: { source: string; level: NotificationLevel; title: string; body: string; data?: Record<string, unknown> | null }): Notification {
    const id = newId();
    this.db.transaction(() => {
      this.db.run(
        'INSERT INTO notifications (id, source, level, title, body, created_at, read_at, data) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
        id,
        input.source,
        input.level,
        input.title,
        input.body,
        nowIso(),
        input.data ? JSON.stringify(input.data) : null,
      );
      this.db.run('DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY created_at DESC LIMIT ?)', NOTIFICATION_LIMIT);
    });
    return this.find(id) as Notification;
  }

  find(id: string): Notification | undefined {
    const row = this.db.get<NotificationRow>('SELECT * FROM notifications WHERE id = ?', id);
    return row ? toNotification(row) : undefined;
  }

  markRead(ids: string[] | 'all'): number {
    const now = nowIso();
    if (ids === 'all') return this.db.run('UPDATE notifications SET read_at = ? WHERE read_at IS NULL', now).changes;
    let changed = 0;
    this.db.transaction(() => {
      for (const id of ids) changed += this.db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL', now, id).changes;
    });
    return changed;
  }

  clear(): number {
    return this.db.run('DELETE FROM notifications').changes;
  }

  unreadCount(): number {
    const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL');
    return Number(row?.n ?? 0);
  }
}
