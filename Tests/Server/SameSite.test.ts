import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import { createTestApp, loginCookie, type TestApp } from './TestApp';

/**
 * Pages on the embed proxy ports are another origin but the same *site* as
 * LANdscape, so the browser sends LANdscape's SameSite=Strict cookie with
 * their requests to the main port. The Origin check is what stops them.
 */
const HOST = 'landscape.lan:8080';
const OWN_ORIGIN = 'http://landscape.lan:8080';
const PROXY_ORIGIN = 'http://landscape.lan:8081';

/** GET routes reviewed to have no side effects (reads only). Adding a GET route means reviewing it here. */
const SIDE_EFFECT_FREE_GETS = [
  '/',
  '/healthz',
  '/api/auth/session',
  '/api/desktop',
  '/api/shortcuts',
  '/icons/:file',
  '/wallpapers/:kind/:file',
  '/api/wallpapers',
  '/api/settings',
  '/api/docker/containers',
  '/api/files/list',
  '/api/files/home',
  '/api/files/stat',
  '/api/files/read',
  '/api/files/download',
  '/api/files/raw',
  '/api/system/status',
  '/api/system/version',
  '/api/proxy',
  // WebSocket endpoints: GET only to upgrade; the guard checks Origin on the upgrade (tested below).
  '/ws/metrics',
  '/ws/terminal',
  '/ws/logs',
];

function concrete(url: string): string {
  return url.replace(/:id\b/g, 'abc123').replace(/:pid\b/g, '1').replace(/:action\b/g, 'restart').replace(/:appKey\b/g, 'app:settings').replace(/:file\b/g, 'x.png');
}

describe('same-site requests from proxied pages', () => {
  let app: TestApp;
  let cookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    cookie = await loginCookie(app);
  });
  afterAll(async () => {
    await app.cleanup();
  });

  it('rejects every state-changing route when Origin is a proxy port, with or without a session', async () => {
    const mutating = app.routes.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method));
    expect(mutating.length).toBeGreaterThan(20);
    for (const route of mutating) {
      const url = concrete(route.url);
      for (const headers of [{ cookie }, {}]) {
        const response = await app.app.inject({ method: route.method as 'POST', url, headers: { ...headers, host: HOST, origin: PROXY_ORIGIN }, payload: {} });
        const expected = 'cookie' in headers || route.url === '/api/auth/login' ? 403 : 401;
        expect({ route: `${route.method} ${route.url}`, status: response.statusCode }).toEqual({ route: `${route.method} ${route.url}`, status: expected });
      }
    }
  });

  it('still accepts those routes from LANdscape’s own origin', async () => {
    const mutating = app.routes.filter((r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method) && r.url !== '/api/auth/logout');
    for (const route of mutating) {
      const response = await app.app.inject({ method: route.method as 'POST', url: concrete(route.url), headers: { cookie, host: HOST, origin: OWN_ORIGIN }, payload: {} });
      expect({ route: `${route.method} ${route.url}`, forbidden: response.statusCode === 403 }).toEqual({ route: `${route.method} ${route.url}`, forbidden: false });
    }
  });

  it('only has GET routes that were reviewed as side-effect free', () => {
    const gets = [...new Set(app.routes.filter((r) => r.method === 'GET').map((r) => r.url))].sort();
    expect(gets).toEqual([...SIDE_EFFECT_FREE_GETS].sort());
  });

  it('keeps GET responses unreadable and unembeddable for other origins', async () => {
    const response = await app.app.inject({ method: 'GET', url: '/api/desktop', headers: { cookie, host: HOST, origin: PROXY_ORIGIN } });
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects WebSocket upgrades from a proxy port origin', async () => {
    const listening = await createTestApp();
    try {
      await listening.app.listen({ port: 0, host: '127.0.0.1' });
      const port = (listening.app.server.address() as AddressInfo).port;
      const session = await loginCookie(listening);
      for (const path of ['/ws/metrics', '/ws/terminal', '/ws/logs']) {
        const status = await new Promise<number>((resolve) => {
          const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: { cookie: session, origin: `http://127.0.0.1:${port + 1}` } });
          ws.on('open', () => {
            ws.close();
            resolve(101);
          });
          ws.on('unexpected-response', (_req, res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          });
          ws.on('error', () => undefined);
        });
        expect({ path, status }).toEqual({ path, status: 403 });
      }
    } finally {
      await listening.cleanup();
    }
  });
});
