import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { killSignalSchema } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { HttpError, parseOrThrow } from '../Http/Errors';
import { sshErrorHandler } from './FileRoutes';

/** Process control runs over SSH, so it is limited to what the SSH user may do. */
export function registerProcessRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.post('/api/processes/:pid/kill', async (request) => {
    const { pid } = parseOrThrow(z.object({ pid: z.coerce.number().int().min(2).max(4194304) }), request.params);
    const { signal } = parseOrThrow(killSignalSchema, request.body ?? {});
    try {
      const result = await ctx.ssh.exec(`kill -${signal} ${pid} 2>&1`, { timeoutMs: 10_000 });
      if (result.code !== 0) {
        const detail = result.stdout.trim() || result.stderr.trim() || `kill exited with ${result.code}`;
        if (/not permitted|permission denied/i.test(detail)) {
          throw new HttpError(403, 'permission_denied', `Not permitted: the SSH user may not signal process ${pid}. (${detail})`);
        }
        if (/no such process/i.test(detail)) throw new HttpError(404, 'not_found', `Process ${pid} no longer exists.`);
        throw new HttpError(500, 'kill_failed', detail);
      }
      return { ok: true, pid, signal };
    } catch (error) {
      sshErrorHandler(error);
    }
  });
}
