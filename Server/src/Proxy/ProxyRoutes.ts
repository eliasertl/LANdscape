import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ServerContext } from '../Context';
import { conflict, notFound, parseOrThrow, unavailable } from '../Http/Errors';
import { ProxyPortError } from './ProxyManager';

const leaseCreateSchema = z.object({ shortcutId: z.string().regex(/^[a-z0-9]{1,64}$/) });
const leaseParams = z.object({ id: z.string().regex(/^[0-9a-f]{32}$/) });

export function registerProxyRoutes(app: FastifyInstance, ctx: ServerContext): void {
  /** Read-only overview for Settings: ports, their targets, and whether (and why) each one is open. */
  app.get('/api/proxy', async () => ctx.proxy.overview());

  /** A proxied window opens: lease its port (opens the listener) and answer once it accepts connections. */
  app.post('/api/proxy/leases', async (request, reply) => {
    const { shortcutId } = parseOrThrow(leaseCreateSchema, request.body);
    if (!ctx.repos.shortcuts.find(shortcutId)) throw notFound('Shortcut not found');
    try {
      const lease = await ctx.proxy.lease(shortcutId);
      if (!lease) throw conflict('This shortcut has no proxy port. Check Settings → Proxy.');
      void reply.status(201);
      return lease;
    } catch (error) {
      if (error instanceof ProxyPortError) throw unavailable('proxy_port_unavailable', `The proxy port could not be opened: ${error.message}`);
      throw error;
    }
  });

  /** Heartbeat while the window stays open. 404 means the lease expired; the client then leases again. */
  app.post('/api/proxy/leases/:id/renew', async (request) => {
    const { id } = parseOrThrow(leaseParams, request.params);
    try {
      const port = await ctx.proxy.renewLease(id);
      if (port === null) throw notFound('Lease expired');
      return { ok: true, port };
    } catch (error) {
      if (error instanceof ProxyPortError) throw unavailable('proxy_port_unavailable', `The proxy port could not be opened: ${error.message}`);
      throw error;
    }
  });

  app.delete('/api/proxy/leases/:id', async (request) => {
    const { id } = parseOrThrow(leaseParams, request.params);
    ctx.proxy.releaseLease(id);
    return { ok: true };
  });
}
