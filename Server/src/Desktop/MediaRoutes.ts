import { createReadStream, statSync } from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CURSOR_UPLOAD_MAX_BYTES, STARTUP_IMAGE_MAX_BYTES, STARTUP_SOUND_MAX_BYTES, STARTUP_VIDEO_MAX_BYTES } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { badRequest, notFound, parseOrThrow, tooLarge } from '../Http/Errors';
import { MEDIA_MIME, MediaStore, type MediaKind } from './MediaStore';
import { mimeForFileName } from './DataFiles';

const LIMITS: Record<MediaKind, { bytes: number; label: string }> = {
  image: { bytes: STARTUP_IMAGE_MAX_BYTES, label: '5 MB' },
  video: { bytes: STARTUP_VIDEO_MAX_BYTES, label: '15 MB' },
  sound: { bytes: STARTUP_SOUND_MAX_BYTES, label: '2 MB' },
  cursor: { bytes: CURSOR_UPLOAD_MAX_BYTES, label: '256 KB' },
};

const kindParams = z.object({ kind: z.enum(['image', 'video', 'sound', 'cursor']) });
const fileParams = z.object({ file: z.string().min(1).max(128) });

/**
 * Uploads and files for the startup animation and custom cursors.
 * `/startup/*` is public because the animation can play before login (the
 * owner chose to show these files on the boot screen); `/cursors/*` needs a
 * session like the icons.
 */
export function registerMediaRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const media = new MediaStore(ctx.config.dataDir);

  app.post('/api/uploads/media/:kind', async (request) => {
    const { kind } = parseOrThrow(kindParams, request.params);
    const limit = LIMITS[kind];
    const part = await request.file({ limits: { fileSize: limit.bytes } });
    if (!part) throw badRequest('No file uploaded');
    const bytes = await part.toBuffer().catch(() => {
      throw tooLarge(`${kind === 'cursor' ? 'Cursors' : 'Files'} must be ${limit.label} or smaller`);
    });
    if (part.file.truncated) throw tooLarge(`${kind === 'cursor' ? 'Cursors' : 'Files'} must be ${limit.label} or smaller`);
    try {
      const saved = media.save(kind, bytes);
      return { file: saved.fileName, mime: saved.mime, url: kind === 'cursor' ? `/cursors/${saved.fileName}` : `/startup/${saved.fileName}` };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Invalid file');
    }
  });

  app.delete('/api/uploads/media/:kind/:file', async (request) => {
    const { kind } = parseOrThrow(kindParams, request.params);
    const { file } = parseOrThrow(fileParams, request.params);
    if (!media.exists(kind, file)) throw notFound('File not found');
    media.delete(kind, file);
    return { ok: true };
  });

  app.get('/api/uploads/media', async () => ({
    image: media.list('image'),
    video: media.list('video'),
    sound: media.list('sound'),
    cursor: media.list('cursor'),
  }));

  app.get('/startup/:file', async (request, reply) => {
    const { file } = parseOrThrow(fileParams, request.params);
    const kind = (['image', 'video', 'sound'] as MediaKind[]).find((k) => file.startsWith(`${k}-`));
    if (!kind || !media.exists(kind, file)) throw notFound();
    return sendMedia(reply, media.resolve(kind, file), file, 'public, max-age=86400');
  });

  app.get('/cursors/:file', async (request, reply) => {
    const { file } = parseOrThrow(fileParams, request.params);
    if (!file.startsWith('cursor-') || !media.exists('cursor', file)) throw notFound();
    return sendMedia(reply, media.resolve('cursor', file), file, 'private, max-age=86400');
  });
}

function sendMedia(reply: FastifyReply, fullPath: string, fileName: string, cacheControl: string) {
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    throw notFound();
  }
  if (!stats.isFile()) throw notFound();
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const mime = MEDIA_MIME[ext] ?? mimeForFileName(fileName);
  void reply.header('Content-Type', mime);
  void reply.header('Cache-Control', cacheControl);
  void reply.header('X-Content-Type-Options', 'nosniff');
  void reply.header('Content-Length', stats.size);
  void reply.header('ETag', `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`);
  if (mime === 'image/svg+xml') {
    void reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    void reply.header('Content-Disposition', 'inline');
  }
  return reply.send(createReadStream(fullPath));
}
