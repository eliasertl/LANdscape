import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { IMAGE_EXTENSIONS, isSafeSvg, resolveDataFile, sniffImageType } from './DataFiles';
import { discoverIconCandidates, fetchBestIcon } from './Favicon';
import { checkEmbeddable } from './EmbedCheck';

/** Stores shortcut icons (favicons and uploads) as files in DATA_DIR/icons. */
export class IconStore {
  readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'icons');
    mkdirSync(this.dir, { recursive: true });
  }

  resolve(fileName: string): string {
    return resolveDataFile(this.dir, fileName);
  }

  /** Validates and stores an uploaded image; returns the stored file name. */
  saveUpload(bytes: Buffer): { fileName: string; mime: string } {
    const mime = sniffImageType(bytes);
    if (!mime || !['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(mime)) {
      throw new Error('Unsupported image type. Use PNG, JPEG, SVG or WebP.');
    }
    if (mime === 'image/svg+xml' && !isSafeSvg(bytes.toString('utf8'))) {
      throw new Error('This SVG contains scripts or event handlers and was rejected.');
    }
    const fileName = `upload-${randomBytes(8).toString('hex')}.${IMAGE_EXTENSIONS[mime]}`;
    writeFileSync(this.resolve(fileName), bytes);
    return { fileName, mime };
  }

  /** Stores a downloaded favicon for a shortcut; replaces any previous favicon file. */
  saveFavicon(shortcutId: string, bytes: Buffer, extension: string): string {
    this.deleteFaviconsFor(shortcutId);
    const fileName = `favicon-${shortcutId}-${Date.now().toString(36)}.${extension}`;
    writeFileSync(this.resolve(fileName), bytes);
    return fileName;
  }

  deleteFaviconsFor(shortcutId: string): void {
    for (const entry of this.safeList()) {
      if (entry.startsWith(`favicon-${shortcutId}-`)) rmSync(path.join(this.dir, entry), { force: true });
    }
  }

  delete(fileName: string | null): void {
    if (!fileName) return;
    try {
      rmSync(this.resolve(fileName), { force: true });
    } catch {
      // ignore invalid names
    }
  }

  private safeList(): string[] {
    try {
      return readdirSync(this.dir);
    } catch {
      return [];
    }
  }

  /**
   * Fetches the page (or reuses already fetched HTML), discovers and downloads
   * the best favicon. Returns the stored file name or null when none was found.
   */
  async fetchFavicon(shortcutId: string, url: string, html: string | null, finalUrl: string | null): Promise<string | null> {
    let pageHtml = html;
    let base = finalUrl ?? url;
    if (pageHtml === null) {
      const result = await checkEmbeddable(url, null);
      pageHtml = result.html;
      base = result.finalUrl ?? url;
    }
    const candidates = discoverIconCandidates(pageHtml ?? '', base);
    const icon = await fetchBestIcon(candidates);
    if (!icon) return null;
    return this.saveFavicon(shortcutId, icon.bytes, icon.extension);
  }
}
