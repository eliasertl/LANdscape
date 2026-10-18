import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { containerIdSchema } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { HttpError, parseOrThrow, unavailable } from '../Http/Errors';

function dockerError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const status = (error as { statusCode?: number } | null)?.statusCode;
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|ECONNREFUSED|EACCES|EPERM/.test(message)) {
    throw unavailable('docker_unavailable', `Docker socket not accessible: ${message}`);
  }
  if (status === 404) throw new HttpError(404, 'not_found', 'Container not found');
  if (status === 304) throw new HttpError(409, 'conflict', 'Container is already in that state');
  throw new HttpError(status && status >= 400 && status < 600 ? status : 500, 'docker_error', message);
}

export function registerContainerRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const ensure = () => {
    if (!ctx.docker.available) throw unavailable('docker_unavailable', `Docker socket not found at ${ctx.config.dockerSocket}. Mount /var/run/docker.sock.`);
  };

  app.get('/api/docker/containers', async () => {
    ensure();
    return ctx.docker.listContainers().catch(dockerError);
  });

  app.post('/api/docker/containers/:id/:action', async (request) => {
    ensure();
    const params = parseOrThrow(z.object({ id: containerIdSchema, action: z.enum(['start', 'stop', 'restart']) }), request.params);
    await ctx.docker.action(params.id, params.action).catch(dockerError);
    request.log.info({ container: params.id, action: params.action }, 'Docker container action');
    return { ok: true };
  });
}
