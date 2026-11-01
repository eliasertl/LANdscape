import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import { catalogIndexSchema, type CatalogEntry, type CatalogIndex } from '@landscape/shared';
import { assertHttpUrl, fetchFollowing, readBodyLimited } from '../Desktop/SafeFetch';

export const CATALOG_INDEX_URL = 'https://raw.githubusercontent.com/eliasertl/LANdscape/main/Catalog/index.json';
const CACHE_MS = 10 * 60_000;
const INDEX_MAX_BYTES = 2 * 1024 * 1024;
export const BUNDLE_MAX_BYTES = 20 * 1024 * 1024;

/**
 * The app catalog: fetched live from the repository's main branch so new
 * apps appear without rebuilding the image, with the copy bundled in the
 * image as the offline fallback.
 */
export class CatalogService {
  private cache: { index: CatalogIndex; at: number; source: 'live' | 'bundled' } | null = null;

  constructor(
    private readonly options: { url: string; bundledFile: string | null; log: FastifyBaseLogger },
  ) {}

  async get(force = false): Promise<{ index: CatalogIndex; source: 'live' | 'bundled'; error: string | null }> {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_MS) return { ...this.cache, error: null };
    let error: string | null = null;
    try {
      const { response } = await fetchFollowing(assertHttpUrl(this.options.url), { accept: 'application/json', timeoutMs: 8000 });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = (await readBodyLimited(response, INDEX_MAX_BYTES)).toString('utf8');
      const index = catalogIndexSchema.parse(JSON.parse(text));
      this.cache = { index, at: Date.now(), source: 'live' };
      return { index, source: 'live', error: null };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.options.log.debug({ err }, 'Live catalog not available; using the bundled copy');
    }
    const bundled = this.bundled();
    if (bundled) {
      this.cache = { index: bundled, at: Date.now(), source: 'bundled' };
      return { index: bundled, source: 'bundled', error };
    }
    return { index: { schema: 1, generatedAt: new Date(0).toISOString(), apps: [] }, source: 'bundled', error: error ?? 'No catalog available' };
  }

  bundled(): CatalogIndex | null {
    if (!this.options.bundledFile) return null;
    try {
      return catalogIndexSchema.parse(JSON.parse(readFileSync(this.options.bundledFile, 'utf8')));
    } catch {
      return null;
    }
  }

  /** Downloads a bundle zip (catalog or user-supplied URL) with the SafeFetch rules and a size cap. */
  /**
   * The bundle for a catalog entry: the copy shipped next to the bundled
   * index (Catalog/dist in the image) when it matches the entry's sha256,
   * so an offline server can still install; otherwise downloaded.
   */
  async fetchBundle(entry: CatalogEntry): Promise<Buffer> {
    const bundled = this.bundledBundle(entry);
    return bundled ?? this.download(entry.downloadUrl);
  }

  bundledBundle(entry: CatalogEntry): Buffer | null {
    if (!this.options.bundledFile) return null;
    const file = path.join(path.dirname(this.options.bundledFile), 'dist', `${entry.id}-${entry.version}.zip`);
    if (!existsSync(file)) return null;
    const data = readFileSync(file);
    return createHash('sha256').update(data).digest('hex') === entry.sha256 ? data : null;
  }

  async download(url: string): Promise<Buffer> {
    const { response } = await fetchFollowing(assertHttpUrl(url), { accept: 'application/zip,application/octet-stream,*/*', timeoutMs: 30_000 });
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    return readBodyLimited(response, BUNDLE_MAX_BYTES);
  }
}
