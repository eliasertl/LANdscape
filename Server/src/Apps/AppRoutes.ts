import { createReadStream, statSync } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  APP_ID_PATTERN,
  appFetchSchema,
  appInstallSchema,
  appStorageKeySchema,
  appTrustSchema,
  bundlePath,
  fetchAllowed,
  isAllowed,
  sshExecSchema,
  type InstalledApp,
  type Permission,
} from '@landscape/shared';
import type { ServerContext } from '../Context';
import { HttpError, badRequest, forbidden, notFound, parseOrThrow, tooLarge, unavailable } from '../Http/Errors';
import { mimeForFileName } from '../Desktop/DataFiles';
import { assertHttpUrl, fetchFollowing, readBodyLimited } from '../Desktop/SafeFetch';
import { AppInstallError, AppStore, resolveBundleFile } from './AppStore';
import { BUNDLE_MAX_BYTES } from './Catalog';
import { FRAME_CSP, buildFrameDocument } from './FrameInjector';

const appParams = z.object({ id: z.string().regex(APP_ID_PATTERN) });
const SURFACES = ['window', 'widget', 'tray', 'taskbar', 'startup', 'background'] as const;
const frameParams = z.object({ id: z.string().regex(APP_ID_PATTERN), surface: z.enum(SURFACES), surfaceId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/) });
const frameQuery = z.object({ nonce: z.string().regex(/^[a-f0-9]{32}$/), params: z.string().max(8192).optional(), phone: z.enum(['0', '1']).default('0') });
const STORAGE_VALUE_MAX = 256 * 1024;
const STORAGE_APP_MAX = 20 * 1024 * 1024;
const FETCH_MAX_BYTES = 5 * 1024 * 1024;

function installError(error: unknown): never {
  if (error instanceof AppInstallError) {
    if (error.code === 'not_found') throw notFound(error.message);
    if (error.code === 'permissions_required') throw new HttpError(409, 'permissions_required', error.message, error.details);
    if (error.code === 'checksum_mismatch') throw new HttpError(409, 'checksum_mismatch', error.message);
    throw badRequest(error.message);
  }
  throw error;
}

/** Permission check for routes apps reach through the broker (`X-LANdscape-App`); direct calls from the desktop carry no header. */
function requireAppPermission(ctx: ServerContext, request: FastifyRequest, app: InstalledApp, permission: Permission): void {
  if (!isAllowed(app.granted, app.trusted, permission)) throw forbidden(`${app.manifest.name} does not have the ${permission} permission`);
  void ctx;
  void request;
}

/**
 * Catalog apps: install, update, uninstall, trust, per-app storage,
 * server-side fetch, the sandboxed frame document and bundle files.
 */
export function registerAppRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const store = ctx.apps;

  const withApp = (request: FastifyRequest): InstalledApp => {
    const { id } = parseOrThrow(appParams, request.params);
    const installed = store.find(id);
    if (!installed) throw notFound('App not found');
    return installed;
  };

  // ---- installed apps and the catalog ---------------------------------------
  app.get('/api/apps', async () => {
    const catalog = await ctx.catalog.get();
    return {
      apps: store.list().map((installed) => ({
        ...installed,
        bundle: store.bundleInfo(installed),
        update: AppStore.updateAvailable(installed, catalog.index.apps),
      })),
    };
  });

  app.get('/api/catalog', async (request) => {
    const { refresh } = parseOrThrow(z.object({ refresh: z.enum(['0', '1']).default('0') }), request.query);
    const result = await ctx.catalog.get(refresh === '1');
    return { ...result.index, source: result.source, error: result.error, url: ctx.config.catalogUrl };
  });

  app.post('/api/apps/install', async (request, reply) => {
    const input = parseOrThrow(appInstallSchema, request.body);
    let buffer: Buffer;
    let expectedSha256: string | null = null;
    try {
      if (input.source === 'catalog') {
        const catalog = await ctx.catalog.get();
        const entry = catalog.index.apps.find((a) => a.id === input.id);
        if (!entry) throw notFound(`${input.id} is not in the catalog`);
        buffer = await ctx.catalog.fetchBundle(entry);
        expectedSha256 = entry.sha256;
      } else {
        buffer = await ctx.catalog.download(input.url);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw badRequest(`Could not download the bundle: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      const installed = store.install(buffer, { source: input.source, approve: input.approve, trusted: input.trusted, expectedSha256 });
      void reply.status(201);
      return installed;
    } catch (error) {
      installError(error);
    }
  });

  /** Zip upload: multipart `file`, plus `approve` (JSON array or "all") and `trusted` ("1") fields. */
  app.post('/api/apps/upload', async (request, reply) => {
    const part = await request.file({ limits: { fileSize: BUNDLE_MAX_BYTES } });
    if (!part) throw badRequest('No file uploaded');
    const bytes = await part.toBuffer().catch(() => {
      throw tooLarge('Bundles must be 20 MB or smaller');
    });
    if (part.file.truncated) throw tooLarge('Bundles must be 20 MB or smaller');
    const fields = part.fields as Record<string, { value?: unknown } | undefined>;
    const field = (name: string): string => {
      const value = fields[name]?.value;
      return typeof value === 'string' ? value : '';
    };
    const approveRaw = field('approve') || '[]';
    let approve: Permission[] | 'all';
    try {
      approve = approveRaw === 'all' ? 'all' : (parseOrThrow(z.array(z.string()).max(20), JSON.parse(approveRaw)) as Permission[]);
    } catch {
      throw badRequest('approve must be "all" or a JSON array of permissions');
    }
    const trusted = field('trusted') === '1';
    try {
      const installed = store.install(bytes, { source: 'upload', approve, trusted });
      void reply.status(201);
      return installed;
    } catch (error) {
      installError(error);
    }
  });

  /** Inspects a bundle without installing it (the install dialog shows name, version and permissions). */
  app.post('/api/apps/inspect', async (request) => {
    const input = parseOrThrow(z.object({ url: z.string().url().max(2048) }), request.body);
    let buffer: Buffer;
    try {
      buffer = await ctx.catalog.download(input.url);
    } catch (error) {
      throw badRequest(`Could not download the bundle: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      const { prepareBundle } = await import('./AppStore');
      const bundle = prepareBundle(buffer);
      return { manifest: bundle.manifest, sha256: bundle.sha256, size: bundle.size };
    } catch (error) {
      installError(error);
    }
  });

  app.patch('/api/apps/:id', async (request) => {
    const installed = withApp(request);
    const input = parseOrThrow(appTrustSchema, request.body);
    try {
      return store.setTrust(installed.id, input);
    } catch (error) {
      installError(error);
    }
  });

  app.delete('/api/apps/:id', async (request) => {
    const installed = withApp(request);
    try {
      store.uninstall(installed.id);
    } catch (error) {
      installError(error);
    }
    return { ok: true };
  });

  // ---- per-app storage ---------------------------------------------------------
  const storageParams = z.object({ id: z.string().regex(APP_ID_PATTERN), key: appStorageKeySchema });

  app.get('/api/apps/:id/storage', async (request) => {
    const installed = withApp(request);
    requireAppPermission(ctx, request, installed, 'storage');
    const { prefix } = parseOrThrow(z.object({ prefix: z.string().max(128).default('') }), request.query);
    return { keys: ctx.repos.apps.storageKeys(installed.id, prefix), bytes: ctx.repos.apps.storageBytes(installed.id) };
  });

  app.get('/api/apps/:id/storage/:key', async (request) => {
    const installed = withApp(request);
    requireAppPermission(ctx, request, installed, 'storage');
    const { key } = parseOrThrow(storageParams, request.params);
    return { value: ctx.repos.apps.storageGet(installed.id, key) };
  });

  app.put('/api/apps/:id/storage/:key', async (request) => {
    const installed = withApp(request);
    requireAppPermission(ctx, request, installed, 'storage');
    const { key } = parseOrThrow(storageParams, request.params);
    const { value } = parseOrThrow(z.object({ value: z.unknown() }), request.body);
    const encoded = JSON.stringify(value ?? null);
    if (encoded.length > STORAGE_VALUE_MAX) throw tooLarge('Storage values must be 256 KB or smaller');
    if (ctx.repos.apps.storageBytes(installed.id) + encoded.length > STORAGE_APP_MAX) throw tooLarge('This app has used its 20 MB of storage');
    ctx.repos.apps.storageSet(installed.id, key, value ?? null);
    return { ok: true };
  });

  app.delete('/api/apps/:id/storage/:key', async (request) => {
    const installed = withApp(request);
    requireAppPermission(ctx, request, installed, 'storage');
    const { key } = parseOrThrow(storageParams, request.params);
    return { ok: true, removed: ctx.repos.apps.storageDelete(installed.id, key) };
  });

  // ---- server-side fetch for apps -------------------------------------------------
  app.post('/api/apps/:id/fetch', async (request) => {
    const installed = withApp(request);
    requireAppPermission(ctx, request, installed, 'net:fetch');
    const input = parseOrThrow(appFetchSchema, request.body);
    if (!fetchAllowed(input.url, installed.manifest.net.hosts, installed.trusted)) {
      throw forbidden(`${installed.manifest.name} may not fetch ${new URL(input.url).hostname}; the manifest only allows ${installed.manifest.net.hosts.join(', ') || 'no hosts'}.`);
    }
    const url = assertHttpUrl(input.url);
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(input.headers)) {
      if (!/^(cookie|authorization|host|origin|referer|proxy-|sec-|x-forwarded)/i.test(name)) headers[name] = value;
    }
    try {
      const { response } = await fetchFollowing(url, { accept: headers.accept ?? '*/*', method: input.method === 'GET' ? 'GET' : 'GET', timeoutMs: 15_000, extraHeaders: headers, body: input.body, overrideMethod: input.method });
      const body = await readBodyLimited(response, FETCH_MAX_BYTES);
      const out: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (!/^set-cookie$/i.test(name)) out[name] = value;
      });
      return { status: response.status, headers: out, body: body.toString('utf8') };
    } catch (error) {
      throw unavailable('fetch_failed', error instanceof Error ? error.message : String(error));
    }
  });

  // ---- SSH exec for apps (and the command palette) ----------------------------------
  app.post('/api/ssh/exec', async (request) => {
    const appHeader = request.headers['x-landscape-app'];
    if (typeof appHeader === 'string') {
      const installed = store.find(appHeader);
      if (!installed) throw notFound('App not found');
      requireAppPermission(ctx, request, installed, 'ssh:exec');
    }
    if (!ctx.ssh.configured) throw unavailable('ssh_unavailable', 'SSH is not configured');
    const input = parseOrThrow(sshExecSchema, request.body);
    const result = await ctx.ssh.exec(input.command, { timeoutMs: input.timeoutMs });
    request.log.info({ app: typeof appHeader === 'string' ? appHeader : null, command: input.command.slice(0, 200) }, 'SSH command');
    return result;
  });

  // ---- the frame document and bundle files -----------------------------------------
  app.get('/apps/frame/:id/:surface/:surfaceId', async (request, reply) => {
    const { id, surface, surfaceId } = parseOrThrow(frameParams, request.params);
    const query = parseOrThrow(frameQuery, request.query);
    const installed = store.find(id);
    if (!installed) throw notFound('App not found');
    const entry = frameEntry(installed, surface, surfaceId);
    if (!entry) throw notFound('This app has no such surface');
    const html = store.readFile(installed, entry);
    if (!html) throw notFound('Entry file missing');
    let params: Record<string, unknown> = {};
    if (query.params) {
      try {
        params = JSON.parse(query.params) as Record<string, unknown>;
      } catch {
        throw badRequest('params must be JSON');
      }
    }
    const settings = ctx.repos.settings.get();
    const context = {
      appId: installed.id,
      appName: installed.manifest.name,
      version: installed.version,
      surface,
      surfaceId,
      nonce: query.nonce,
      params,
      theme: settings.theme === 'system' ? 'light' : settings.theme,
      tokens: {},
      permissions: installed.trusted ? installed.manifest.permissions : installed.granted,
      phone: query.phone === '1',
    };
    const entryDir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : '';
    const document = buildFrameDocument({ html: html.toString('utf8'), read: (file) => store.readFile(installed, file), entryDir, context, runtime: ctx.sdkRuntime });
    void reply.header('Content-Type', 'text/html; charset=utf-8');
    void reply.header('Content-Security-Policy', FRAME_CSP);
    void reply.header('Cache-Control', 'no-store');
    void reply.header('X-Frame-Options', 'SAMEORIGIN');
    void reply.header('Referrer-Policy', 'no-referrer');
    return document;
  });

  /** Static bundle files for the host itself (app icons, wallpapers, cursor images); never for the frames. */
  app.get('/apps/files/:id/*', async (request, reply) => {
    const { id } = parseOrThrow(appParams, request.params);
    const rest = parseOrThrow(z.object({ '*': bundlePath }), request.params)['*'];
    const installed = store.find(id);
    if (!installed) throw notFound('App not found');
    const full = resolveBundleFile(store, installed, rest);
    if (!full) throw notFound();
    return sendBundleFile(reply, full, rest);
  });
}

function frameEntry(app: InstalledApp, surface: (typeof SURFACES)[number], surfaceId: string): string | null {
  const c = app.manifest.contributes;
  switch (surface) {
    case 'window':
      return c.windows.find((w) => w.id === surfaceId)?.entry ?? null;
    case 'widget':
      return c.widgets.find((w) => w.id === surfaceId)?.entry ?? null;
    case 'tray':
      return c.trayItems.find((t) => t.id === surfaceId)?.entry ?? null;
    case 'taskbar':
      return c.taskbarItems.find((t) => t.id === surfaceId)?.entry ?? null;
    case 'startup':
      return c.startupAnimations.find((s) => s.id === surfaceId)?.entry ?? null;
    default:
      return c.background?.entry ?? null;
  }
}

function sendBundleFile(reply: FastifyReply, fullPath: string, fileName: string) {
  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    throw notFound();
  }
  if (!stats.isFile()) throw notFound();
  const mime = mimeForFileName(fileName);
  // Only images and fonts are served this way; everything else is inlined into frames.
  if (!/^(image|font)\//.test(mime) && !/\.(woff2?|ttf|otf)$/i.test(fileName)) throw notFound();
  void reply.header('Content-Type', mime);
  void reply.header('Cache-Control', 'private, max-age=3600');
  void reply.header('X-Content-Type-Options', 'nosniff');
  if (mime === 'image/svg+xml') void reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
  return reply.send(createReadStream(fullPath));
}
