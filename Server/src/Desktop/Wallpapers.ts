import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { WallpaperInfo } from '@landscape/shared';
import { IMAGE_EXTENSIONS, isValidDataFileName, resolveDataFile, sniffImageType } from './DataFiles';

/** Bundled wallpapers live in the client build; uploads live in DATA_DIR/wallpapers. */
export class WallpaperStore {
  readonly uploadDir: string;
  readonly bundledDir: string;

  constructor(dataDir: string, clientDir: string) {
    this.uploadDir = path.join(dataDir, 'wallpapers');
    this.bundledDir = path.join(clientDir, 'wallpapers');
    mkdirSync(this.uploadDir, { recursive: true });
  }

  list(): WallpaperInfo[] {
    const bundled = this.listDir(this.bundledDir).map((file) => ({
      kind: 'bundled' as const,
      file,
      name: prettyName(file),
      url: `/wallpapers/bundled/${file}`,
    }));
    const uploads = this.listDir(this.uploadDir).map((file) => ({
      kind: 'upload' as const,
      file,
      name: prettyName(file.replace(/^upload-[a-f0-9]+-/, '')),
      url: `/wallpapers/upload/${file}`,
    }));
    return [...bundled, ...uploads];
  }

  exists(kind: 'bundled' | 'upload', file: string): boolean {
    if (!isValidDataFileName(file)) return false;
    try {
      return existsSync(this.resolve(kind, file));
    } catch {
      return false;
    }
  }

  resolve(kind: 'bundled' | 'upload', file: string): string {
    return resolveDataFile(kind === 'bundled' ? this.bundledDir : this.uploadDir, file);
  }

  saveUpload(bytes: Buffer, originalName: string): WallpaperInfo {
    const mime = sniffImageType(bytes);
    if (!mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      throw new Error('Unsupported image type. Use PNG, JPEG or WebP.');
    }
    const stem = originalName
      .replace(/\.[^.]+$/, '')
      .replace(/[^A-Za-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'wallpaper';
    const file = `upload-${randomBytes(4).toString('hex')}-${stem}.${IMAGE_EXTENSIONS[mime]}`;
    writeFileSync(this.resolve('upload', file), bytes);
    return { kind: 'upload', file, name: prettyName(stem), url: `/wallpapers/upload/${file}` };
  }

  deleteUpload(file: string): boolean {
    if (!this.exists('upload', file)) return false;
    rmSync(this.resolve('upload', file), { force: true });
    return true;
  }

  private listDir(dir: string): string[] {
    try {
      return readdirSync(dir)
        .filter((f) => /\.(webp|png|jpe?g)$/i.test(f) && isValidDataFileName(f))
        .sort();
    } catch {
      return [];
    }
  }
}

function prettyName(file: string): string {
  return file
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
