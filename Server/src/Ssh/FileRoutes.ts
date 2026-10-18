import type { FastifyInstance } from 'fastify';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { remotePathSchema } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { HttpError, badRequest, parseOrThrow } from '../Http/Errors';
import { SshUnavailableError } from './Connection';
import { joinRemote, normalizeRemotePath, parentOf, validateEntryName } from './PathValidation';

const pathQuery = z.object({ path: remotePathSchema });

/** Translates SSH availability problems into a 503 with a setup hint. */
export function sshErrorHandler(error: unknown): never {
  if (error instanceof SshUnavailableError) throw new HttpError(503, 'ssh_unavailable', error.message, { hint: error.hint });
  if (error instanceof HttpError) throw error;
  throw new HttpError(500, 'ssh_error', error instanceof Error ? error.message : String(error));
}

export function registerFileRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const sftp = () => ctx.sftp;

  app.get('/api/files/list', async (request) => {
    const { path } = parseOrThrow(pathQuery, request.query);
    return sftp()
      .list(normalizeRemotePath(path))
      .catch(sshErrorHandler);
  });

  app.get('/api/files/home', async () => {
    try {
      const result = await ctx.ssh.exec('printf %s "$HOME"', { timeoutMs: 10_000 });
      const home = result.stdout.trim();
      return { path: home.startsWith('/') ? normalizeRemotePath(home) : '/' };
    } catch (error) {
      sshErrorHandler(error);
    }
  });

  app.get('/api/files/stat', async (request) => {
    const { path } = parseOrThrow(pathQuery, request.query);
    return sftp()
      .stat(normalizeRemotePath(path))
      .catch(sshErrorHandler);
  });

  app.get('/api/files/read', async (request) => {
    const { path } = parseOrThrow(pathQuery, request.query);
    const remote = normalizeRemotePath(path);
    return sftp()
      .readText(remote)
      .then((r) => ({ path: remote, ...r }))
      .catch(sshErrorHandler);
  });

  app.put('/api/files/write', { bodyLimit: 3 * 1024 * 1024 }, async (request) => {
    const body = parseOrThrow(z.object({ path: remotePathSchema, content: z.string().max(2 * 1024 * 1024) }), request.body);
    return sftp()
      .writeText(normalizeRemotePath(body.path), body.content)
      .catch(sshErrorHandler);
  });

  app.get('/api/files/download', async (request, reply) => {
    const { path } = parseOrThrow(pathQuery, request.query);
    const remote = normalizeRemotePath(path);
    try {
      const { stream, size, name } = await sftp().readStream(remote);
      void reply.header('Content-Type', 'application/octet-stream');
      void reply.header('Content-Length', String(size));
      void reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`);
      void reply.header('Cache-Control', 'no-store');
      return reply.send(stream);
    } catch (error) {
      sshErrorHandler(error);
    }
  });

  /** Streams a raw file for in-app preview (images), with the right content type. */
  app.get('/api/files/raw', async (request, reply) => {
    const { path } = parseOrThrow(pathQuery, request.query);
    const remote = normalizeRemotePath(path);
    try {
      const { stream, size, name } = await sftp().readStream(remote);
      if (size > 50 * 1024 * 1024) throw new HttpError(413, 'too_large', 'File is too large to preview');
      const ext = name.split('.').pop()?.toLowerCase() ?? '';
      const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', pdf: 'application/pdf' };
      void reply.header('Content-Type', types[ext] ?? 'application/octet-stream');
      void reply.header('Content-Length', String(size));
      void reply.header('Cache-Control', 'no-store');
      void reply.header('X-Content-Type-Options', 'nosniff');
      if (ext === 'svg') void reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
      return reply.send(stream);
    } catch (error) {
      sshErrorHandler(error);
    }
  });

  app.post('/api/files/upload', { bodyLimit: 2 * 1024 * 1024 * 1024 }, async (request) => {
    const { dir } = parseOrThrow(z.object({ dir: remotePathSchema }), request.query);
    const directory = normalizeRemotePath(dir);
    const part = await request.file({ limits: { fileSize: 2 * 1024 * 1024 * 1024 } });
    if (!part) throw badRequest('No file uploaded');
    const name = validateEntryName(part.filename || 'upload');
    const target = joinRemote(directory, name);
    try {
      const sink = await sftp().writeStream(target);
      await pipeline(part.file, sink);
      if (part.file.truncated) throw new HttpError(413, 'too_large', 'Upload exceeded the size limit');
      return sftp().stat(target);
    } catch (error) {
      sshErrorHandler(error);
    }
  });

  app.post('/api/files/mkdir', async (request) => {
    const body = parseOrThrow(z.object({ dir: remotePathSchema, name: z.string().min(1).max(255) }), request.body);
    return sftp()
      .mkdir(joinRemote(normalizeRemotePath(body.dir), body.name))
      .catch(sshErrorHandler);
  });

  app.post('/api/files/rename', async (request) => {
    const body = parseOrThrow(z.object({ path: remotePathSchema, name: z.string().min(1).max(255) }), request.body);
    const from = normalizeRemotePath(body.path);
    const to = joinRemote(parentOf(from), body.name);
    if (from === to) return sftp().stat(from).catch(sshErrorHandler);
    return sftp()
      .rename(from, to)
      .catch(sshErrorHandler);
  });

  app.post('/api/files/delete', async (request) => {
    const body = parseOrThrow(z.object({ paths: z.array(remotePathSchema).min(1).max(200) }), request.body);
    const results: { path: string; ok: boolean; error?: string }[] = [];
    for (const raw of body.paths) {
      const remote = normalizeRemotePath(raw);
      if (remote === '/') {
        results.push({ path: remote, ok: false, error: 'Refusing to delete /' });
        continue;
      }
      try {
        await sftp().remove(remote);
        results.push({ path: remote, ok: true });
      } catch (error) {
        if (error instanceof SshUnavailableError) sshErrorHandler(error);
        results.push({ path: remote, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return { results };
  });
}
