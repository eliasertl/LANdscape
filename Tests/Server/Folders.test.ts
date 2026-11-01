import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Folder, Shortcut, Widget } from '@landscape/shared';
import { MIGRATIONS } from '@server/Db/Migrations';
import { Database } from '@server/Db/Database';
import { createRepositories } from '@server/Db/Repositories';
import { createTestApp, loginCookie, type TestApp } from './TestApp';

const sameOrigin = { origin: 'http://localhost', host: 'localhost' };
const topLeft = (col: number, row: number) => ({ anchorX: 'left' as const, anchorY: 'top' as const, offsetCol: col, offsetRow: row });

describe('desktop folders and layout API', () => {
  let app: TestApp;
  let cookie: string;
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
    app.app.inject({ method, url, headers: { ...sameOrigin, cookie }, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) });

  beforeEach(async () => {
    app = await createTestApp();
    cookie = await loginCookie(app);
  });
  afterEach(async () => {
    await app.cleanup();
  });

  it('creates, renames and lists folders in the bootstrap', async () => {
    const created = await call('POST', '/api/folders', { name: 'Media', position: topLeft(3, 0) });
    expect(created.statusCode).toBe(201);
    const folder = created.json<Folder>();
    expect(folder).toMatchObject({ name: 'Media', position: topLeft(3, 0) });
    expect((await call('PATCH', `/api/folders/${folder.id}`, { name: 'Movies' })).json<Folder>().name).toBe('Movies');
    expect((await call('GET', '/api/desktop')).json<{ folders: Folder[] }>().folders).toHaveLength(1);
    expect((await call('POST', '/api/folders', { name: '' })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/folders/nope', { name: 'x' })).statusCode).toBe(404);
  });

  it('moves shortcuts into a folder and back onto the desktop when the folder is deleted', async () => {
    const folder = (await call('POST', '/api/folders', { name: 'Media', position: topLeft(0, 0) })).json<Folder>();
    const shortcut = (await call('POST', '/api/shortcuts', { name: 'Example', url: 'http://127.0.0.1:9/', iconMode: 'upload', folderId: folder.id })).json<Shortcut>();
    expect(shortcut.folderId).toBe(folder.id);
    expect((await call('POST', '/api/shortcuts', { name: 'Bad', url: 'http://127.0.0.1:9/', iconMode: 'upload', folderId: 'missing' })).statusCode).toBe(404);

    const moved = (await call('PATCH', `/api/shortcuts/${shortcut.id}`, { folderId: null, position: topLeft(5, 5) })).json<Shortcut>();
    expect(moved).toMatchObject({ folderId: null, position: topLeft(5, 5) });
    await call('PATCH', `/api/shortcuts/${shortcut.id}`, { folderId: folder.id });

    const deleted = await call('DELETE', `/api/folders/${folder.id}`);
    expect(deleted.statusCode).toBe(200);
    const back = deleted.json<{ shortcuts: Shortcut[] }>().shortcuts.find((s) => s.id === shortcut.id);
    expect(back?.folderId).toBeNull();
    // First free cell on the nominal 19 × 8 desktop: the seeded widgets reserve column 0 up to row 4, so (0, 5),
    // which lies in the bottom third and is therefore stored as a bottom anchor.
    expect(back?.position).toEqual({ anchorX: 'left', anchorY: 'bottom', offsetCol: 0, offsetRow: 2 });
    expect(app.ctx.repos.folders.list()).toEqual([]);
  });

  it('moves a mix of items in one call and validates them', async () => {
    const folder = (await call('POST', '/api/folders', { name: 'F', position: topLeft(0, 0) })).json<Folder>();
    const widget = (await call('POST', '/api/widgets', { type: 'clock', position: topLeft(1, 1), size: 'l' })).json<Widget>();
    expect(widget.size).toBe('l');
    const right = { anchorX: 'right' as const, anchorY: 'bottom' as const, offsetCol: 0, offsetRow: 1 };
    const response = await call('PUT', '/api/desktop/positions', {
      items: [
        { kind: 'folder', id: folder.id, position: right },
        { kind: 'widget', id: widget.id, position: { ...right, anchorX: 'center' } },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(app.ctx.repos.folders.find(folder.id)?.position).toEqual(right);
    expect(app.ctx.repos.widgets.find(widget.id)?.position).toEqual({ ...right, anchorX: 'center' });
    expect((await call('PUT', '/api/desktop/positions', { items: [{ kind: 'shortcut', id: 'x', position: { anchorX: 'middle', anchorY: 'top', offsetCol: 0, offsetRow: 0 } }] })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/widgets/${widget.id}`, { size: 'xl' })).statusCode).toBe(400);
    expect((await call('PATCH', `/api/widgets/${widget.id}`, { size: 's' })).json<Widget>().size).toBe('s');
  });
});

describe('migration to anchored positions', () => {
  it('turns stored pixel positions into top-left anchors so nothing moves', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'landscape-migrate-'));
    const file = path.join(dir, 'landscape.db');
    try {
      // A version-2 database with a shortcut at cell (3, 2) and a widget at cell (0, 1), in pixels.
      const raw = new DatabaseSync(file);
      raw.exec(MIGRATIONS[0] as string);
      raw.exec(MIGRATIONS[1] as string);
      raw.exec('PRAGMA user_version = 2');
      raw.prepare("INSERT INTO shortcuts (id, name, url, x, y, created_at, updated_at) VALUES ('s1', 'S', 'http://a/', ?, ?, 't', 't')").run(16 + 3 * 96, 16 + 2 * 112);
      raw.prepare("INSERT INTO widgets (id, type, x, y, settings, created_at) VALUES ('w1', 'cpu', ?, ?, '{}', 't')").run(16, 16 + 112 + 30);
      raw.close();

      const db = new Database(file);
      const repos = createRepositories(db);
      expect(repos.shortcuts.find('s1')).toMatchObject({ position: topLeft(3, 2), folderId: null });
      expect(repos.widgets.find('w1')).toMatchObject({ position: topLeft(0, 1), size: 'm' });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
