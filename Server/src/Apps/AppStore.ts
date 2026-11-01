import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import {
  compareVersions,
  manifestEntries,
  newPermissions,
  parseManifest,
  type AppManifest,
  type CatalogEntry,
  type InstalledApp,
  type Permission,
} from '@landscape/shared';
import type { Repositories } from '../Db/Repositories';
import { isSafeSvg, resolveDataFile, sniffImageType } from '../Desktop/DataFiles';
import { readZip, type ZipEntry } from './Zip';

export class AppInstallError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid_bundle' | 'permissions_required' | 'not_found' | 'checksum_mismatch' | 'conflict' = 'invalid_bundle',
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppInstallError';
  }
}

export interface InstallOptions {
  source: InstalledApp['source'];
  /** Permissions the user approved (the install dialog); missing ones are not granted. */
  approve: Permission[] | 'all';
  trusted?: boolean;
  /** Catalog installs verify the zip against the catalog entry. */
  expectedSha256?: string | null;
}

/** An unpacked, validated bundle before it is written to disk. */
export interface PreparedBundle {
  manifest: AppManifest;
  entries: ZipEntry[];
  sha256: string;
  size: number;
}

const RASTER = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/**
 * Validates a bundle: manifest present and valid, every referenced file
 * exists, SVGs contain no scripts, images are what their extension says.
 */
export function prepareBundle(buffer: Buffer): PreparedBundle {
  const entries = readZip(buffer);
  // Allow a single top-level folder (zip of a directory): strip it when every entry shares it.
  const roots = new Set(entries.map((e) => e.name.split('/')[0]));
  const stripped = roots.size === 1 && !entries.some((e) => e.name === 'manifest.json') ? entries.map((e) => ({ ...e, name: e.name.split('/').slice(1).join('/') })).filter((e) => e.name) : entries;
  const manifestEntry = stripped.find((e) => e.name === 'manifest.json');
  if (!manifestEntry) throw new AppInstallError('The bundle has no manifest.json at its root');
  const parsed = parseManifest(manifestEntry.data.toString('utf8'));
  if (parsed.manifest === null) throw new AppInstallError(parsed.error);
  const manifest = parsed.manifest;
  const byName = new Map(stripped.map((e) => [e.name, e]));
  for (const file of manifestEntries(manifest)) {
    if (!byName.has(file)) throw new AppInstallError(`manifest.json references ${file}, which is not in the bundle`);
  }
  for (const entry of stripped) {
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'svg' && !isSafeSvg(entry.data.toString('utf8'))) throw new AppInstallError(`${entry.name} contains scripts or event handlers and was rejected`);
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      const mime = sniffImageType(entry.data);
      if (!mime || !RASTER.includes(mime)) throw new AppInstallError(`${entry.name} is not the image type its name says`);
    }
  }
  return { manifest, entries: stripped, sha256: createHash('sha256').update(buffer).digest('hex'), size: buffer.length };
}

/**
 * Installs, updates and removes catalog apps. Bundles live in
 * DATA_DIR/apps/<id>/<version>/; the apps table holds the manifest, the
 * trust flag and the granted permissions.
 */
export class AppStore {
  readonly dir: string;

  constructor(
    dataDir: string,
    private readonly repos: Repositories,
    private readonly log: FastifyBaseLogger,
    private readonly hooks: { onRemoved: (id: string) => void; onInstalled: (app: InstalledApp) => void },
  ) {
    this.dir = path.join(dataDir, 'apps');
    mkdirSync(this.dir, { recursive: true });
  }

  list(): InstalledApp[] {
    return this.repos.apps.list();
  }

  find(id: string): InstalledApp | undefined {
    return this.repos.apps.find(id);
  }

  bundleDir(app: Pick<InstalledApp, 'id' | 'version'>): string {
    return path.join(this.dir, app.id, app.version);
  }

  /** Reads a file of the installed bundle; null when missing or outside the bundle. */
  readFile(app: Pick<InstalledApp, 'id' | 'version'>, bundlePath: string): Buffer | null {
    const base = path.resolve(this.bundleDir(app));
    const full = path.resolve(base, bundlePath.replace(/\\/g, '/'));
    if (full !== base && !full.startsWith(base + path.sep)) return null;
    try {
      return readFileSync(full);
    } catch {
      return null;
    }
  }

  /** Installs or updates from a zip. Throws AppInstallError('permissions_required') with the new permissions when an update needs approval. */
  install(buffer: Buffer, options: InstallOptions): InstalledApp {
    const bundle = prepareBundle(buffer);
    if (options.expectedSha256 && options.expectedSha256 !== bundle.sha256) {
      throw new AppInstallError('The downloaded bundle does not match the catalog checksum (sha256). It was not installed.', 'checksum_mismatch');
    }
    const existing = this.repos.apps.find(bundle.manifest.id);
    const requested = bundle.manifest.permissions;
    let granted: Permission[];
    let trusted = options.trusted ?? existing?.trusted ?? false;
    if (existing) {
      const added = newPermissions(existing.granted, requested).filter((p) => existing.granted.includes(p) === false);
      const unapproved = options.approve === 'all' ? [] : added.filter((p) => !options.approve.includes(p));
      if (unapproved.length > 0 && !existing.trusted) {
        throw new AppInstallError(`${bundle.manifest.name} ${bundle.manifest.version} needs new permissions: ${unapproved.join(', ')}.`, 'permissions_required', { permissions: added });
      }
      granted = requested.filter((p) => existing.granted.includes(p) || options.approve === 'all' || options.approve.includes(p) || existing.trusted);
      if (compareVersions(bundle.manifest.version, existing.version) < 0) this.log.warn({ app: bundle.manifest.id }, 'Installing an older version over a newer one');
    } else {
      granted = options.approve === 'all' ? requested : requested.filter((p) => options.approve.includes(p));
      trusted = options.trusted ?? false;
    }

    const target = this.bundleDir(bundle.manifest);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    for (const entry of bundle.entries) {
      const full = path.join(target, ...entry.name.split('/'));
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, entry.data);
    }
    writeFileSync(path.join(target, '.bundle.json'), JSON.stringify({ sha256: bundle.sha256, size: bundle.size, installedAt: new Date().toISOString() }));
    // Older versions go away once the new one is in place.
    for (const version of this.safeList(path.join(this.dir, bundle.manifest.id))) {
      if (version !== bundle.manifest.version) rmSync(path.join(this.dir, bundle.manifest.id, version), { recursive: true, force: true });
    }
    const app = this.repos.apps.upsert({ manifest: bundle.manifest, trusted, granted, source: options.source });
    this.log.info({ app: app.id, version: app.version, source: options.source }, existing ? 'App updated' : 'App installed');
    this.hooks.onInstalled(app);
    return app;
  }

  setTrust(id: string, input: { trusted?: boolean; granted?: Permission[] }): InstalledApp {
    const app = this.repos.apps.find(id);
    if (!app) throw new AppInstallError('App not found', 'not_found');
    const trusted = input.trusted ?? app.trusted;
    const granted = (input.granted ?? app.granted).filter((p) => app.manifest.permissions.includes(p));
    const updated = this.repos.apps.setTrust(id, trusted, granted);
    if (!updated) throw new AppInstallError('App not found', 'not_found');
    this.log.info({ app: id, trusted, granted }, 'App trust changed');
    return updated;
  }

  /** Removes the files, storage, monitor targets and desktop items of an app. */
  uninstall(id: string): void {
    const app = this.repos.apps.find(id);
    if (!app) throw new AppInstallError('App not found', 'not_found');
    rmSync(path.join(this.dir, id), { recursive: true, force: true });
    this.repos.monitorTargets.deleteByOwner(id);
    for (const widget of this.repos.widgets.list()) if (widget.type.startsWith(`${id}/`)) this.repos.widgets.delete(widget.id);
    const settings = this.repos.settings.get();
    const pinned = settings.taskbar.pinned.filter((key) => key !== `app:${id}`);
    const patch: Parameters<typeof this.repos.settings.update>[0] = {};
    if (pinned.length !== settings.taskbar.pinned.length) patch.taskbar = { pinned };
    if (settings.cursor.set.startsWith(`${id}/`)) patch.cursor = { set: 'system' };
    if (settings.startup.preset.startsWith(`${id}/`)) patch.startup = { preset: 'logo-fade' };
    if (settings.appearance.themePack?.startsWith(`${id}/`)) patch.appearance = { themePack: null };
    if (settings.wallpaper.kind === 'app' && settings.wallpaper.file.startsWith(`${id}:`)) patch.wallpaper = { kind: 'bundled', file: 'aurora.webp' };
    if (Object.keys(patch).length > 0) this.repos.settings.update(patch);
    this.repos.apps.delete(id);
    this.log.info({ app: id }, 'App uninstalled');
    this.hooks.onRemoved(id);
  }

  /** Bundle size on disk for the App Store's detail page. */
  bundleInfo(app: InstalledApp): { sha256: string | null; size: number | null } {
    try {
      const info = JSON.parse(readFileSync(path.join(this.bundleDir(app), '.bundle.json'), 'utf8')) as { sha256: string; size: number };
      return { sha256: info.sha256, size: info.size };
    } catch {
      return { sha256: null, size: null };
    }
  }

  /** Whether the catalog offers a newer version than what is installed. */
  static updateAvailable(app: InstalledApp, catalog: CatalogEntry[]): CatalogEntry | null {
    const entry = catalog.find((c) => c.id === app.id);
    return entry && compareVersions(entry.version, app.version) > 0 ? entry : null;
  }

  private safeList(dir: string): string[] {
    try {
      return existsSync(dir) ? readdirSync(dir) : [];
    } catch {
      return [];
    }
  }
}

/** Resolves an app's bundle path safely for the files route (icons, wallpapers, cursors). */
export function resolveBundleFile(store: AppStore, app: InstalledApp, bundlePath: string): string | null {
  const parts = bundlePath.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) return null;
  try {
    let dir = store.bundleDir(app);
    for (const part of parts.slice(0, -1)) dir = resolveDataFile(dir, part);
    return resolveDataFile(dir, parts[parts.length - 1] as string);
  } catch {
    return null;
  }
}
