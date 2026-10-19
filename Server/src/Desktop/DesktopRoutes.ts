import { createReadStream, existsSync, statSync } from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  ICON_CELLS,
  ICON_UPLOAD_MAX_BYTES,
  cellToPx,
  findFirstFree,
  pxToCell,
  proxyPortsFullMessage,
  WALLPAPER_UPLOAD_MAX_BYTES,
  appKeySchema,
  embedCheckSchema,
  settingsUpdateSchema,
  shortcutCreateSchema,
  shortcutPositionsSchema,
  shortcutUpdateSchema,
  widgetCreateSchema,
  widgetUpdateSchema,
  windowGeometrySchema,
  type DesktopBootstrap,
  type Shortcut,
  type Widget,
} from '@landscape/shared';
import type { ServerContext } from '../Context';
import { badRequest, conflict, notFound, parseOrThrow, tooLarge } from '../Http/Errors';
import { expectedOrigin } from '../Http/RequestUtils';
import { checkEmbeddable } from './EmbedCheck';
import { IconStore } from './IconStore';
import { WallpaperStore } from './Wallpapers';
import { mimeForFileName } from './DataFiles';
import { DEFAULT_WALLPAPER } from '../Db/Repositories/SettingsRepository';

const idParams = z.object({ id: z.string().regex(/^[a-z0-9]{1,64}$/) });
const fileParams = z.object({ file: z.string().min(1).max(128) });

export function registerDesktopRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const icons = new IconStore(ctx.config.dataDir);
  const wallpapers = new WallpaperStore(ctx.config.dataDir, ctx.config.clientDir);

  // ---- bootstrap -----------------------------------------------------------
  app.get('/api/desktop', async () => {
    const settings = ctx.repos.settings.get();
    const bootstrap: DesktopBootstrap = {
      shortcuts: ctx.repos.shortcuts.list(),
      widgets: ctx.repos.widgets.list(),
      settings,
      windowMemory: ctx.repos.windowMemory.all(),
      integrations: {
        ssh: ctx.ssh.configured,
        docker: ctx.docker.available,
        hostProc: existsSync(`${ctx.config.hostProc}/stat`),
        hostSys: existsSync(`${ctx.config.hostSys}/class`),
      },
      proxy: ctx.proxy.range,
      version: ctx.config.version,
    };
    return bootstrap;
  });

  // ---- shortcuts -----------------------------------------------------------
  app.get('/api/shortcuts', async () => ctx.repos.shortcuts.list());

  app.post('/api/shortcuts/check-embed', async (request) => {
    const { url } = parseOrThrow(embedCheckSchema, request.body);
    const result = await checkEmbeddable(url, expectedOrigin(request));
    return { status: result.status, reason: result.reason, finalUrl: result.finalUrl, title: result.title };
  });

  app.post('/api/shortcuts', async (request, reply) => {
    const input = parseOrThrow(shortcutCreateSchema, request.body);
    const position =
      input.x !== undefined && input.y !== undefined ? { x: input.x, y: input.y } : freeSlot(ctx.repos.shortcuts.list(), ctx.repos.widgets.list());
    const check = await checkEmbeddable(input.url, expectedOrigin(request));
    if (!ctx.proxy.hasRoomFor({ id: '', openMode: input.openMode, embeddable: check.status, proxyPort: null, createdAt: new Date().toISOString() })) {
      throw conflict(proxyPortsFullMessage(ctx.proxy.total));
    }
    const created = ctx.repos.shortcuts.create({
      name: input.name,
      url: input.url,
      iconMode: input.iconMode,
      iconFile: input.iconMode === 'upload' ? (input.iconFile ?? null) : null,
      x: position.x,
      y: position.y,
      embeddable: check.status,
      embedReason: check.reason,
      openMode: input.openMode,
    });
    ctx.proxy.reconcile();
    if (created.iconMode === 'favicon') {
      const file = await icons.fetchFavicon(created.id, created.url, check.html, check.finalUrl).catch(() => null);
      ctx.repos.shortcuts.update(created.id, { iconFile: file });
    }
    void reply.status(201);
    return ctx.repos.shortcuts.find(created.id) ?? created;
  });

  app.patch('/api/shortcuts/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const existing = ctx.repos.shortcuts.find(id);
    if (!existing) throw notFound('Shortcut not found');
    const input = parseOrThrow(shortcutUpdateSchema, request.body);

    const urlChanged = input.url !== undefined && input.url !== existing.url;
    const iconModeChanged = input.iconMode !== undefined && input.iconMode !== existing.iconMode;
    let embed: { embeddable?: Shortcut['embeddable']; embedReason?: string; embedCheckedAt?: string } = {};
    let html: string | null = null;
    let finalUrl: string | null = null;
    if (urlChanged) {
      const check = await checkEmbeddable(input.url as string, expectedOrigin(request));
      embed = { embeddable: check.status, embedReason: check.reason, embedCheckedAt: new Date().toISOString() };
      html = check.html;
      finalUrl = check.finalUrl;
    }

    // A new target origin means a new proxy assignment: the old cookies belong to the old service.
    const originChanged = urlChanged && new URL(input.url as string).origin !== new URL(existing.url).origin;
    const next = {
      id,
      openMode: input.openMode ?? existing.openMode,
      embeddable: embed.embeddable ?? existing.embeddable,
      proxyPort: originChanged ? null : existing.proxyPort,
      createdAt: existing.createdAt,
    };
    if (!ctx.proxy.hasRoomFor(next)) throw conflict(proxyPortsFullMessage(ctx.proxy.total));

    let iconFile: string | null | undefined = undefined;
    const nextMode = input.iconMode ?? existing.iconMode;
    if (nextMode === 'upload') {
      if (input.iconFile !== undefined && input.iconFile !== existing.iconFile) {
        if (existing.iconMode === 'upload') icons.delete(existing.iconFile);
        iconFile = input.iconFile;
      }
      if (existing.iconMode === 'favicon') icons.deleteFaviconsFor(existing.id);
    } else if (nextMode === 'favicon' && (urlChanged || iconModeChanged)) {
      if (existing.iconMode === 'upload') icons.delete(existing.iconFile);
      iconFile = await icons.fetchFavicon(existing.id, input.url ?? existing.url, html, finalUrl).catch(() => null);
    }

    if (originChanged) ctx.proxy.release(id);
    ctx.repos.shortcuts.update(id, {
      name: input.name,
      url: input.url,
      iconMode: input.iconMode,
      iconFile,
      openMode: input.openMode,
      x: input.x,
      y: input.y,
      ...embed,
    });
    ctx.proxy.reconcile();
    return ctx.repos.shortcuts.find(id);
  });

  app.post('/api/shortcuts/:id/recheck', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const existing = ctx.repos.shortcuts.find(id);
    if (!existing) throw notFound('Shortcut not found');
    // Always the direct result, also for proxied shortcuts: it explains why the proxy is used.
    const check = await checkEmbeddable(existing.url, expectedOrigin(request));
    ctx.repos.shortcuts.update(id, {
      embeddable: check.status,
      embedReason: check.reason,
      embedCheckedAt: new Date().toISOString(),
    });
    ctx.proxy.reconcile();
    return ctx.repos.shortcuts.find(id);
  });

  app.post('/api/shortcuts/:id/refresh-icon', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const existing = ctx.repos.shortcuts.find(id);
    if (!existing) throw notFound('Shortcut not found');
    if (existing.iconMode !== 'favicon') throw badRequest('This shortcut uses an uploaded icon');
    const file = await icons.fetchFavicon(existing.id, existing.url, null, null).catch(() => null);
    return ctx.repos.shortcuts.update(id, { iconFile: file });
  });

  app.put('/api/shortcuts/positions', async (request) => {
    const { positions } = parseOrThrow(shortcutPositionsSchema, request.body);
    ctx.repos.shortcuts.updatePositions(positions);
    return { ok: true };
  });

  app.delete('/api/shortcuts/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const existing = ctx.repos.shortcuts.find(id);
    if (!existing) throw notFound('Shortcut not found');
    if (existing.iconMode === 'upload') icons.delete(existing.iconFile);
    icons.deleteFaviconsFor(existing.id);
    ctx.repos.shortcuts.delete(id);
    ctx.repos.windowMemory.delete(`shortcut:${id}`);
    ctx.proxy.reconcile();
    return { ok: true };
  });

  // ---- uploads & served files ---------------------------------------------
  app.post('/api/uploads/icon', async (request) => {
    const part = await request.file({ limits: { fileSize: ICON_UPLOAD_MAX_BYTES } });
    if (!part) throw badRequest('No file uploaded');
    const bytes = await part.toBuffer().catch(() => {
      throw tooLarge('Icons must be 2 MB or smaller');
    });
    if (part.file.truncated) throw tooLarge('Icons must be 2 MB or smaller');
    try {
      const saved = icons.saveUpload(bytes);
      return { file: saved.fileName, url: `/icons/${saved.fileName}` };
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Invalid image');
    }
  });

  app.get('/icons/:file', async (request, reply) => {
    const { file } = parseOrThrow(fileParams, request.params);
    let full: string;
    try {
      full = icons.resolve(file);
    } catch {
      throw notFound();
    }
    return sendImage(reply, full, file, 'private, max-age=0, must-revalidate');
  });

  app.get('/wallpapers/:kind/:file', async (request, reply) => {
    const params = parseOrThrow(z.object({ kind: z.enum(['bundled', 'upload']), file: z.string().min(1).max(128) }), request.params);
    if (!wallpapers.exists(params.kind, params.file)) throw notFound();
    return sendImage(reply, wallpapers.resolve(params.kind, params.file), params.file, 'private, max-age=86400');
  });

  // ---- wallpapers -----------------------------------------------------------
  app.get('/api/wallpapers', async () => wallpapers.list());

  app.post('/api/uploads/wallpaper', async (request) => {
    const part = await request.file({ limits: { fileSize: WALLPAPER_UPLOAD_MAX_BYTES } });
    if (!part) throw badRequest('No file uploaded');
    const bytes = await part.toBuffer().catch(() => {
      throw tooLarge('Wallpapers must be 20 MB or smaller');
    });
    if (part.file.truncated) throw tooLarge('Wallpapers must be 20 MB or smaller');
    try {
      return wallpapers.saveUpload(bytes, part.filename || 'wallpaper');
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'Invalid image');
    }
  });

  app.delete('/api/wallpapers/:file', async (request) => {
    const { file } = parseOrThrow(fileParams, request.params);
    if (!wallpapers.deleteUpload(file)) throw notFound('Wallpaper not found');
    const settings = ctx.repos.settings.get();
    if (settings.wallpaper.kind === 'upload' && settings.wallpaper.file === file) {
      ctx.repos.settings.update({ wallpaper: DEFAULT_WALLPAPER });
    }
    return { ok: true };
  });

  // ---- widgets ---------------------------------------------------------------
  app.post('/api/widgets', async (request, reply) => {
    const input = parseOrThrow(widgetCreateSchema, request.body);
    void reply.status(201);
    return ctx.repos.widgets.create(input.type, input.x, input.y, input.settings ?? {});
  });

  app.patch('/api/widgets/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    const input = parseOrThrow(widgetUpdateSchema, request.body);
    const updated = ctx.repos.widgets.update(id, input);
    if (!updated) throw notFound('Widget not found');
    return updated;
  });

  app.delete('/api/widgets/:id', async (request) => {
    const { id } = parseOrThrow(idParams, request.params);
    if (!ctx.repos.widgets.delete(id)) throw notFound('Widget not found');
    return { ok: true };
  });

  // ---- window memory ------------------------------------------------------
  app.put('/api/window-memory/:appKey', async (request) => {
    const { appKey } = parseOrThrow(z.object({ appKey: appKeySchema }), request.params);
    const geometry = parseOrThrow(windowGeometrySchema, request.body);
    ctx.repos.windowMemory.set(appKey, geometry);
    return { ok: true };
  });

  // ---- settings -------------------------------------------------------------
  app.get('/api/settings', async () => ctx.repos.settings.get());

  app.patch('/api/settings', async (request) => {
    const input = parseOrThrow(settingsUpdateSchema, request.body);
    if (input.wallpaper && !wallpapers.exists(input.wallpaper.kind, input.wallpaper.file)) {
      throw badRequest('Wallpaper not found');
    }
    return ctx.repos.settings.update(input);
  });
}

function sendImage(reply: FastifyReply, fullPath: string, fileName: string, cacheControl: string) {
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    throw notFound();
  }
  if (!stats.isFile()) throw notFound();
  const mime = mimeForFileName(fileName);
  void reply.header('Content-Type', mime);
  void reply.header('Cache-Control', cacheControl);
  void reply.header('X-Content-Type-Options', 'nosniff');
  void reply.header('ETag', `"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`);
  if (mime === 'image/svg+xml') {
    // Served only for <img>; this CSP neutralises any script even if an SVG slipped through.
    void reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    void reply.header('Content-Disposition', 'inline');
  }
  return reply.send(createReadStream(fullPath));
}

/**
 * Fallback placement when the client sends no position (the client normally
 * picks the cell, since only it knows the viewport and widget sizes).
 * Assumes a 1080p-ish desktop and reserves 3×2 icon cells per widget.
 */
function freeSlot(shortcuts: Shortcut[], widgets: Widget[]): { x: number; y: number } {
  const bounds = { cols: 19, rows: 8 };
  const occupied = [
    ...shortcuts.map((s) => ({ ...pxToCell(s.x, s.y), ...ICON_CELLS })),
    ...widgets.map((w) => ({ ...pxToCell(w.x, w.y), cols: 3, rows: 2 })),
  ];
  const spot = findFirstFree(ICON_CELLS.cols, ICON_CELLS.rows, occupied, bounds);
  return cellToPx(spot.col, spot.row);
}
