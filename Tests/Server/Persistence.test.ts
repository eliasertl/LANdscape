import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '@server/App';
import { loadConfig } from '@server/Config';
import { Database } from '@server/Db/Database';
import { createRepositories, seedDefaults } from '@server/Db/Repositories';
import { updatePositions } from '@server/Db/Repositories/Positions';
import { SCHEMA_VERSION } from '@server/Db/Migrations';
import { loadOrCreateSessionSecret } from '@server/Auth/SecretStore';
import { TEST_PASSWORD, TEST_PASSWORD_HASH, TEST_USERNAME } from './TestApp';

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'landscape-persist-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('database', () => {
  it('migrates to the current schema and seeds default widgets once', () => {
    const db = new Database(':memory:');
    expect(db.userVersion).toBe(SCHEMA_VERSION);
    const repos = createRepositories(db);
    seedDefaults(repos);
    expect(repos.widgets.list().map((w) => w.type)).toEqual(['clock', 'cpu', 'ram']);
    repos.widgets.delete(repos.widgets.list()[0]!.id);
    seedDefaults(repos);
    expect(repos.widgets.list()).toHaveLength(2);
    expect(repos.shortcuts.list()).toEqual([]);
    db.close();
  });

  it('round-trips shortcuts, widgets, window memory and settings', () => {
    const db = new Database(':memory:');
    const repos = createRepositories(db);
    const shortcut = repos.shortcuts.create({
      name: 'Wiki',
      url: 'https://en.wikipedia.org',
      iconMode: 'favicon',
      iconFile: null,
      position: { anchorX: 'left', anchorY: 'top', offsetCol: 0, offsetRow: 0 },
      folderId: null,
      embeddable: 'yes',
      embedReason: 'ok',
      openMode: 'auto',
    });
    expect(repos.shortcuts.find(shortcut.id)).toMatchObject({ name: 'Wiki', embeddable: 'yes' });
    const moved = { anchorX: 'right' as const, anchorY: 'bottom' as const, offsetCol: 1, offsetRow: 2 };
    updatePositions(db, [{ kind: 'shortcut', id: shortcut.id, position: moved }]);
    expect(repos.shortcuts.find(shortcut.id)).toMatchObject({ position: moved });

    const widget = repos.widgets.create('cpu', { anchorX: 'left', anchorY: 'top', offsetCol: 1, offsetRow: 1 }, 'm', { intervalMs: 3000 });
    expect(widget.settings.intervalMs).toBe(3000);
    repos.widgets.update(widget.id, { settings: { intervalMs: 4000, extra: true } });
    expect(repos.widgets.find(widget.id)?.settings).toEqual({ intervalMs: 4000, extra: true });

    repos.windowMemory.set('app:terminal', { x: 1, y: 2, width: 800, height: 600, maximized: false });
    repos.windowMemory.set('app:terminal', { x: 5, y: 6, width: 900, height: 700, maximized: true });
    expect(repos.windowMemory.all()).toEqual({ 'app:terminal': { x: 5, y: 6, width: 900, height: 700, maximized: true } });

    expect(repos.settings.get().theme).toBe('system');
    repos.settings.update({ theme: 'dark', enabledApps: { terminal: false } });
    const settings = repos.settings.get();
    expect(settings.theme).toBe('dark');
    expect(settings.enabledApps.terminal).toBe(false);
    // Apps that were never switched off are simply absent (enabled).
    expect(settings.enabledApps.files).toBeUndefined();
    db.close();
  });
});

describe('restart persistence', () => {
  it('keeps a session valid across a restart with a generated secret', async () => {
    const dataDir = tempDir();
    const makeConfig = () =>
      loadConfig({
        loginUsername: TEST_USERNAME,
        loginPasswordHash: TEST_PASSWORD_HASH,
        dataDir,
        sessionSecret: null,
        clientDir: path.join(dataDir, 'none'),
        logLevel: 'silent',
      });

    const first = await buildApp({ config: makeConfig(), logger: false });
    const login = await first.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: 'http://localhost', host: 'localhost' },
      payload: { username: TEST_USERNAME, password: TEST_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0]!;
    await first.close();

    const second = await buildApp({ config: makeConfig(), logger: false });
    const response = await second.app.inject({
      method: 'GET',
      url: '/api/desktop',
      headers: { cookie: `${cookie.name}=${cookie.value}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ shortcuts: [], settings: { theme: 'system' } });
    await second.close();
  });

  it('generates the session secret once and reuses it', () => {
    const dataDir = tempDir();
    const a = loadOrCreateSessionSecret(null, dataDir);
    const b = loadOrCreateSessionSecret(null, dataDir);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(loadOrCreateSessionSecret('explicit', dataDir)).toBe('explicit');
  });
});
