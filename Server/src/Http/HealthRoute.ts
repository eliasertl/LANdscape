import type { FastifyInstance } from 'fastify';

/** Unauthenticated liveness probe for the Docker HEALTHCHECK. Reveals nothing but "ok". */
export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/healthz', async (_request, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return { ok: true };
  });
}
