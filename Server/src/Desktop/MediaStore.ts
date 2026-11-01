import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { IMAGE_EXTENSIONS, isSafeSvg, resolveDataFile, sniffImageType } from './DataFiles';

/** Magic-byte detection for the startup-animation media (video, sound). */
export function sniffMediaType(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'video/webm';
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'video/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'audio/ogg';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return 'audio/wav';
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'audio/mpeg';
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe6) === 0xe2) return 'audio/mpeg';
  return null;
}

export const MEDIA_EXTENSIONS: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

export const MEDIA_MIME: Record<string, string> = {
  webm: 'video/webm',
  mp4: 'video/mp4',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
};

export type MediaKind = 'image' | 'video' | 'sound' | 'cursor';

/**
 * Uploads for the startup animation (logo image, short video, sound) in
 * DATA_DIR/startup and cursor images in DATA_DIR/cursors. Types are sniffed
 * from magic bytes; SVGs go through the same script check as icons.
 */
export class MediaStore {
  readonly startupDir: string;
  readonly cursorDir: string;

  constructor(dataDir: string) {
    this.startupDir = path.join(dataDir, 'startup');
    this.cursorDir = path.join(dataDir, 'cursors');
    mkdirSync(this.startupDir, { recursive: true });
    mkdirSync(this.cursorDir, { recursive: true });
  }

  dirFor(kind: MediaKind): string {
    return kind === 'cursor' ? this.cursorDir : this.startupDir;
  }

  resolve(kind: MediaKind, fileName: string): string {
    return resolveDataFile(this.dirFor(kind), fileName);
  }

  exists(kind: MediaKind, fileName: string): boolean {
    try {
      return existsSync(this.resolve(kind, fileName));
    } catch {
      return false;
    }
  }

  /** Validates and stores an upload; returns the stored file name and type. Throws with a user-facing message. */
  save(kind: MediaKind, bytes: Buffer): { fileName: string; mime: string } {
    let mime: string | null;
    let extension: string | undefined;
    if (kind === 'image' || kind === 'cursor') {
      mime = sniffImageType(bytes);
      const allowed = kind === 'cursor' ? ['image/png', 'image/svg+xml'] : ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
      if (!mime || !allowed.includes(mime)) throw new Error(kind === 'cursor' ? 'Use a PNG or SVG cursor image.' : 'Use a PNG, JPEG, WebP, SVG or GIF image.');
      if (mime === 'image/svg+xml' && !isSafeSvg(bytes.toString('utf8'))) throw new Error('This SVG contains scripts or event handlers and was rejected.');
      extension = IMAGE_EXTENSIONS[mime];
    } else {
      mime = sniffMediaType(bytes);
      const allowed = kind === 'video' ? ['video/webm', 'video/mp4'] : ['audio/mpeg', 'audio/ogg', 'audio/wav'];
      if (!mime || !allowed.includes(mime)) throw new Error(kind === 'video' ? 'Use a WebM or MP4 video.' : 'Use an MP3, OGG or WAV sound.');
      extension = MEDIA_EXTENSIONS[mime];
    }
    const fileName = `${kind}-${randomBytes(8).toString('hex')}.${extension}`;
    writeFileSync(this.resolve(kind, fileName), bytes);
    return { fileName, mime };
  }

  delete(kind: MediaKind, fileName: string | null): void {
    if (!fileName) return;
    try {
      rmSync(this.resolve(kind, fileName), { force: true });
    } catch {
      // ignore invalid names
    }
  }

  list(kind: MediaKind): string[] {
    try {
      return readdirSync(this.dirFor(kind)).filter((name) => name.startsWith(`${kind}-`));
    } catch {
      return [];
    }
  }
}
