import type { FastifyBaseLogger } from 'fastify';
import type { Notification, NotificationLevel } from '@landscape/shared';
import type { NotificationsRepository } from '../Db/Repositories/NotificationsRepository';
import type { EventBus } from '../Events/EventBus';

export interface NotifyInput {
  source: string;
  level: NotificationLevel;
  title: string;
  body?: string;
  data?: Record<string, unknown> | null;
}

/**
 * Persists notifications and pushes them to every open client. Sources:
 * the watchers (Docker events, disk and temperature thresholds), the monitor
 * service, apps through the SDK, and the test button.
 */
export class NotificationService {
  constructor(
    private readonly repo: NotificationsRepository,
    private readonly events: EventBus,
    private readonly log: FastifyBaseLogger,
  ) {}

  notify(input: NotifyInput): Notification {
    const notification = this.repo.create({ source: input.source, level: input.level, title: input.title, body: input.body ?? '', data: input.data ?? null });
    this.log.info({ source: input.source, level: input.level, title: input.title }, 'Notification');
    this.events.publish({ type: 'notification', notification });
    return notification;
  }

  list(): Notification[] {
    return this.repo.list();
  }

  markRead(ids: string[] | 'all'): number {
    const changed = this.repo.markRead(ids);
    if (changed > 0 || ids === 'all') this.events.publish({ type: 'notifications-read', ids });
    return changed;
  }

  clear(): number {
    const removed = this.repo.clear();
    this.events.publish({ type: 'notifications-cleared' });
    return removed;
  }

  unreadCount(): number {
    return this.repo.unreadCount();
  }
}
