import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../Context';
import { collectSystemStatus, type SshProbe } from './Status';

export function registerSystemRoutes(app: FastifyInstance, ctx: ServerContext, sshProbe: SshProbe | null): void {
  app.get('/api/system/status', async () => collectSystemStatus(ctx.config, sshProbe));
  app.get('/api/system/version', async () => ({ version: ctx.config.version }));
}
