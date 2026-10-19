import http, { type IncomingMessage, type OutgoingHttpHeaders, type ServerResponse } from 'node:http';
import https from 'node:https';
import type { Duplex } from 'node:stream';
import type { Socket } from 'node:net';
import type { FastifyBaseLogger } from 'fastify';
import { forwardRequestHeaders, proxyOriginFromHost, rewriteResponseHeaders } from './Rewrite';
import { LOGIN_REQUIRED, sendProxyPage } from './Pages';

/** What one proxy port forwards to. */
export interface ProxyRoute {
  port: number;
  /** Target origin only (scheme, host, port); paths come from the browser. */
  target: URL;
  cookiePrefix: string;
}

export interface ListenerOptions {
  port: number;
  host: string;
  /** Looked up per request so a port can be re-targeted without restarting it. */
  route: () => ProxyRoute | null;
  /** True when the Cookie header carries a valid LANdscape session. */
  isAuthenticated: (cookieHeader: string | undefined) => boolean;
  log: FastifyBaseLogger;
}

/** Until the target has sent response headers (covers connect + slow backends). */
export const RESPONSE_TIMEOUT_MS = 60_000;
/** Idle limit while streaming a response body (long polls and SSE stay well below this). */
export const STREAM_IDLE_TIMEOUT_MS = 15 * 60_000;

// LAN services commonly use self-signed certificates; like SafeFetch, accept them.
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });

function requestOptions(target: URL, method: string, path: string, headers: OutgoingHttpHeaders, upgrade: boolean): https.RequestOptions {
  const secure = target.protocol === 'https:';
  return {
    protocol: target.protocol,
    hostname: target.hostname.replace(/^\[|\]$/g, ''),
    port: target.port || (secure ? 443 : 80),
    method,
    path,
    headers,
    // Upgraded connections are handed over to the client for good, so they never come from the keep-alive pool.
    agent: upgrade ? false : secure ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
    servername: secure && !/^[\d.]+$|:/.test(target.hostname) ? target.hostname : undefined,
  };
}

function transport(target: URL): typeof http | typeof https {
  return target.protocol === 'https:' ? https : http;
}

/** Only origin-form request targets are proxied; anything else could address another host. */
function isOriginForm(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('/');
}

/** One http server bound to one proxy port. */
export class ProxyListener {
  readonly server: http.Server;
  private readonly sockets = new Set<Socket | Duplex>();

  constructor(private readonly options: ListenerOptions) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    // Headers must arrive promptly; bodies (uploads) may take as long as they need.
    this.server.headersTimeout = 60_000;
    this.server.requestTimeout = 0;
    this.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => this.handleUpgrade(req, socket, head));
    this.server.on('connection', (socket: Socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    this.server.on('clientError', (_error, socket) => {
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      else socket.destroy();
    });
    // CONNECT has no listener, so Node closes such connections: no tunnelling to arbitrary hosts.
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off('error', onError);
        resolve();
      };
      this.server.once('error', onError);
      this.server.once('listening', onListening);
      this.server.listen(this.options.port, this.options.host);
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server.listening) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      for (const socket of this.sockets) socket.destroy();
      this.sockets.clear();
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const route = this.options.route();
    if (!route) {
      sendProxyPage(res, 404, 'No service on this port', 'This LANdscape proxy port is not assigned to a shortcut.');
      return;
    }
    if (!isOriginForm(req.url)) {
      sendProxyPage(res, 400, 'Bad request', 'The proxy only accepts requests for paths on its own service.');
      return;
    }
    if (!this.options.isAuthenticated(req.headers.cookie)) {
      req.resume();
      sendProxyPage(res, 401, LOGIN_REQUIRED.title, LOGIN_REQUIRED.message);
      return;
    }
    const proxyOrigin = proxyOriginFromHost(req.headers.host);
    if (!proxyOrigin) {
      sendProxyPage(res, 400, 'Bad request', 'Missing or invalid Host header.');
      return;
    }
    const targetOrigin = route.target.origin;
    const headers = forwardRequestHeaders(req.headers, { targetOrigin, proxyOrigin, cookiePrefix: route.cookiePrefix });
    const upstream = transport(route.target).request(requestOptions(route.target, req.method ?? 'GET', req.url, headers, false));

    upstream.setTimeout(RESPONSE_TIMEOUT_MS, () => upstream.destroy(new Error('timeout')));
    upstream.on('response', (upstreamRes) => {
      upstream.setTimeout(STREAM_IDLE_TIMEOUT_MS);
      const { headers: outHeaders, foreignRedirect } = rewriteResponseHeaders(upstreamRes.headers, { targetOrigin, proxyOrigin, cookiePrefix: route.cookiePrefix });
      if (foreignRedirect) this.options.log.debug({ port: route.port, location: foreignRedirect }, 'Proxy passing through a redirect to another origin');
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage, outHeaders);
      upstreamRes.pipe(res);
      upstreamRes.on('error', () => res.destroy());
    });
    upstream.on('error', (error: NodeJS.ErrnoException) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const timedOut = error.message === 'timeout';
      this.options.log.debug({ port: route.port, target: targetOrigin, code: error.code ?? error.message }, 'Proxy request to target failed');
      sendProxyPage(
        res,
        timedOut ? 504 : 502,
        timedOut ? 'The service did not answer in time' : 'The service is not reachable',
        `LANdscape could not reach ${targetOrigin} (${timedOut ? 'timed out' : (error.code ?? 'network error')}).`,
      );
    });
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.on('error', () => upstream.destroy());
    req.pipe(upstream);
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', () => socket.destroy());
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));

    const route = this.options.route();
    if (!route || !isOriginForm(req.url)) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    if (!this.options.isAuthenticated(req.headers.cookie)) {
      rejectUpgrade(socket, 401, 'Unauthorized');
      return;
    }
    const proxyOrigin = proxyOriginFromHost(req.headers.host);
    if (!proxyOrigin) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }
    const targetOrigin = route.target.origin;
    const context = { targetOrigin, proxyOrigin, cookiePrefix: route.cookiePrefix };
    const headers = forwardRequestHeaders(req.headers, context, { upgrade: true });
    const upstream = transport(route.target).request(requestOptions(route.target, req.method ?? 'GET', req.url, headers, true));
    upstream.setTimeout(RESPONSE_TIMEOUT_MS, () => upstream.destroy(new Error('timeout')));

    upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      upstream.setTimeout(0);
      upstreamSocket.setTimeout(0);
      const { headers: outHeaders } = rewriteResponseHeaders(upstreamRes.headers, context, { upgrade: true });
      socket.write(serializeHead(upstreamRes.statusCode ?? 101, upstreamRes.statusMessage ?? 'Switching Protocols', outHeaders));
      if (upstreamHead.length > 0) socket.write(upstreamHead);
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.on('error', () => socket.destroy());
      upstreamSocket.on('close', () => socket.destroy());
      socket.on('close', () => upstreamSocket.destroy());
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });
    // The target answered without switching protocols: relay its response and close.
    upstream.on('response', (upstreamRes) => {
      const { headers: outHeaders } = rewriteResponseHeaders(upstreamRes.headers, context);
      outHeaders.connection = 'close';
      socket.write(serializeHead(upstreamRes.statusCode ?? 502, upstreamRes.statusMessage ?? '', outHeaders));
      upstreamRes.pipe(socket);
    });
    upstream.on('error', (error: NodeJS.ErrnoException) => {
      this.options.log.debug({ port: route.port, target: targetOrigin, code: error.code ?? error.message }, 'Proxy WebSocket upgrade to target failed');
      rejectUpgrade(socket, error.message === 'timeout' ? 504 : 502, error.message === 'timeout' ? 'Gateway Timeout' : 'Bad Gateway');
    });
    socket.on('close', () => upstream.destroy());
    upstream.end();
  }
}

function serializeHead(status: number, message: string, headers: OutgoingHttpHeaders): string {
  let head = `HTTP/1.1 ${status} ${message}\r\n`;
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) head += `${name}: ${String(item)}\r\n`;
  }
  return `${head}\r\n`;
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  if (socket.writable) socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  else socket.destroy();
}
