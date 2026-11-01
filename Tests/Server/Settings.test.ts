import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, applySettingsPatch, readSettingValue, settingsUpdateSchema } from '@landscape/shared';
import { createTestApp, loginCookie } from './TestApp';

describe('settings model', () => {
  it('fills missing keys and fields with defaults', () => {
    expect(readSettingValue('proxy', undefined)).toEqual({ idleGraceSeconds: 60 });
    expect(readSettingValue('proxy', {})).toEqual({ idleGraceSeconds: 60 });
    expect(readSettingValue('theme', 'dark')).toBe('dark');
  });

  it('falls back to the default when a stored value no longer validates', () => {
    expect(readSettingValue('proxy', { idleGraceSeconds: 'soon' })).toEqual(DEFAULT_SETTINGS.proxy);
    expect(readSettingValue('theme', 'sepia')).toBe('system');
  });

  it('merges groups field by field and replaces scalars', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, { proxy: { idleGraceSeconds: 120 }, enabledApps: { terminal: false }, theme: 'dark' });
    expect(next.proxy.idleGraceSeconds).toBe(120);
    expect(next.enabledApps).toEqual({ terminal: false });
    expect(next.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.proxy.idleGraceSeconds).toBe(60);
  });

  it('rejects unknown keys and out-of-range values', () => {
    expect(settingsUpdateSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ proxy: { idleGraceSeconds: 1 } }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ enabledApps: { 'Bad Id': false } }).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ enabledApps: { weather: false } }).success).toBe(true);
  });

  it('persists a partial group update over the API', async () => {
    const app = await createTestApp();
    try {
      const cookie = await loginCookie(app);
      const headers = { cookie, origin: 'http://localhost', host: 'localhost' };
      const patched = await app.app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { proxy: { idleGraceSeconds: 300 } } });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ proxy: { idleGraceSeconds: 300 }, theme: 'system' });
      const invalid = await app.app.inject({ method: 'PATCH', url: '/api/settings', headers, payload: { proxy: { idleGraceSeconds: 5 } } });
      expect(invalid.statusCode).toBe(400);
      const read = await app.app.inject({ method: 'GET', url: '/api/settings', headers });
      expect(read.json()).toMatchObject({ proxy: { idleGraceSeconds: 300 } });
    } finally {
      await app.cleanup();
    }
  });
});
