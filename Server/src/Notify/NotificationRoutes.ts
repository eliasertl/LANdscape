import type { FastifyInstance } from 'fastify';
import { notificationCreateSchema, notificationsReadSchema } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { parseOrThrow } from '../Http/Errors';

export function registerNotificationRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/api/notifications', async () => ({ notifications: ctx.notifications.list(), unread: ctx.notifications.unreadCount() }));

  /** Apps (through the SDK, milestone 6) and the "Send test notification" button. */
  app.post('/api/notifications', async (request, reply) => {
    const input = parseOrThrow(notificationCreateSchema, request.body);
    void reply.status(201);
    return ctx.notifications.notify({ source: input.source, level: input.level, title: input.title, body: input.body, data: input.data ?? null });
  });

  app.post('/api/notifications/read', async (request) => {
    const { ids } = parseOrThrow(notificationsReadSchema, request.body);
    return { ok: true, changed: ctx.notifications.markRead(ids) };
  });

  app.delete('/api/notifications', async () => ({ ok: true, removed: ctx.notifications.clear() }));
}
