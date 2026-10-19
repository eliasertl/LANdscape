import type { FastifyInstance } from 'fastify';
import type { ServerContext } from '../Context';

export function registerProxyRoutes(app: FastifyInstance, ctx: ServerContext): void {
  /** Read-only overview for Settings: ports in use, their targets and whether each listener is up. */
  app.get('/api/proxy', async () => ctx.proxy.overview());
}
