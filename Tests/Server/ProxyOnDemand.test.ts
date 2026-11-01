import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connect } from 'node:net';
import WebSocket from 'ws';
import type { Shortcut } from '@landscape/shared';
import { createTestApp, loginCookie, type TestApp } from './TestApp';
import { startFixtureService, type FixtureService } from './ProxyFixture';

// Ports used by this file only (vitest runs files in parallel).
const RANGE = { start: 47191, end: 47192 };
const sameOrigin = { origin: 'http://localhost', host: 'localhost' };
const GRACE_MS = 60_000;

/** Resolves 'open' when something accepts TCP connections on the port, 'refused' otherwise. */
function probe(port: number): Promise<'open' | 'refused'> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve('open');
    });
    socket.once('error', () => resolve('refused'));
  });
}

describe('embed proxy ports open on demand', () => {
  let app: TestApp;
  let cookie: string;
  let service: FixtureService;
  let shortcut: Shortcut;
  const base = `http://127.0.0.1:${RANGE.start}`;

  const api = (method: 'POST' | 'DELETE', url: string, payload?: unknown) =>
    app.app.inject({ method, url, headers: { ...sameOrigin, cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });
  const lease = async () => {
    const response = await api('POST', '/api/proxy/leases', { shortcutId: shortcut.id });
    expect(response.statusCode).toBe(201);
    return response.json<{ leaseId: string; port: number; ttlMs: number }>();
  };

  beforeAll(async () => {
    service = await startFixtureService('Alpha');
  });
  afterAll(async () => {
    await service.close();
  });

  beforeEach(async () => {
    app = await createTestApp({ proxyPorts: RANGE });
    app.ctx.proxy.start();
    cookie = await loginCookie(app);
    shortcut = (await api('POST', '/api/shortcuts', { name: 'Alpha', url: service.origin, iconMode: 'upload' })).json<Shortcut>();
    expect(shortcut.proxyPort).toBe(RANGE.start);
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('keeps an assigned port closed until a window leases it', async () => {
    expect(await probe(RANGE.start)).toBe('refused');
    const { port, ttlMs } = await lease();
    expect(port).toBe(RANGE.start);
    expect(ttlMs).toBeGreaterThan(20_000);
    expect(await probe(RANGE.start)).toBe('open');
    expect((await fetch(`${base}/`, { headers: { cookie } })).status).toBe(200);
  });

  it('closes the port after the grace period once the last lease is released, and reopens it with the same cookie namespace', async () => {
    const first = await lease();
    // Log in to the proxied app; its cookie is namespaced by the assignment.
    const login = await fetch(`${base}/login`, { headers: { cookie }, redirect: 'manual' });
    const appCookie = (login.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';
    expect(appCookie).toMatch(/^lp47191_[a-z0-9]+_session=/);

    expect((await api('DELETE', `/api/proxy/leases/${first.leaseId}`)).statusCode).toBe(200);
    app.ctx.proxy.sweep(Date.now() + GRACE_MS / 2);
    expect(await probe(RANGE.start)).toBe('open');
    expect(app.ctx.proxy.overview().ports[0]?.reason).toMatch(/^Idle, closes in \d+ s$/);

    app.ctx.proxy.sweep(Date.now() + GRACE_MS + 1000);
    await expect.poll(() => probe(RANGE.start)).toBe('refused');
    expect(app.ctx.proxy.overview().ports[0]).toMatchObject({ state: 'closed', listening: false });

    // Reopening the window reopens the port; the earlier login still works.
    await lease();
    const whoami = await fetch(`${base}/whoami`, { headers: { cookie: `${cookie}; ${appCookie}` } });
    expect(await whoami.text()).toBe('logged in as Alpha-token');
  });

  it('lets an unrenewed lease expire, and answers 404 to its renewal so the client leases again', async () => {
    const { leaseId, ttlMs } = await lease();
    expect((await api('POST', `/api/proxy/leases/${leaseId}/renew`)).json()).toEqual({ ok: true, port: RANGE.start });
    app.ctx.proxy.sweep(Date.now() + ttlMs + 1000);
    expect(app.ctx.proxy.overview().ports[0]).toMatchObject({ leases: 0, state: 'open' });
    app.ctx.proxy.sweep(Date.now() + ttlMs + GRACE_MS + 2000);
    await expect.poll(() => probe(RANGE.start)).toBe('refused');
    expect((await api('POST', `/api/proxy/leases/${leaseId}/renew`)).statusCode).toBe(404);
  });

  it('stays open while a WebSocket through it is connected, even without a lease', async () => {
    const { leaseId } = await lease();
    const socket = new WebSocket(`ws://127.0.0.1:${RANGE.start}/ws`, { headers: { cookie } });
    await new Promise<void>((resolve, reject) => {
      socket.once('message', () => resolve());
      socket.once('error', reject);
    });
    await api('DELETE', `/api/proxy/leases/${leaseId}`);
    app.ctx.proxy.sweep(Date.now() + 10 * GRACE_MS);
    expect(app.ctx.proxy.overview().ports[0]).toMatchObject({ state: 'open', connections: 1, reason: '1 active connection' });
    expect(await probe(RANGE.start)).toBe('open');

    const closed = new Promise((resolve) => socket.once('close', resolve));
    socket.close();
    await closed;
    await expect.poll(() => app.ctx.proxy.overview().ports[0]?.connections).toBe(0);
    app.ctx.proxy.sweep(Date.now() + GRACE_MS + 1000);
    await expect.poll(() => probe(RANGE.start)).toBe('refused');
  });

  it('uses the grace period from Settings → Proxy', async () => {
    const patch = await app.app.inject({ method: 'PATCH', url: '/api/settings', headers: { ...sameOrigin, cookie }, payload: { proxy: { idleGraceSeconds: 600 } } });
    expect(patch.statusCode).toBe(200);
    const { leaseId } = await lease();
    await api('DELETE', `/api/proxy/leases/${leaseId}`);
    app.ctx.proxy.sweep(Date.now() + GRACE_MS + 1000);
    expect(await probe(RANGE.start)).toBe('open');
    app.ctx.proxy.sweep(Date.now() + 601_000);
    await expect.poll(() => probe(RANGE.start)).toBe('refused');
  });

  it('closes a leased port right away when the shortcut stops using the proxy', async () => {
    await lease();
    await app.app.inject({ method: 'PATCH', url: `/api/shortcuts/${shortcut.id}`, headers: { ...sameOrigin, cookie }, payload: { openMode: 'embed' } });
    await expect.poll(() => probe(RANGE.start)).toBe('refused');
  });

  it('validates lease requests and requires a session', async () => {
    expect((await api('POST', '/api/proxy/leases', { shortcutId: 'nope' })).statusCode).toBe(404);
    expect((await api('POST', '/api/proxy/leases', { shortcutId: '../x' })).statusCode).toBe(400);
    const direct = (await api('POST', '/api/shortcuts', { name: 'Direct', url: `${service.origin}/echo`, iconMode: 'upload' })).json<Shortcut>();
    expect((await api('POST', '/api/proxy/leases', { shortcutId: direct.id })).statusCode).toBe(409);
    expect((await api('POST', '/api/proxy/leases/0123/renew')).statusCode).toBe(400);
    const anonymous = await app.app.inject({ method: 'POST', url: '/api/proxy/leases', headers: sameOrigin, payload: { shortcutId: shortcut.id } });
    expect(anonymous.statusCode).toBe(401);
    expect(await probe(RANGE.start)).toBe('refused');
  });
});
