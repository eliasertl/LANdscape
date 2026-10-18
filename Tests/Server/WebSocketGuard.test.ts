import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { AddressInfo } from 'node:net';
import { createTestApp, loginCookie, type TestApp } from './TestApp';

/**
 * Opens a WebSocket and resolves with the HTTP status of the upgrade response
 * (101 on success, otherwise the rejection status).
 */
function tryUpgrade(url: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error('timeout'));
    }, 5000);
    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve(101);
    });
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    ws.on('error', () => {
      // handled through unexpected-response when it is an HTTP rejection
    });
  });
}

describe('WebSocket guard', () => {
  let app: TestApp;
  let base: string;
  let origin: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.app.server.address() as AddressInfo;
    base = `ws://127.0.0.1:${address.port}`;
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.cleanup();
  });

  it('rejects upgrades without a session', async () => {
    expect(await tryUpgrade(`${base}/ws/metrics`, { origin })).toBe(401);
  });

  it('rejects upgrades with a session but a foreign or missing Origin', async () => {
    const cookie = await loginCookie(app);
    expect(await tryUpgrade(`${base}/ws/metrics`, { cookie, origin: 'http://evil.example' })).toBe(403);
    expect(await tryUpgrade(`${base}/ws/metrics`, { cookie })).toBe(403);
  });

  it('accepts upgrades with a session and a same-origin Origin', async () => {
    const cookie = await loginCookie(app);
    expect(await tryUpgrade(`${base}/ws/metrics`, { cookie, origin })).toBe(101);
  });
});
