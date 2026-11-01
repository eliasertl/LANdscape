import { appManifestSchema, type AppManifest, type InstalledApp, type Permission } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { nowIso } from '../Ids';

interface AppRow extends Row {
  id: string;
  version: string;
  manifest: string;
  trusted: number;
  granted: string;
  source: string;
  installed_at: string;
  updated_at: string;
}

function toApp(row: AppRow): InstalledApp | null {
  const parsed = appManifestSchema.safeParse(JSON.parse(row.manifest));
  if (!parsed.success) return null;
  let granted: Permission[] = [];
  try {
    granted = JSON.parse(row.granted) as Permission[];
  } catch {
    granted = [];
  }
  return {
    id: row.id,
    version: row.version,
    manifest: parsed.data,
    trusted: Number(row.trusted) !== 0,
    granted,
    source: row.source as InstalledApp['source'],
    installedAt: row.installed_at,
    updatedAt: row.updated_at,
  };
}

/** Installed catalog apps and their per-app key/value storage. */
export class AppsRepository {
  constructor(private readonly db: Database) {}

  list(): InstalledApp[] {
    return this.db
      .all<AppRow>('SELECT * FROM apps ORDER BY installed_at')
      .map(toApp)
      .filter((app): app is InstalledApp => app !== null);
  }

  find(id: string): InstalledApp | undefined {
    const row = this.db.get<AppRow>('SELECT * FROM apps WHERE id = ?', id);
    return row ? (toApp(row) ?? undefined) : undefined;
  }

  upsert(input: { manifest: AppManifest; trusted: boolean; granted: Permission[]; source: InstalledApp['source'] }): InstalledApp {
    const now = nowIso();
    this.db.run(
      `INSERT INTO apps (id, version, manifest, trusted, granted, source, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET version = excluded.version, manifest = excluded.manifest, trusted = excluded.trusted, granted = excluded.granted, source = excluded.source, updated_at = excluded.updated_at`,
      input.manifest.id,
      input.manifest.version,
      JSON.stringify(input.manifest),
      input.trusted ? 1 : 0,
      JSON.stringify(input.granted),
      input.source,
      now,
      now,
    );
    return this.find(input.manifest.id) as InstalledApp;
  }

  setTrust(id: string, trusted: boolean, granted: Permission[]): InstalledApp | undefined {
    this.db.run('UPDATE apps SET trusted = ?, granted = ?, updated_at = ? WHERE id = ?', trusted ? 1 : 0, JSON.stringify(granted), nowIso(), id);
    return this.find(id);
  }

  delete(id: string): boolean {
    this.db.run('DELETE FROM app_storage WHERE app_id = ?', id);
    return this.db.run('DELETE FROM apps WHERE id = ?', id).changes > 0;
  }

  // ---- storage ------------------------------------------------------------

  storageGet(appId: string, key: string): unknown {
    const row = this.db.get<{ value: string }>('SELECT value FROM app_storage WHERE app_id = ? AND key = ?', appId, key);
    if (!row) return null;
    try {
      return JSON.parse(row.value) as unknown;
    } catch {
      return null;
    }
  }

  storageSet(appId: string, key: string, value: unknown): void {
    this.db.run(
      'INSERT INTO app_storage (app_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(app_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      appId,
      key,
      JSON.stringify(value),
      nowIso(),
    );
  }

  storageDelete(appId: string, key: string): boolean {
    return this.db.run('DELETE FROM app_storage WHERE app_id = ? AND key = ?', appId, key).changes > 0;
  }

  storageKeys(appId: string, prefix = ''): string[] {
    return this.db.all<{ key: string }>('SELECT key FROM app_storage WHERE app_id = ? AND key LIKE ? ORDER BY key', appId, `${prefix.replace(/[%_]/g, '\\$&')}%`).map((r) => r.key);
  }

  storageBytes(appId: string): number {
    const row = this.db.get<{ n: number }>('SELECT COALESCE(SUM(LENGTH(value)), 0) AS n FROM app_storage WHERE app_id = ?', appId);
    return Number(row?.n ?? 0);
  }
}
