import http, { type IncomingHttpHeaders } from 'node:http';
import { connect, type AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';

export interface Seen {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
}

export interface FixtureService {
  origin: string;
  port: number;
  /** Every request (HTTP and upgrade) the service received, newest last. */
  seen: Seen[];
  close(): Promise<void>;
}

/**
 * A local stand-in for a self-hosted service that forbids framing, sets
 * cookies, redirects, and speaks WebSocket — the things the embed proxy has
 * to get right.
 */
export async function startFixtureService(name = 'Fixture'): Promise<FixtureService> {
  const seen: Seen[] = [];
  let origin = '';
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const path = (req.url ?? '/').split('?')[0];
      switch (path) {
        case '/':
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'x-frame-options': 'DENY',
            'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
          });
          res.end(`<!doctype html><title>${name}</title><h1 id="fixture">${name} content</h1>`);
          return;
        case '/echo':
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }));
          return;
        case '/login':
          res.writeHead(302, {
            location: `${origin}/home`,
            'set-cookie': [`session=${name}-token; Path=/; HttpOnly; SameSite=None; Secure`, '__Host-csrf=1; Path=/; Secure'],
          });
          res.end();
          return;
        case '/whoami': {
          const cookie = req.headers.cookie ?? '';
          const match = /(?:^|;\s*)session=([^;]+)/.exec(cookie);
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end(match ? `logged in as ${match[1]}` : 'anonymous');
          return;
        }
        case '/away':
          res.writeHead(302, { location: 'https://elsewhere.example/sso' });
          res.end();
          return;
        default:
          res.writeHead(404);
          res.end();
      }
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    socket.send(JSON.stringify({ hello: name, cookie: req.headers.cookie ?? null, origin: req.headers.origin ?? null, host: req.headers.host }));
    socket.on('message', (data, isBinary) => socket.send(data, { binary: isBinary }));
  });
  server.on('upgrade', (req) => seen.push({ method: 'UPGRADE', url: req.url ?? '', headers: req.headers }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    port,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Sends raw bytes to a port and resolves with everything the server writes back before closing. */
export function rawRequest(port: number, payload: string, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    let data = '';
    const done = () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(data);
    };
    const timer = setTimeout(done, timeoutMs);
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
    });
    socket.on('end', done);
    socket.on('close', done);
    socket.on('error', done);
    socket.write(payload);
  });
}
