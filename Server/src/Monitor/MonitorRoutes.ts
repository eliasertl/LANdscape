import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { monitorTargetSchema } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { notFound, parseOrThrow } from '../Http/Errors';

const idParams = z.object({ id: z.string().min(1).max(130) });

export function registerMonitorRoutes(app: FastifyInstance, ctx: ServerContext): void {
  /** Every target with its state and short history (shortcut health dots, the tray summary, the Uptime Monitor app). */
  app.get('/api/monitor', async () => ({ intervalSeconds: ctx.repos.settings.get().monitor.intervalSeconds, statuses: ctx.monitor.statuses() }));

  app.get('/api/monitor/:id/history', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const status = ctx.monitor.statusOf(id);
    if (!status) throw notFound('Monitor target not found');
    return status;
  });

  /** Runs all checks now (the Settings "Check now" button). */
  app.post('/api/monitor/check', async () => {
    await ctx.monitor.checkAll();
    return { ok: true, statuses: ctx.monitor.statuses() };
  });

  /** Apps register their own targets (the Uptime Monitor app); shortcut targets are automatic. */
  app.post('/api/monitor/targets', async (request, reply) => {
    const target = parseOrThrow(monitorTargetSchema, request.body);
    ctx.monitor.register(target);
    void reply.status(201);
    return ctx.monitor.statusOf(target.id);
  });

  app.delete('/api/monitor/targets/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    if (!ctx.monitor.unregister(id)) throw notFound('Monitor target not found');
    return { ok: true };
  });
}
