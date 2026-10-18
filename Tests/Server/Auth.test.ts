import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOCKOUT_MAX_FAILURES } from '@landscape/shared';
import { Lockout } from '@server/Auth/Lockout';
import { ConfigError, loadConfig, looksLikeBcryptHash } from '@server/Config';
import { createTestApp, loginCookie, TEST_PASSWORD, TEST_PASSWORD_HASH, TEST_USERNAME, type TestApp } from './TestApp';

const sameOrigin = { origin: 'http://localhost', host: 'localhost' };

describe('configuration', () => {
  it('refuses to start without login credentials', () => {
    const saved = { ...process.env };
    delete process.env.LOGIN_USERNAME;
    delete process.env.LOGIN_PASSWORD_HASH;
    try {
      expect(() => loadConfig()).toThrow(ConfigError);
      process.env.LOGIN_USERNAME = 'admin';
      expect(() => loadConfig()).toThrow(/LOGIN_PASSWORD_HASH/);
      process.env.LOGIN_PASSWORD_HASH = 'not-a-hash';
      expect(() => loadConfig()).toThrow(/bcrypt/);
      process.env.LOGIN_PASSWORD_HASH = TEST_PASSWORD_HASH;
      expect(loadConfig().loginUsername).toBe('admin');
    } finally {
      process.env = saved;
    }
  });

  it('recognises bcrypt hashes', () => {
    expect(looksLikeBcryptHash(TEST_PASSWORD_HASH)).toBe(true);
    expect(looksLikeBcryptHash('$2y$10$abc')).toBe(false);
    expect(looksLikeBcryptHash('plain')).toBe(false);
  });
});

describe('lockout', () => {
  it('locks after the configured number of failures and expires', () => {
    let now = 1_000_000;
    const lockout = new Lockout(3, 60_000, () => now);
    expect(lockout.recordFailure('a').remaining).toBe(2);
    expect(lockout.recordFailure('a').remaining).toBe(1);
    const third = lockout.recordFailure('a');
    expect(third.remaining).toBe(0);
    expect(third.lockedForSeconds).toBe(60);
    expect(lockout.lockedFor('a')).toBe(60);
    expect(lockout.lockedFor('b')).toBe(0);
    now += 30_000;
    expect(lockout.lockedFor('a')).toBe(30);
    now += 31_000;
    expect(lockout.lockedFor('a')).toBe(0);
  });
});

describe('login and sessions', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('rejects wrong credentials', async () => {
    const wrongPassword = await app.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: sameOrigin,
      payload: { username: TEST_USERNAME, password: 'nope' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json()).toMatchObject({ error: { code: 'invalid_credentials' } });
    expect(wrongPassword.cookies).toHaveLength(0);

    const wrongUser = await app.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: sameOrigin,
      payload: { username: 'someone', password: TEST_PASSWORD },
    });
    expect(wrongUser.statusCode).toBe(401);
  });

  it('accepts correct credentials and sets a strict httpOnly cookie', async () => {
    const response = await app.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: sameOrigin,
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: true, username: TEST_USERNAME });
    const cookie = response.cookies[0];
    expect(cookie).toBeDefined();
    expect(cookie?.name).toBe('landscape_session');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    expect(cookie?.path).toBe('/');
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
  });

  it('locks an IP after repeated failures', async () => {
    for (let i = 0; i < LOCKOUT_MAX_FAILURES; i += 1) {
      const response = await app.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '10.0.0.7',
        headers: sameOrigin,
        payload: { username: TEST_USERNAME, password: 'wrong' },
      });
      expect([401, 429]).toContain(response.statusCode);
    }
    const locked = await app.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.0.0.7',
      headers: sameOrigin,
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    expect(locked.statusCode).toBe(429);
    const lockedBody = locked.json<{ error: { code: string; details: { retryAfterSeconds: number } } }>();
    expect(lockedBody.error.code).toBe('locked_out');
    expect(lockedBody.error.details.retryAfterSeconds).toBeGreaterThan(0);

    // A different IP is unaffected.
    const other = await app.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.0.0.8',
      headers: sameOrigin,
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    expect(other.statusCode).toBe(200);
  });

  it('reports the session state and supports logout', async () => {
    const anonymous = await app.app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toMatchObject({ authenticated: false, username: null });

    const cookie = await loginCookie(app);
    const authed = await app.app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie } });
    expect(authed.json()).toMatchObject({ authenticated: true, username: TEST_USERNAME });

    const logout = await app.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie, ...sameOrigin } });
    expect(logout.statusCode).toBe(200);

    const after = await app.app.inject({ method: 'GET', url: '/api/desktop', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rejects tampered cookies', async () => {
    const cookie = await loginCookie(app);
    const tampered = cookie.replace(/=(.)/, (_m, c: string) => `=${c === 'a' ? 'b' : 'a'}`);
    const response = await app.app.inject({ method: 'GET', url: '/api/desktop', headers: { cookie: tampered } });
    expect(response.statusCode).toBe(401);
  });
});

describe('session guard', () => {
  let app: TestApp;
  beforeEach(async () => {
    app = await createTestApp();
  });
  afterEach(async () => {
    await app.cleanup();
  });

  const protectedRoutes: [string, string][] = [
    ['GET', '/api/desktop'],
    ['GET', '/api/shortcuts'],
    ['POST', '/api/shortcuts'],
    ['GET', '/api/settings'],
    ['PATCH', '/api/settings'],
    ['GET', '/api/wallpapers'],
    ['GET', '/icons/anything.png'],
    ['PUT', '/api/window-memory/app:terminal'],
    ['GET', '/api/does-not-exist'],
  ];

  it.each(protectedRoutes)('%s %s requires a session', async (method, url) => {
    const response = await app.app.inject({ method: method as 'GET', url, headers: sameOrigin, payload: {} });
    expect(response.statusCode).toBe(401);
  });

  it('allows the health check without a session', async () => {
    const response = await app.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it('rejects state-changing cross-origin requests even with a session', async () => {
    const cookie = await loginCookie(app);
    const response = await app.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie, origin: 'http://evil.example', host: 'localhost' },
      payload: { theme: 'dark' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('sends hardened security headers', async () => {
    const response = await app.app.inject({ method: 'GET', url: '/healthz' });
    expect(response.headers['x-frame-options']).toBe('DENY');
    const csp = String(response.headers['content-security-policy']);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain('frame-src http: https:');
    expect(csp).toContain("default-src 'self'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });
});
