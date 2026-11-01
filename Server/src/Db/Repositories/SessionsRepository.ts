import type { Database } from '../Database';

export interface SessionRow {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  user_agent: string;
  /** Set while the session is locked (Settings → Lock & Security); cleared by unlock. */
  locked_at: string | null;
  /** Short device description derived from the user agent at login. */
  device: string;
}

export class SessionsRepository {
  constructor(private readonly db: Database) {}

  create(id: string, expiresAt: Date, userAgent: string, device: string, createdAt: Date = new Date()): void {
    const now = createdAt.toISOString();
    this.db.run(
      'INSERT INTO sessions (id, created_at, expires_at, last_seen_at, user_agent, device) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      now,
      expiresAt.toISOString(),
      now,
      userAgent.slice(0, 512),
      device.slice(0, 128),
    );
  }

  find(id: string): SessionRow | undefined {
    return this.db.get<SessionRow & Record<string, string | null>>('SELECT * FROM sessions WHERE id = ?', id);
  }

  list(): SessionRow[] {
    return this.db.all<SessionRow & Record<string, string | null>>('SELECT * FROM sessions ORDER BY last_seen_at DESC');
  }

  touch(id: string, lastSeen: Date, expiresAt: Date): void {
    this.db.run(
      'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?',
      lastSeen.toISOString(),
      expiresAt.toISOString(),
      id,
    );
  }

  setLocked(id: string, lockedAt: Date | null): void {
    this.db.run('UPDATE sessions SET locked_at = ? WHERE id = ?', lockedAt ? lockedAt.toISOString() : null, id);
  }

  delete(id: string): void {
    this.db.run('DELETE FROM sessions WHERE id = ?', id);
  }

  /** Deletes every session except `keep`; returns how many went. */
  deleteOthers(keep: string): number {
    return this.db.run('DELETE FROM sessions WHERE id <> ?', keep).changes;
  }

  deleteExpired(now: Date): number {
    return this.db.run('DELETE FROM sessions WHERE expires_at <= ?', now.toISOString()).changes;
  }

  count(): number {
    const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions');
    return Number(row?.n ?? 0);
  }
}
