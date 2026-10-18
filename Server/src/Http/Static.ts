import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';

/**
 * Serves the built client. Hashed assets are cached for a year, index.html is
 * never cached, and unknown non-API GETs fall back to the SPA shell.
 */
export async function installStatic(app: FastifyInstance, clientDir: string): Promise<void> {
  const indexFile = path.join(clientDir, 'index.html');
  if (!existsSync(indexFile)) {
    app.log.warn({ clientDir }, 'Client build not found; only the API will be served');
    app.get('/', async () => ({ message: 'LANdscape API is running, but the client build is missing.' }));
    return;
  }

  await app.register(fastifyStatic, {
    root: clientDir,
    prefix: '/',
    wildcard: false,
    index: false,
    cacheControl: false,
    setHeaders(reply, filePath) {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        void reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (filePath.includes(`${path.sep}wallpapers${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`)) {
        void reply.header('Cache-Control', 'public, max-age=86400');
      } else {
        void reply.header('Cache-Control', 'no-cache');
      }
    },
  });

  const sendIndex = () => readFileSync(indexFile);

  app.get('/', async (_request, reply) => {
    void reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache');
    return sendIndex();
  });

  app.setNotFoundHandler(async (request, reply) => {
    const url = request.url.split('?')[0] ?? '';
    const isApiLike = url.startsWith('/api/') || url.startsWith('/ws/') || url.startsWith('/icons/') || url.startsWith('/wallpapers/');
    if (request.method === 'GET' && !isApiLike && !url.startsWith('/assets/')) {
      void reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache');
      return sendIndex();
    }
    void reply.status(404);
    return { error: { code: 'not_found', message: 'Not found' } };
  });
}
