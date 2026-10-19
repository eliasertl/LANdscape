import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME } from '@landscape/shared';
import type { SessionService } from './Sessions';
import { forbidden, unauthorized } from '../Http/Errors';
import { hasSameOrigin } from '../Http/RequestUtils';

declare module 'fastify' {
  interface FastifyRequest {
    sessionId: string | null;
  }
}

/** Routes that must work without a session. Everything else under /api, /ws, /icons requires one. */
const PUBLIC_ROUTES = new Set(['GET /healthz', 'POST /api/auth/login', 'GET /api/auth/session']);

function isProtectedPath(url: string): boolean {
  return url.startsWith('/api/') || url.startsWith('/ws/') || url.startsWith('/icons/') || url.startsWith('/wallpapers/upload/');
}

export function readSessionId(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return unsigned.value;
}

/**
 * Same as readSessionId, for a raw Cookie header outside Fastify's request
 * cycle (the embed proxy ports). Browsers send LANdscape's cookie to every
 * port on the host, so the proxy can check it on each request.
 */
export function readSessionIdFromHeader(app: FastifyInstance, cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const raw = app.parseCookie(cookieHeader)[SESSION_COOKIE_NAME];
  if (!raw) return null;
  const unsigned = app.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  return unsigned.value;
}

/**
 * Installs the global session guard. Static client files stay public (the
 * lock screen has to load), everything that touches data or the host needs a
 * valid session. WebSocket upgrades additionally require a same-origin Origin.
 */
export function installGuard(app: FastifyInstance, sessions: SessionService): void {
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', (request: FastifyRequest, reply: FastifyReply, done) => {
    const pathname = request.url.split('?')[0] ?? request.url;
    const key = `${request.method} ${pathname}`;

    const session = sessions.validate(readSessionId(request));
    request.sessionId = session?.id ?? null;

    if (PUBLIC_ROUTES.has(key) || !isProtectedPath(pathname)) {
      done();
      return;
    }
    if (!session) {
      done(unauthorized());
      return;
    }
    const isUpgrade = (request.headers.upgrade ?? '').toLowerCase() === 'websocket';
    if ((isUpgrade || pathname.startsWith('/ws/')) && !hasSameOrigin(request)) {
      done(forbidden('Cross-origin WebSocket connections are not allowed'));
      return;
    }
    // Same-origin check for state-changing API calls too (defence in depth next to SameSite=Strict).
    if (pathname.startsWith('/api/') && request.method !== 'GET' && request.method !== 'HEAD' && !hasSameOrigin(request)) {
      done(forbidden('Cross-origin requests are not allowed'));
      return;
    }
    done();
  });
}
