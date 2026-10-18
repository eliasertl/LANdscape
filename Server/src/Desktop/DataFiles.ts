import path from 'node:path';

/** Strict file name for anything stored in the data directory: no separators, no traversal. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/gif': 'gif',
};

export const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  gif: 'image/gif',
};

export function isValidDataFileName(name: string): boolean {
  return FILE_NAME.test(name) && !name.includes('..');
}

/**
 * Resolves a file name inside a data sub-directory and verifies the result
 * stays within that directory. Throws on anything suspicious.
 */
export function resolveDataFile(baseDir: string, name: string): string {
  if (!isValidDataFileName(name)) throw new Error(`Invalid file name: ${name}`);
  const resolved = path.resolve(baseDir, name);
  const base = path.resolve(baseDir);
  if (resolved !== path.join(base, name) || !resolved.startsWith(base + path.sep)) {
    throw new Error(`Path escapes data directory: ${name}`);
  }
  return resolved;
}

export function mimeForFileName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? 'application/octet-stream';
}

/** Detects the image type from magic bytes; SVG is detected from the text. */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp';
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x01 && bytes[3] === 0x00) return 'image/x-icon';
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 2048))).toString('utf8').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/** Rejects SVGs containing scripts, event handlers or javascript: URLs. */
export function isSafeSvg(text: string): boolean {
  const lowered = text.toLowerCase();
  if (lowered.includes('<script')) return false;
  if (/\son[a-z]+\s*=/.test(lowered)) return false;
  if (lowered.includes('javascript:')) return false;
  if (lowered.includes('<foreignobject')) return false;
  if (/<(iframe|embed|object)\b/.test(lowered)) return false;
  return true;
}
