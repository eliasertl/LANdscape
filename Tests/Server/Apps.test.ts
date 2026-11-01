import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { InstalledApp } from '@landscape/shared';
import { compareVersions, fetchAllowed, isAllowed, newPermissions, parseManifest } from '@landscape/shared';
import { readZip, ZipError } from '@server/Apps/Zip';
import { writeZip } from '@server/Apps/ZipWriter';
import { prepareBundle } from '@server/Apps/AppStore';
import { buildFrameDocument, FRAME_CSP } from '@server/Apps/FrameInjector';
import { CatalogService } from '@server/Apps/Catalog';
import { createTestApp, loginCookie, type TestApp } from './TestApp';

const sameOrigin = { origin: 'http://localhost', host: 'localhost' };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demo-app',
    name: 'Demo App',
    version: '1.0.0',
    author: 'Tests',
    description: 'A test bundle',
    icon: 'icon.png',
    permissions: ['storage', 'notifications'],
    contributes: {
      windows: [{ id: 'main', entry: 'index.html', defaultSize: { width: 500, height: 400 } }],
      widgets: [{ id: 'tile', name: 'Demo tile', entry: 'widget.html', sizes: { m: { cols: 2, rows: 1 } } }],
      actions: [{ id: 'hello', title: 'Say hello' }],
    },
    ...overrides,
  };
}

function bundle(m: Record<string, unknown> = manifest(), extra: { name: string; data: Buffer | string }[] = []) {
  return writeZip([
    { name: 'manifest.json', data: JSON.stringify(m) },
    { name: 'icon.png', data: PNG },
    { name: 'index.html', data: '<!doctype html><html><head><link rel="stylesheet" href="app.css"><script src="app.js"></script></head><body><img src="icon.png"><h1>Demo</h1></body></html>' },
    { name: 'widget.html', data: '<p>tile</p>' },
    { name: 'app.css', data: 'body { background: url(icon.png); }' },
    { name: 'app.js', data: 'console.log("</script>hi")' },
    ...extra,
  ]);
}

describe('zip reader', () => {
  it('round-trips files and rejects unsafe paths and corrupt data', () => {
    const entries = readZip(writeZip([{ name: 'a/b.txt', data: 'hello' }, { name: 'c.bin', data: Buffer.from([1, 2, 3]) }]));
    expect(entries.map((e) => [e.name, e.data.toString('latin1')])).toEqual([['a/b.txt', 'hello'], ['c.bin', '\u0001\u0002\u0003']]);
    expect(() => readZip(writeZip([{ name: '../evil.txt', data: 'x' }]))).toThrow(ZipError);
    expect(() => readZip(writeZip([{ name: '/abs.txt', data: 'x' }]))).toThrow(/Unsafe path/);
    expect(() => readZip(Buffer.from('not a zip at all, really not'))).toThrow(ZipError);
    expect(() => readZip(writeZip([{ name: 'big.txt', data: 'x'.repeat(100) }]), { maxEntries: 10, maxTotalBytes: 50, maxEntryBytes: 1000 })).toThrow(/larger/);
  });
});

describe('manifest and permissions', () => {
  it('parses a manifest with defaults and rejects bad ones with a readable message', () => {
    const ok = parseManifest(JSON.stringify(manifest()));
    expect(ok.manifest?.contributes.windows[0]).toMatchObject({ id: 'main', single: true });
    expect(ok.manifest?.net.hosts).toEqual([]);
    expect(parseManifest('{').error).toMatch(/valid JSON/);
    expect(parseManifest(JSON.stringify(manifest({ id: 'Bad Id' }))).error).toMatch(/id/);
    expect(parseManifest(JSON.stringify(manifest({ version: 'one' }))).error).toMatch(/semantic/);
    expect(parseManifest(JSON.stringify(manifest({ permissions: ['root'] }))).error).toMatch(/permissions/);
    expect(parseManifest(JSON.stringify(manifest({ contributes: { windows: [{ id: 'x', entry: '../escape.html' }] } }))).error).toMatch(/entry/);
    expect(parseManifest(JSON.stringify({ ...manifest(), extra: 1 })).error).toMatch(/Unrecognized|extra/i);
  });

  it('decides permissions and fetch hosts', () => {
    expect(isAllowed(['storage'], false, 'storage')).toBe(true);
    expect(isAllowed(['storage'], false, 'ssh:exec')).toBe(false);
    expect(isAllowed([], true, 'ssh:exec')).toBe(true);
    expect(newPermissions(['storage'], ['storage', 'docker:write'])).toEqual(['docker:write']);
    expect(fetchAllowed('https://api.open-meteo.com/v1/forecast', ['api.open-meteo.com'], false)).toBe(true);
    expect(fetchAllowed('https://evil.com/', ['api.open-meteo.com'], false)).toBe(false);
    expect(fetchAllowed('https://a.b.example.com/', ['*.example.com'], false)).toBe(true);
    expect(fetchAllowed('https://example.com/', ['*.example.com'], false)).toBe(true);
    expect(fetchAllowed('ftp://example.com/', ['example.com'], true)).toBe(false);
    expect(fetchAllowed('https://anything.net/', [], true)).toBe(true);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('validates a bundle: manifest, referenced files, image types and SVG safety', () => {
    expect(prepareBundle(bundle()).manifest.id).toBe('demo-app');
    expect(() => prepareBundle(writeZip([{ name: 'x.txt', data: 'x' }]))).toThrow(/manifest.json/);
    expect(() => prepareBundle(bundle(manifest({ icon: 'missing.png' })))).toThrow(/missing.png/);
    expect(() => prepareBundle(bundle(manifest(), [{ name: 'fake.png', data: 'not a png' }]))).toThrow(/image type/);
    expect(() => prepareBundle(bundle(manifest(), [{ name: 'bad.svg', data: '<svg onload="alert(1)"></svg>' }]))).toThrow(/scripts/);
    // A zip of a folder (everything under one directory) is fine.
    const nested = writeZip([{ name: 'demo-app/manifest.json', data: JSON.stringify(manifest({ icon: undefined, contributes: { windows: [{ id: 'main', entry: 'index.html' }] } })) }, { name: 'demo-app/index.html', data: '<p>x</p>' }]);
    expect(prepareBundle(nested).entries.map((e) => e.name)).toEqual(['manifest.json', 'index.html']);
  });
});

describe('frame injection', () => {
  it('inlines local scripts, styles and images, drops external ones, and injects the runtime safely', () => {
    const files = new Map<string, Buffer>([
      ['index.html', Buffer.from('<!doctype html><html><head><link rel="stylesheet" href="app.css"><script src="https://cdn.example/x.js"></script><script src="app.js"></script></head><body><img src="icon.png"></body></html>')],
      ['app.css', Buffer.from('body{background:url("icon.png")}')],
      ['app.js', Buffer.from('console.log("</script>")')],
      ['icon.png', PNG],
    ]);
    const html = buildFrameDocument({ html: files.get('index.html')!.toString(), read: (p) => files.get(p) ?? null, entryDir: '', context: { appId: 'demo-app', nonce: 'n' }, runtime: 'window.landscape={}' });
    expect(html).toContain('<style>body{background:url("data:image/png;base64,');
    expect(html).toContain('<script>console.log("<\\/script>")</script>');
    expect(html).toContain('external script removed');
    expect(html).not.toContain('cdn.example');
    expect(html).toContain('<img src="data:image/png;base64,');
    expect(html).toContain('window.__landscapeFrame={"appId":"demo-app","nonce":"n"}');
    expect(html).not.toContain('<base');
    expect(FRAME_CSP).toContain("base-uri 'none'");
    expect(FRAME_CSP).toContain("connect-src 'none'");
    expect(FRAME_CSP).toContain("default-src 'none'");
  });
});

describe('apps API', () => {
  let app: TestApp;
  let cookie: string;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.app.inject({ method, url, headers: { ...sameOrigin, cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
  const upload = (zip: Buffer, approve = 'all', trusted = '0') => {
    const boundary = 'bnd';
    const field = (name: string, value: string) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    const payload = Buffer.concat([
      Buffer.from(field('approve', approve) + field('trusted', trusted) + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="app.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      zip,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return app.app.inject({ method: 'POST', url: '/api/apps/upload', headers: { ...sameOrigin, cookie, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
  };

  beforeEach(async () => {
    app = await createTestApp();
    cookie = await loginCookie(app);
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('installs from an upload with approved permissions, serves the frame and files, and uninstalls cleanly', async () => {
    const installed = await upload(bundle(), JSON.stringify(['storage']));
    expect(installed.statusCode).toBe(201);
    const info = installed.json<InstalledApp>();
    expect(info).toMatchObject({ id: 'demo-app', version: '1.0.0', trusted: false, granted: ['storage'], source: 'upload' });
    expect(existsSync(path.join(app.dataDir, 'apps', 'demo-app', '1.0.0', 'index.html'))).toBe(true);

    const list = (await call('GET', '/api/apps')).json<{ apps: (InstalledApp & { bundle: { size: number } })[] }>();
    expect(list.apps[0]?.bundle.size).toBeGreaterThan(0);

    const nonce = 'a'.repeat(32);
    const frame = await app.app.inject({ method: 'GET', url: `/apps/frame/demo-app/window/main?nonce=${nonce}&params=${encodeURIComponent('{"x":1}')}`, headers: { cookie } });
    expect(frame.statusCode).toBe(200);
    expect(frame.headers['content-security-policy']).toBe(FRAME_CSP);
    expect(frame.body).toContain('"surface":"window"');
    expect(frame.body).toContain('"params":{"x":1}');
    expect(frame.body).toContain('"permissions":["storage"]');
    expect(frame.body).toContain('window.landscape'); // the SDK runtime
    expect((await app.app.inject({ method: 'GET', url: `/apps/frame/demo-app/window/main?nonce=${nonce}` })).statusCode).toBe(401);
    expect((await app.app.inject({ method: 'GET', url: `/apps/frame/demo-app/window/nope?nonce=${nonce}`, headers: { cookie } })).statusCode).toBe(404);
    const icon = await app.app.inject({ method: 'GET', url: '/apps/files/demo-app/icon.png', headers: { cookie } });
    expect(icon.headers['content-type']).toBe('image/png');
    expect((await app.app.inject({ method: 'GET', url: '/apps/files/demo-app/app.js', headers: { cookie } })).statusCode).toBe(404);
    expect([400, 404]).toContain((await app.app.inject({ method: 'GET', url: '/apps/files/demo-app/..%2Fmanifest.json', headers: { cookie } })).statusCode);

    // Storage needs the permission; notifications was not approved.
    expect((await call('PUT', '/api/apps/demo-app/storage/notes', { value: { a: 1 } })).statusCode).toBe(200);
    expect((await call('GET', '/api/apps/demo-app/storage/notes')).json()).toEqual({ value: { a: 1 } });
    expect((await call('GET', '/api/apps/demo-app/storage?prefix=no')).json()).toMatchObject({ keys: ['notes'] });
    expect((await call('POST', '/api/apps/demo-app/fetch', { url: 'http://127.0.0.1:9/' })).statusCode).toBe(403);
    expect((await call('PATCH', '/api/apps/demo-app', { granted: ['storage', 'notifications', 'ssh:exec'] })).json<InstalledApp>().granted).toEqual(['storage', 'notifications']);
    expect((await call('PATCH', '/api/apps/demo-app', { trusted: true })).json<InstalledApp>().trusted).toBe(true);

    await call('POST', '/api/widgets', { type: 'demo-app/tile', position: { anchorX: 'left', anchorY: 'top', offsetCol: 5, offsetRow: 5 } });
    await call('PATCH', '/api/settings', { taskbar: { pinned: ['app:demo-app', 'app:settings'] } });
    expect((await call('DELETE', '/api/apps/demo-app')).statusCode).toBe(200);
    expect(existsSync(path.join(app.dataDir, 'apps', 'demo-app'))).toBe(false);
    expect(app.ctx.repos.widgets.list().some((w) => w.type.startsWith('demo-app/'))).toBe(false);
    expect(app.ctx.repos.settings.get().taskbar.pinned).toEqual(['app:settings']);
    expect((await call('GET', '/api/apps/demo-app/storage/notes')).statusCode).toBe(404);
  });

  it('requires re-approval for new permissions on update, and keeps grants otherwise', async () => {
    await upload(bundle(), JSON.stringify(['storage']));
    const v2 = bundle(manifest({ version: '1.1.0', permissions: ['storage', 'docker:write'] }));
    const refused = await upload(v2, JSON.stringify([]));
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: 'permissions_required', details: { permissions: ['docker:write'] } } });
    expect(app.ctx.apps.find('demo-app')?.version).toBe('1.0.0');
    const accepted = await upload(v2, JSON.stringify(['docker:write']));
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json<InstalledApp>()).toMatchObject({ version: '1.1.0', granted: ['storage', 'docker:write'] });
    expect(existsSync(path.join(app.dataDir, 'apps', 'demo-app', '1.0.0'))).toBe(false);
    expect(existsSync(path.join(app.dataDir, 'apps', 'demo-app', '1.1.0'))).toBe(true);
  });

  it('rejects bad bundles and the catalog falls back when offline', async () => {
    expect((await upload(writeZip([{ name: 'x.txt', data: 'x' }]))).statusCode).toBe(400);
    expect((await upload(bundle(manifest({ id: 'Nope' })))).statusCode).toBe(400);
    const catalog = (await call('GET', '/api/catalog')).json<{ apps: unknown[]; source: string; error: string | null }>();
    expect(catalog.source).toBe('bundled');
    expect(catalog.apps).toEqual([]);
    expect(catalog.error).toBeTruthy();
    expect((await call('POST', '/api/apps/install', { source: 'catalog', id: 'missing-app' })).statusCode).toBe(404);
  });

  it('installs a catalog app from the zip shipped with the bundled index when GitHub is unreachable', async () => {
    await app.cleanup();
    app = await createTestApp({ catalogFile: path.resolve(import.meta.dirname, '..', '..', 'Catalog', 'index.json') });
    cookie = await loginCookie(app);
    const catalog = (await call('GET', '/api/catalog')).json<{ apps: { id: string }[]; source: string }>();
    expect(catalog.source).toBe('bundled');
    expect(catalog.apps.map((a) => a.id)).toContain('template');
    const installed = await call('POST', '/api/apps/install', { source: 'catalog', id: 'template', approve: 'all' });
    expect(installed.statusCode).toBe(201);
    expect(installed.json<InstalledApp>().source).toBe('catalog');
    // A bundled zip is only used when its sha256 matches the index; otherwise it would be downloaded (and fail offline).
    const service = new CatalogService({ url: 'http://127.0.0.1:9/catalog.json', bundledFile: path.resolve(import.meta.dirname, '..', '..', 'Catalog', 'index.json'), log: app.app.log });
    const entry = service.bundled()!.apps.find((a) => a.id === 'template')!;
    expect(service.bundledBundle(entry)).not.toBeNull();
    expect(service.bundledBundle({ ...entry, sha256: 'f'.repeat(64) })).toBeNull();
  });
});
