import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, loginSchema, resolveWallpaper, sessionKeySchema, unlockSchema, type SessionInfo } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { HttpError, badRequest, notFound, parseOrThrow, unauthorized } from '../Http/Errors';
import { clientIp } from '../Http/RequestUtils';
import { verifyCredentials } from './Password';
import { readSessionId } from './Guard';
import { DEFAULT_WALLPAPER } from '../Db/Repositories/SettingsRepository';

export function registerAuthRoutes(app: FastifyInstance, ctx: ServerContext): void {
  const cookieOptions = () => ({
    path: '/',
    httpOnly: true,
    sameSite: 'strict' as const,
    signed: true,
    // `secure` is deliberately off: LANdscape runs on plain http inside a LAN/VPN.
    secure: false,
    maxAge: ctx.repos.settings.get().security.sessionDays * 24 * 60 * 60,
  });

  /** Checks the password with the IP lockout applied (shared by login and unlock). */
  async function checkPassword(request: FastifyRequest, username: string, password: string): Promise<void> {
    const ip = clientIp(request);
    const lockedFor = ctx.lockout.lockedFor(ip);
    if (lockedFor > 0) {
      throw new HttpError(429, 'locked_out', `Too many failed attempts. Try again in ${formatDuration(lockedFor)}.`, { retryAfterSeconds: lockedFor });
    }
    const ok = await verifyCredentials(username, password, ctx.config.loginUsername, ctx.config.loginPasswordHash);
    if (!ok) {
      const result = ctx.lockout.recordFailure(ip);
      request.log.warn({ ip }, 'Failed login attempt');
      if (result.lockedForSeconds > 0) {
        throw new HttpError(429, 'locked_out', `Too many failed attempts. Try again in ${formatDuration(result.lockedForSeconds)}.`, {
          retryAfterSeconds: result.lockedForSeconds,
        });
      }
      throw new HttpError(401, 'invalid_credentials', 'Wrong username or password.', { attemptsRemaining: result.remaining });
    }
    ctx.lockout.recordSuccess(ip);
  }

  /** Only bundled wallpapers are shown before login; an uploaded one may be personal. */
  function lockScreenWallpaper(): string {
    const settings = ctx.repos.settings.get();
    const wallpaper = resolveWallpaper({ wallpaper: settings.wallpaper, ...settings.appearance }, new Date());
    if (wallpaper.kind === 'bundled') return `/wallpapers/bundled/${wallpaper.file}`;
    return `/wallpapers/bundled/${DEFAULT_WALLPAPER.file}`;
  }

  function sessionInfo(request: FastifyRequest): SessionInfo {
    const settings = ctx.repos.settings.get();
    const authenticated = request.sessionId !== null;
    return {
      authenticated,
      locked: request.sessionLocked,
      username: authenticated ? ctx.config.loginUsername : null,
      lockScreenWallpaper: lockScreenWallpaper(),
      lockScreen: { clock: settings.lock.clock, showDate: settings.lock.showDate, message: settings.lock.message, blur: settings.lock.blur },
      startup: settings.startup.when === 'load' || settings.startup.when === 'both' ? settings.startup : null,
    };
  }

  app.post('/api/auth/login', async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body);
    await checkPassword(request, body.username, body.password);
    const session = ctx.sessions.create(String(request.headers['user-agent'] ?? ''));
    void reply.setCookie(SESSION_COOKIE_NAME, session.id, cookieOptions());
    request.log.info({ ip: clientIp(request) }, 'Login succeeded');
    request.sessionId = session.id;
    request.sessionLocked = false;
    return sessionInfo(request);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const id = readSessionId(request);
    if (id) ctx.sessions.destroy(id);
    void reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/session', async (request) => sessionInfo(request));

  // ---- lock ------------------------------------------------------------------
  /** Marks the session locked: every other route answers 423 until unlock. */
  app.post('/api/auth/lock', async (request) => {
    if (!request.sessionId) throw unauthorized();
    ctx.sessions.lock(request.sessionId);
    request.log.info('Session locked');
    return { ok: true };
  });

  /** Unlocks with the password (same lockout as login); the username is fixed. */
  app.post('/api/auth/unlock', async (request) => {
    if (!request.sessionId) throw unauthorized();
    const body = parseOrThrow(unlockSchema, request.body);
    await checkPassword(request, ctx.config.loginUsername, body.password);
    ctx.sessions.unlock(request.sessionId);
    request.sessionLocked = false;
    return sessionInfo(request);
  });

  /** Activity heartbeat from an active tab: keeps the idle lock from firing while the user is present. */
  app.post('/api/auth/activity', async (request) => {
    if (!request.sessionId) throw unauthorized();
    // validate() in the guard already touched last_seen_at for this request.
    return { ok: true };
  });

  // ---- sessions ----------------------------------------------------------------
  app.get('/api/auth/sessions', async (request) => ctx.sessions.list(request.sessionId));

  app.delete('/api/auth/sessions/:key', async (request) => {
    const { key } = parseOrThrow(z.object({ key: sessionKeySchema }), request.params);
    const current = request.sessionId ? ctx.sessions.list(request.sessionId).find((s) => s.current)?.key : null;
    if (key === current) throw badRequest('Use Log out to end the current session.');
    if (!ctx.sessions.revokeByKey(key)) throw notFound('Session not found');
    request.log.info({ key }, 'Session revoked');
    return { ok: true };
  });

  /** Ends every session except the current one. */
  app.delete('/api/auth/sessions', async (request) => {
    if (!request.sessionId) throw unauthorized();
    const revoked = ctx.sessions.revokeOthers(request.sessionId);
    request.log.info({ revoked }, 'Other sessions revoked');
    return { ok: true, revoked };
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
