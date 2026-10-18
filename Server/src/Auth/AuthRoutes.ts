import type { FastifyInstance } from 'fastify';
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS, loginSchema, type SessionInfo } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { HttpError, parseOrThrow } from '../Http/Errors';
import { clientIp } from '../Http/RequestUtils';
import { verifyCredentials } from './Password';
import { readSessionId } from './Guard';
import { DEFAULT_WALLPAPER } from '../Db/Repositories/SettingsRepository';

export function registerAuthRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    signed: true,
    // `secure` is deliberately off: LANdscape runs on plain http inside a LAN/VPN.
    secure: false,
    maxAge: Math.floor(SESSION_DURATION_MS / 1000),
  };

  app.post('/api/auth/login', async (request, reply) => {
    const ip = clientIp(request);
    const lockedFor = ctx.lockout.lockedFor(ip);
    if (lockedFor > 0) {
      throw new HttpError(429, 'locked_out', `Too many failed attempts. Try again in ${formatDuration(lockedFor)}.`, {
        retryAfterSeconds: lockedFor,
      });
    }

    const body = parseOrThrow(loginSchema, request.body);
    const ok = await verifyCredentials(body.username, body.password, ctx.config.loginUsername, ctx.config.loginPasswordHash);
    if (!ok) {
      const result = ctx.lockout.recordFailure(ip);
      request.log.warn({ ip }, 'Failed login attempt');
      if (result.lockedForSeconds > 0) {
        throw new HttpError(
          429,
          'locked_out',
          `Too many failed attempts. Try again in ${formatDuration(result.lockedForSeconds)}.`,
          { retryAfterSeconds: result.lockedForSeconds },
        );
      }
      throw new HttpError(401, 'invalid_credentials', 'Wrong username or password.', {
        attemptsRemaining: result.remaining,
      });
    }

    ctx.lockout.recordSuccess(ip);
    const session = ctx.sessions.create(String(request.headers['user-agent'] ?? ''));
    void reply.setCookie(SESSION_COOKIE_NAME, session.id, cookieOptions);
    request.log.info({ ip }, 'Login succeeded');
    const info: SessionInfo = { authenticated: true, username: ctx.config.loginUsername, lockScreenWallpaper: lockScreenWallpaper() };
    return info;
  });

  /** Only bundled wallpapers are shown before login; an uploaded one may be personal. */
  function lockScreenWallpaper(): string {
    const { wallpaper } = ctx.repos.settings.get();
    if (wallpaper.kind === 'bundled') return `/wallpapers/bundled/${wallpaper.file}`;
    return `/wallpapers/bundled/${DEFAULT_WALLPAPER.file}`;
  }

  app.post('/api/auth/logout', async (request, reply) => {
    const id = readSessionId(request);
    if (id) ctx.sessions.destroy(id);
    void reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/session', async (request) => {
    const info: SessionInfo = request.sessionId
      ? { authenticated: true, username: ctx.config.loginUsername, lockScreenWallpaper: lockScreenWallpaper() }
      : { authenticated: false, username: null, lockScreenWallpaper: lockScreenWallpaper() };
    return info;
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
