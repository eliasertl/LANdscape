import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SessionInfo, SessionSummary } from '@landscape/shared';
import { SessionService, describeDevice, sessionKey } from '@server/Auth/Sessions';
import { Database } from '@server/Db/Database';
import { createRepositories } from '@server/Db/Repositories';
import { sniffMediaType } from '@server/Desktop/MediaStore';
import { createTestApp, loginCookie, TEST_PASSWORD, type TestApp } from './TestApp';

const sameOrigin = { origin: 'http://localhost', host: 'localhost' };

describe('session service', () => {
  it('auto-locks a session that stayed idle for the configured minutes, and unlock resets the clock', () => {
    const db = new Database(':memory:');
    const repos = createRepositories(db);
    let now = new Date('2026-11-01T10:00:00Z');
    let idle = 10;
    const sessions = new SessionService(repos.sessions, { idleMinutes: () => idle, now: () => now });
    const { id } = sessions.create('Mozilla/5.0 (Windows NT 10.0) Chrome/130');
    expect(sessions.validate(id)?.locked).toBe(false);
    now = new Date('2026-11-01T10:09:00Z');
    expect(sessions.validate(id)?.locked).toBe(false);
    now = new Date('2026-11-01T10:19:30Z'); // 10.5 min after the last touch at 10:09
    expect(sessions.validate(id)?.locked).toBe(true);
    // Locked stays locked even with activity, until unlock.
    now = new Date('2026-11-01T10:20:00Z');
    expect(sessions.validate(id)?.locked).toBe(true);
    sessions.unlock(id);
    expect(sessions.validate(id)?.locked).toBe(false);
    // With idle lock off nothing locks.
    idle = 0;
    now = new Date('2026-11-02T10:00:00Z');
    expect(sessions.validate(id)?.locked).toBe(false);
    db.close();
  });

  it('lists sessions with opaque keys and readable device names, and revokes by key', () => {
    const db = new Database(':memory:');
    const repos = createRepositories(db);
    const sessions = new SessionService(repos.sessions);
    const a = sessions.create('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1');
    const b = sessions.create('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari');
    const list = sessions.list(a.id);
    expect(list.map((s) => s.current)).toContain(true);
    expect(list.find((s) => s.current)?.device).toBe('Safari on macOS');
    expect(list.find((s) => !s.current)?.device).toBe('Chrome on Android');
    expect(list.every((s) => s.key.length === 16 && s.key !== a.id && s.key !== b.id)).toBe(true);
    expect(sessions.revokeByKey(sessionKey(b.id))).toBe(true);
    expect(sessions.validate(b.id)).toBeNull();
    expect(sessions.revokeByKey('0123456789abcdef')).toBe(false);
    expect(describeDevice('')).toBe('API client');
    expect(describeDevice('curl/8.0')).toBe('Unknown device');
    db.close();
  });
});

describe('lock and sessions API', () => {
  let app: TestApp;
  let cookie: string;
  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown, c = cookie) =>
    app.app.inject({ method, url, headers: { ...sameOrigin, cookie: c }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });

  beforeEach(async () => {
    app = await createTestApp();
    cookie = await loginCookie(app);
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('locks server-side: the API answers 423 until the password unlocks it', async () => {
    expect((await call('GET', '/api/desktop')).statusCode).toBe(200);
    expect((await call('POST', '/api/auth/lock')).statusCode).toBe(200);
    expect((await call('GET', '/api/desktop')).statusCode).toBe(423);
    expect((await call('GET', '/api/desktop')).json()).toMatchObject({ error: { code: 'locked' } });
    expect((await call('POST', '/api/shortcuts', { name: 'x', url: 'http://127.0.0.1:9/', iconMode: 'upload' })).statusCode).toBe(423);
    const probe = (await call('GET', '/api/auth/session')).json<SessionInfo>();
    expect(probe).toMatchObject({ authenticated: true, locked: true });
    expect((await call('POST', '/api/auth/unlock', { password: 'wrong' })).statusCode).toBe(401);
    expect((await call('GET', '/api/desktop')).statusCode).toBe(423);
    const unlocked = await call('POST', '/api/auth/unlock', { password: TEST_PASSWORD });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json<SessionInfo>().locked).toBe(false);
    expect((await call('GET', '/api/desktop')).statusCode).toBe(200);
  });

  it('keeps the proxy ports closed to a locked session', async () => {
    await call('POST', '/api/auth/lock');
    expect(app.ctx.proxy['deps'].isAuthenticated(cookie)).toBe(false);
    await call('POST', '/api/auth/unlock', { password: TEST_PASSWORD });
    expect(app.ctx.proxy['deps'].isAuthenticated(cookie)).toBe(true);
  });

  it('lists and revokes sessions, never the current one by key, and all others at once', async () => {
    const other = await loginCookie(app, '10.0.0.9');
    const third = await loginCookie(app, '10.0.0.10');
    const list = (await call('GET', '/api/auth/sessions')).json<SessionSummary[]>();
    expect(list).toHaveLength(3);
    const current = list.find((s) => s.current)!;
    const otherKey = list.find((s) => !s.current)!.key;
    expect((await call('DELETE', `/api/auth/sessions/${current.key}`)).statusCode).toBe(400);
    expect((await call('DELETE', `/api/auth/sessions/${otherKey}`)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/auth/sessions/${otherKey}`)).statusCode).toBe(404);
    expect((await call('GET', '/api/auth/sessions')).json<SessionSummary[]>()).toHaveLength(2);
    const revoked = (await call('DELETE', '/api/auth/sessions')).json<{ revoked: number }>();
    expect(revoked.revoked).toBe(1);
    expect((await call('GET', '/api/desktop', undefined, other)).statusCode).toBe(401);
    expect((await call('GET', '/api/desktop', undefined, third)).statusCode).toBe(401);
    expect((await call('GET', '/api/desktop')).statusCode).toBe(200);
  });

  it('applies the session lifetime setting to new cookies', async () => {
    await call('POST', '/api/settings' as never, undefined); // no-op guard: settings route is PATCH
    const patch = await app.app.inject({ method: 'PATCH', url: '/api/settings', headers: { ...sameOrigin, cookie }, payload: { security: { sessionDays: 7 } } });
    expect(patch.statusCode).toBe(200);
    const login = await app.app.inject({ method: 'POST', url: '/api/auth/login', headers: sameOrigin, payload: { username: 'admin', password: TEST_PASSWORD } });
    expect(login.cookies[0]?.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it('exposes the lock-screen look and the startup animation only when it plays on load', async () => {
    const anonymous = await app.app.inject({ method: 'GET', url: '/api/auth/session' });
    expect(anonymous.json<SessionInfo>()).toMatchObject({ authenticated: false, locked: false, startup: null, lockScreen: { clock: 'digital' } });
    await app.app.inject({ method: 'PATCH', url: '/api/settings', headers: { ...sameOrigin, cookie }, payload: { startup: { when: 'load', preset: 'boot-log' }, lock: { message: 'Hello', blur: 10 } } });
    const after = (await app.app.inject({ method: 'GET', url: '/api/auth/session' })).json<SessionInfo>();
    expect(after.startup?.preset).toBe('boot-log');
    expect(after.lockScreen).toMatchObject({ message: 'Hello', blur: 10 });
  });
});

describe('media uploads', () => {
  it('sniffs video and audio types from magic bytes', () => {
    expect(sniffMediaType(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe('video/webm');
    expect(sniffMediaType(Buffer.from('\0\0\0\x18ftypisom\0\0\0\0', 'latin1'))).toBe('video/mp4');
    expect(sniffMediaType(Buffer.from('OggS\0\0', 'latin1'))).toBe('audio/ogg');
    expect(sniffMediaType(Buffer.from('RIFF\0\0\0\0WAVEfmt ', 'latin1'))).toBe('audio/wav');
    expect(sniffMediaType(Buffer.from('ID3\x04\0', 'latin1'))).toBe('audio/mpeg');
    expect(sniffMediaType(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe('audio/mpeg');
    expect(sniffMediaType(Buffer.from('<svg></svg>'))).toBeNull();
  });

  it('accepts a PNG cursor, rejects other types, serves it behind the guard and lists it', async () => {
    const app = await createTestApp();
    try {
      const cookie = await loginCookie(app);
      const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
      const boundary = 'xyz';
      const body = (bytes: Buffer, name: string) =>
        Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const headers = { ...sameOrigin, cookie, 'content-type': `multipart/form-data; boundary=${boundary}` };
      const ok = await app.app.inject({ method: 'POST', url: '/api/uploads/media/cursor', headers, payload: body(png, 'c.png') });
      expect(ok.statusCode).toBe(200);
      const { file, url } = ok.json<{ file: string; url: string }>();
      expect(url).toBe(`/cursors/${file}`);
      expect((await app.app.inject({ method: 'GET', url, headers: { cookie } })).headers['content-type']).toBe('image/png');
      expect((await app.app.inject({ method: 'GET', url })).statusCode).toBe(401);
      const bad = await app.app.inject({ method: 'POST', url: '/api/uploads/media/cursor', headers, payload: body(Buffer.from('not an image'), 'c.txt') });
      expect(bad.statusCode).toBe(400);
      const jpegAsCursor = await app.app.inject({ method: 'POST', url: '/api/uploads/media/cursor', headers, payload: body(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 'c.jpg') });
      expect(jpegAsCursor.statusCode).toBe(400);
      const list = (await app.app.inject({ method: 'GET', url: '/api/uploads/media', headers: { cookie } })).json<{ cursor: string[] }>();
      expect(list.cursor).toContain(file);
      expect((await app.app.inject({ method: 'DELETE', url: `/api/uploads/media/cursor/${file}`, headers: { ...sameOrigin, cookie } })).statusCode).toBe(200);
      // Startup files are public: a logo may show before login.
      const logo = await app.app.inject({ method: 'POST', url: '/api/uploads/media/image', headers, payload: body(png, 'logo.png') });
      expect((await app.app.inject({ method: 'GET', url: logo.json<{ url: string }>().url })).statusCode).toBe(200);
    } finally {
      await app.cleanup();
    }
  });
});
