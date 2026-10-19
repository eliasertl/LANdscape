import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import WebSocket from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { ProxyListener } from '@server/Proxy/Listener';
import { cookiePrefix } from '@server/Proxy/Rewrite';
import { rawRequest, startFixtureService, type FixtureService } from './ProxyFixture';

const silent = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined } as unknown as FastifyBaseLogger;
const SESSION = 'landscape_session=valid';
const PREFIX = cookiePrefix(1, 'test');

/** Opens a WebSocket and resolves with the first message, or the HTTP status if the upgrade is refused. */
function firstMessage(url: string, headers: Record<string, string>): Promise<{ status: number; message?: string; ws?: WebSocket }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('timeout'));
    }, 5000);
    ws.once('message', (data: Buffer) => {
      clearTimeout(timer);
      resolve({ status: 101, message: data.toString('utf8'), ws });
    });
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      res.resume();
      resolve({ status: res.statusCode ?? 0 });
    });
    ws.on('error', () => undefined);
  });
}

describe('proxy listener', () => {
  let service: FixtureService;
  let listener: ProxyListener;
  let base: string;
  let port: number;

  beforeAll(async () => {
    service = await startFixtureService('Alpha');
    listener = new ProxyListener({
      port: 0,
      host: '127.0.0.1',
      route: () => ({ port: 1, target: new URL(service.origin), cookiePrefix: PREFIX }),
      isAuthenticated: (cookie) => (cookie ?? '').split(/;\s*/).includes(SESSION),
      log: silent,
    });
    await listener.listen();
    port = (listener.server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await listener.close();
    await service.close();
  });

  it('answers 401 with a small page and forwards nothing without a session', async () => {
    const before = service.seen.length;
    const response = await fetch(`${base}/`);
    expect(response.status).toBe(401);
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(await response.text()).toContain('Log in to LANdscape to use this service.');
    expect(service.seen.length).toBe(before);
  });

  it('serves a page that forbids framing without its framing headers', async () => {
    const response = await fetch(`${base}/`, { headers: { cookie: SESSION } });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-frame-options')).toBeNull();
    expect(response.headers.get('content-security-policy')).toBe("default-src 'self'");
    expect(await response.text()).toContain('Alpha content');
  });

  it('rewrites Host, Origin and Referer and never forwards the LANdscape cookie', async () => {
    const response = await fetch(`${base}/echo?q=1`, {
      method: 'POST',
      headers: { cookie: `${SESSION}; ${PREFIX}session=abc; other=1`, origin: base, referer: `${base}/page`, 'content-type': 'text/plain' },
      body: 'hello body',
    });
    const echo = (await response.json()) as { method: string; url: string; headers: Record<string, string>; body: string };
    expect(echo.method).toBe('POST');
    expect(echo.url).toBe('/echo?q=1');
    expect(echo.body).toBe('hello body');
    expect(echo.headers.host).toBe(new URL(service.origin).host);
    expect(echo.headers.origin).toBe(service.origin);
    expect(echo.headers.referer).toBe(`${service.origin}/page`);
    expect(echo.headers.cookie).toBe('session=abc');
  });

  it('rewrites redirects and cookies so a login sticks on the proxy origin', async () => {
    const login = await fetch(`${base}/login`, { headers: { cookie: SESSION }, redirect: 'manual' });
    expect(login.status).toBe(302);
    expect(login.headers.get('location')).toBe(`${base}/home`);
    const cookies = login.headers.getSetCookie();
    expect(cookies).toEqual([`${PREFIX}session=Alpha-token; Path=/; HttpOnly; SameSite=Lax`, `${PREFIX}__Host-csrf=1; Path=/`]);
    const who = await fetch(`${base}/whoami`, { headers: { cookie: `${SESSION}; ${PREFIX}session=Alpha-token` } });
    expect(await who.text()).toBe('logged in as Alpha-token');
  });

  it('passes redirects to other origins through unchanged', async () => {
    const response = await fetch(`${base}/away`, { headers: { cookie: SESSION }, redirect: 'manual' });
    expect(response.headers.get('location')).toBe('https://elsewhere.example/sso');
  });

  it('is not an open relay: absolute-form targets and CONNECT are refused', async () => {
    const before = service.seen.length;
    const absolute = await rawRequest(port, `GET http://example.com/ HTTP/1.1\r\nHost: example.com\r\nCookie: ${SESSION}\r\nConnection: close\r\n\r\n`);
    expect(absolute).toMatch(/^HTTP\/1\.1 400/);
    const connect = await rawRequest(port, `CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\nCookie: ${SESSION}\r\n\r\n`);
    expect(connect).not.toMatch(/^HTTP\/1\.1 200/);
    // A protocol-relative path is still just a path on the one target.
    const doubleSlash = await rawRequest(port, `GET //example.com/echo HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nCookie: ${SESSION}\r\nConnection: close\r\n\r\n`);
    expect(doubleSlash).toMatch(/^HTTP\/1\.1 404/);
    expect(service.seen.slice(before).map((s) => s.url)).toEqual(['//example.com/echo']);
  });

  it('proxies WebSockets with the same session gate and header rewriting', async () => {
    expect((await firstMessage(`ws://127.0.0.1:${port}/socket`, { origin: base })).status).toBe(401);
    const result = await firstMessage(`ws://127.0.0.1:${port}/socket`, { origin: base, cookie: `${SESSION}; ${PREFIX}session=abc` });
    expect(result.status).toBe(101);
    const hello = JSON.parse(result.message ?? '{}') as Record<string, unknown>;
    expect(hello).toMatchObject({ hello: 'Alpha', cookie: 'session=abc', origin: service.origin, host: new URL(service.origin).host });
    const ws = result.ws as WebSocket;
    const echo = await new Promise<string>((resolve) => {
      ws.once('message', (data: Buffer) => resolve(data.toString('utf8')));
      ws.send('ping through the proxy');
    });
    expect(echo).toBe('ping through the proxy');
    ws.close();
  });

  it('answers 502 when the target is down', async () => {
    const dead = new ProxyListener({
      port: 0,
      host: '127.0.0.1',
      route: () => ({ port: 2, target: new URL('http://127.0.0.1:1'), cookiePrefix: PREFIX }),
      isAuthenticated: () => true,
      log: silent,
    });
    await dead.listen();
    const deadPort = (dead.server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${deadPort}/`);
    expect(response.status).toBe(502);
    expect(await response.text()).toContain('could not reach http://127.0.0.1:1');
    await dead.close();
  });
});
