import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import WebSocket from 'ws';
import type { Shortcut } from '@landscape/shared';
import { MIGRATIONS } from '@server/Db/Migrations';
import { ConfigError, loadConfig, validateProxyPorts } from '@server/Config';
import { createTestApp, loginCookie, type TestApp } from './TestApp';
import { startFixtureService, type FixtureService } from './ProxyFixture';

// Ports used by this file only (vitest runs files in parallel).
const RANGE = { start: 47181, end: 47183 };
const sameOrigin = { origin: 'http://localhost', host: 'localhost' };

function wsStatus(url: string, headers: Record<string, string>): Promise<{ status: number; first?: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('timeout'));
    }, 5000);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timer);
      ws.close();
      resolve({ status: 101, first: data.toString('utf8') });
    });
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    ws.on('error', () => undefined);
  });
}

async function createShortcut(app: TestApp, cookie: string, body: Record<string, unknown>) {
  return app.app.inject({ method: 'POST', url: '/api/shortcuts', headers: { ...sameOrigin, cookie }, payload: body });
}

describe('embed proxy through the app', () => {
  let app: TestApp;
  let cookie: string;
  let alpha: FixtureService;
  let beta: FixtureService;

  beforeAll(async () => {
    alpha = await startFixtureService('Alpha');
    beta = await startFixtureService('Beta');
  });
  afterAll(async () => {
    await alpha.close();
    await beta.close();
  });

  beforeEach(async () => {
    app = await createTestApp({ proxyPorts: RANGE });
    app.ctx.proxy.start();
    cookie = await loginCookie(app);
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('gives a blocked auto shortcut a port and serves it only to a logged-in browser', async () => {
    const response = await createShortcut(app, cookie, { name: 'Alpha', url: `${alpha.origin}/`, iconMode: 'upload', iconFile: null });
    expect(response.statusCode).toBe(201);
    const shortcut = response.json<Shortcut>();
    expect(shortcut).toMatchObject({ embeddable: 'no', openMode: 'auto', proxyPort: RANGE.start });
    const base = `http://127.0.0.1:${RANGE.start}`;

    await expect.poll(() => app.ctx.proxy.overview().ports[0]?.listening).toBe(true);
    const anonymous = await fetch(`${base}/`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).toContain('Log in to LANdscape to use this service.');
    const forged = await fetch(`${base}/`, { headers: { cookie: 'landscape_session=s%3Aforged.signature' } });
    expect(forged.status).toBe(401);

    const page = await fetch(`${base}/`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(page.headers.get('x-frame-options')).toBeNull();
    expect(await page.text()).toContain('Alpha content');
    // The target never sees LANdscape's session cookie.
    const echo = (await (await fetch(`${base}/echo`, { headers: { cookie } })).json()) as { headers: Record<string, string> };
    expect(echo.headers.cookie).toBeUndefined();

    expect((await wsStatus(`ws://127.0.0.1:${RANGE.start}/ws`, {})).status).toBe(401);
    const ws = await wsStatus(`ws://127.0.0.1:${RANGE.start}/ws`, { cookie });
    expect(ws.status).toBe(101);
    expect(JSON.parse(ws.first ?? '{}')).toMatchObject({ hello: 'Alpha', cookie: null });

    // Logging out closes the gate again.
    await app.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { ...sameOrigin, cookie } });
    expect((await fetch(`${base}/`, { headers: { cookie } })).status).toBe(401);
    expect((await wsStatus(`ws://127.0.0.1:${RANGE.start}/ws`, { cookie })).status).toBe(401);
  });

  it('keeps two proxied services with same-named cookies apart', async () => {
    const a = (await createShortcut(app, cookie, { name: 'Alpha', url: alpha.origin, iconMode: 'upload' })).json<Shortcut>();
    const b = (await createShortcut(app, cookie, { name: 'Beta', url: beta.origin, iconMode: 'upload' })).json<Shortcut>();
    expect([a.proxyPort, b.proxyPort]).toEqual([RANGE.start, RANGE.start + 1]);
    await expect.poll(() => app.ctx.proxy.overview().ports.every((p) => p.listening)).toBe(true);

    // A tiny cookie jar keyed by host, like a browser (cookies ignore ports).
    const jar = new Map<string, string>();
    const send = () => [cookie, ...[...jar].map(([k, v]) => `${k}=${v}`)].join('; ');
    for (const port of [a.proxyPort, b.proxyPort]) {
      const login = await fetch(`http://127.0.0.1:${port}/login`, { headers: { cookie: send() }, redirect: 'manual' });
      for (const set of login.headers.getSetCookie()) {
        const [pair] = set.split(';');
        const [name, value] = (pair ?? '').split('=');
        if (name) jar.set(name, value ?? '');
      }
    }
    expect([...jar.keys()].every((name) => name.startsWith('lp'))).toBe(true);
    expect(await (await fetch(`http://127.0.0.1:${a.proxyPort}/whoami`, { headers: { cookie: send() } })).text()).toBe('logged in as Alpha-token');
    expect(await (await fetch(`http://127.0.0.1:${b.proxyPort}/whoami`, { headers: { cookie: send() } })).text()).toBe('logged in as Beta-token');
  });

  it('releases ports when a shortcut stops using the proxy or is deleted, and renews them on a new target', async () => {
    const created = (await createShortcut(app, cookie, { name: 'Alpha', url: alpha.origin, iconMode: 'upload' })).json<Shortcut>();
    expect(created.proxyPort).toBe(RANGE.start);
    const tagOf = () => app.ctx.repos.shortcuts.proxyAssignments().find((r) => r.id === created.id)?.tag;
    const firstTag = tagOf();

    const patch = (body: Record<string, unknown>) =>
      app.app.inject({ method: 'PATCH', url: `/api/shortcuts/${created.id}`, headers: { ...sameOrigin, cookie }, payload: body });

    // Only the path changes: same service, same assignment.
    expect((await patch({ url: `${alpha.origin}/?page=2` })).json<Shortcut>().proxyPort).toBe(RANGE.start);
    expect(tagOf()).toBe(firstTag);
    // A partial update does not reset the open mode.
    expect((await patch({ name: 'Renamed' })).json<Shortcut>()).toMatchObject({ openMode: 'auto', proxyPort: RANGE.start });

    // New origin: a fresh assignment, so Alpha's cookies are never sent to Beta.
    expect((await patch({ url: beta.origin })).json<Shortcut>().proxyPort).toBe(RANGE.start);
    expect(tagOf()).not.toBe(firstTag);

    expect((await patch({ openMode: 'newtab' })).json<Shortcut>().proxyPort).toBeNull();
    expect((await patch({ openMode: 'proxy' })).json<Shortcut>().proxyPort).toBe(RANGE.start);
    expect((await patch({ openMode: 'embed' })).json<Shortcut>().proxyPort).toBeNull();
    await expect.poll(() => fetch(`http://127.0.0.1:${RANGE.start}/`).then(() => 'open', () => 'closed')).toBe('closed');

    await patch({ openMode: 'proxy' });
    await app.app.inject({ method: 'DELETE', url: `/api/shortcuts/${created.id}`, headers: { ...sameOrigin, cookie } });
    expect(app.ctx.proxy.overview()).toMatchObject({ used: 0, ports: [] });
  });

  it('refuses an explicit proxy choice when all ports are taken and lets auto shortcuts wait', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await createShortcut(app, cookie, { name: `S${i}`, url: alpha.origin, iconMode: 'upload' })).json<Shortcut>().proxyPort).toBe(RANGE.start + i);
    }
    const explicit = await createShortcut(app, cookie, { name: 'Full', url: beta.origin, iconMode: 'upload', openMode: 'proxy' });
    expect(explicit.statusCode).toBe(409);
    expect(explicit.json()).toMatchObject({ error: { message: 'All 3 proxy ports are in use — free one or widen PROXY_PORT_START/END.' } });

    const waiting = (await createShortcut(app, cookie, { name: 'Waits', url: beta.origin, iconMode: 'upload' })).json<Shortcut>();
    expect(waiting).toMatchObject({ embeddable: 'no', proxyPort: null });
    expect(app.ctx.proxy.overview()).toMatchObject({ total: 3, used: 3, waiting: [{ shortcutId: waiting.id }] });

    // Freeing a port hands it to the waiting shortcut.
    const first = app.ctx.repos.shortcuts.list().find((s) => s.name === 'S0') as Shortcut;
    await app.app.inject({ method: 'DELETE', url: `/api/shortcuts/${first.id}`, headers: { ...sameOrigin, cookie } });
    expect(app.ctx.repos.shortcuts.find(waiting.id)?.proxyPort).toBe(RANGE.start);
  });

  it('leaves directly embeddable shortcuts alone and keeps reporting the direct check result', async () => {
    const created = (await createShortcut(app, cookie, { name: 'Echo', url: `${alpha.origin}/echo`, iconMode: 'upload' })).json<Shortcut>();
    expect(created).toMatchObject({ embeddable: 'yes', proxyPort: null });

    const proxied = (await createShortcut(app, cookie, { name: 'Alpha', url: alpha.origin, iconMode: 'upload', openMode: 'proxy' })).json<Shortcut>();
    const rechecked = await app.app.inject({ method: 'POST', url: `/api/shortcuts/${proxied.id}/recheck`, headers: { ...sameOrigin, cookie } });
    expect(rechecked.json<Shortcut>()).toMatchObject({ embeddable: 'no', proxyPort: RANGE.start });
    expect(rechecked.json<Shortcut>().embedReason).toContain('frame-ancestors');
  });

  it('exposes the overview and the range to the client', async () => {
    await createShortcut(app, cookie, { name: 'Alpha', url: `${alpha.origin}/`, iconMode: 'upload' });
    const desktop = await app.app.inject({ method: 'GET', url: '/api/desktop', headers: { cookie } });
    expect(desktop.json()).toMatchObject({ proxy: RANGE, settings: { proxyIndicator: 'badge' } });
    await expect.poll(() => app.ctx.proxy.overview().ports[0]?.listening).toBe(true);
    const overview = await app.app.inject({ method: 'GET', url: '/api/proxy', headers: { cookie } });
    expect(overview.json()).toEqual({
      start: RANGE.start,
      end: RANGE.end,
      total: 3,
      used: 1,
      ports: [{ port: RANGE.start, shortcutId: expect.any(String) as string, name: 'Alpha', target: alpha.origin, listening: true, error: null }],
      waiting: [],
    });
    expect((await app.app.inject({ method: 'GET', url: '/api/proxy' })).statusCode).toBe(401);

    const settings = await app.app.inject({ method: 'PATCH', url: '/api/settings', headers: { ...sameOrigin, cookie }, payload: { proxyIndicator: 'none' } });
    expect(settings.json()).toMatchObject({ proxyIndicator: 'none' });
  });
});

describe('migration to proxy ports', () => {
  it('assigns ports to existing blocked auto shortcuts, oldest first, until the range is full', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'landscape-migrate-'));
    const file = path.join(dataDir, 'landscape.db');
    const v1 = new DatabaseSync(file);
    v1.exec(MIGRATIONS[0] as string);
    v1.exec('PRAGMA user_version = 1');
    const insert = v1.prepare(
      `INSERT INTO shortcuts (id, name, url, embeddable, open_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const rows: [string, string, string, string][] = [
      ['d', 'Newest blocked', 'no', 'auto'],
      ['a', 'Oldest blocked', 'no', 'auto'],
      ['b', 'Embeds', 'yes', 'auto'],
      ['c', 'Forced direct', 'no', 'embed'],
      ['e', 'New tab', 'no', 'newtab'],
      ['f', 'Second blocked', 'no', 'auto'],
    ];
    const created: Record<string, string> = { a: '01', b: '02', c: '03', f: '04', d: '05', e: '06' };
    for (const [id, name, embeddable, openMode] of rows) {
      insert.run(id, name, 'http://10.0.0.9:1234/', embeddable, openMode, `2026-01-${created[id]}T00:00:00Z`, `2026-01-${created[id]}T00:00:00Z`);
    }
    v1.close();

    const app = await createTestApp({ proxyPorts: { start: 47191, end: 47192 } });
    await app.cleanup();
    const { buildApp } = await import('@server/App');
    const built = await buildApp({ config: { ...app.ctx.config, dataDir, proxyPorts: { start: 47191, end: 47192 } }, databaseFile: file, logger: false });
    try {
      const byId = Object.fromEntries(built.ctx.repos.shortcuts.list().map((s) => [s.id, s.proxyPort]));
      expect(byId).toEqual({ a: 47191, f: 47192, d: null, b: null, c: null, e: null });
      expect(built.ctx.proxy.overview().waiting).toEqual([{ shortcutId: 'd', name: 'Newest blocked' }]);
    } finally {
      await built.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('proxy port configuration', () => {
  it('validates the range against the main port and sane bounds', () => {
    expect(() => validateProxyPorts({ start: 8081, end: 8100 }, 8080)).not.toThrow();
    expect(() => validateProxyPorts({ start: 8081, end: 8100 }, 8090)).toThrow(/PORT \(8090\) lies inside/);
    expect(() => validateProxyPorts({ start: 8100, end: 8081 }, 8080)).toThrow(ConfigError);
    expect(() => validateProxyPorts({ start: 80, end: 90 }, 8080)).toThrow(/1024/);
    expect(() => validateProxyPorts({ start: 10000, end: 20000 }, 8080)).toThrow(/at most/);
  });

  it('reads PROXY_PORT_START/END from the environment', () => {
    const saved = { ...process.env };
    try {
      process.env.PROXY_PORT_START = '9100';
      process.env.PROXY_PORT_END = '9104';
      const config = loadConfig({ loginUsername: 'a', loginPasswordHash: '$2b$04$0FxbrePfnjWL0OskF6rcgOJiBe3OXx2X9hF6Jj775xwXx82btbPWa' });
      expect(config.proxyPorts).toEqual({ start: 9100, end: 9104 });
      process.env.PORT = '9102';
      expect(() => loadConfig({ loginUsername: 'a', loginPasswordHash: '$2b$04$0FxbrePfnjWL0OskF6rcgOJiBe3OXx2X9hF6Jj775xwXx82btbPWa' })).toThrow(ConfigError);
    } finally {
      process.env = saved;
    }
  });
});
