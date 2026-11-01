import { inflateRawSync } from 'node:zlib';

/**
 * A minimal ZIP reader for app bundles: central directory, "store" and
 * "deflate" entries, no encryption, no zip64. Written here instead of a
 * dependency because the format is small and the checks (paths, sizes,
 * counts) matter more than features.
 */
export interface ZipEntry {
  name: string;
  size: number;
  data: Buffer;
}

export class ZipError extends Error {
  override name = 'ZipError';
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export interface ZipLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 2000, maxTotalBytes: 40 * 1024 * 1024, maxEntryBytes: 15 * 1024 * 1024 };

/** A safe relative path inside the bundle, or null for directories, absolute paths and traversal. */
export function safeEntryName(raw: string): string | null {
  const name = raw.replace(/\\/g, '/');
  if (name.endsWith('/')) return null;
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\0')) return null;
  const parts = name.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  if (parts.some((p) => p.startsWith('__MACOSX') || p === '.DS_Store')) return null;
  return name;
}

/** Reads every file of a zip buffer into memory, enforcing the limits. Throws ZipError with a readable message. */
export function readZip(buffer: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
  if (buffer.length < 22) throw new ZipError('Not a zip file');
  // Find the end-of-central-directory record (it may be followed by a comment of up to 64 KB).
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a zip file (no central directory)');
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (count > limits.maxEntries) throw new ZipError(`The zip has ${count} entries; at most ${limits.maxEntries} are allowed`);
  if (centralOffset + centralSize > buffer.length) throw new ZipError('Corrupt zip (central directory out of range)');

  const entries: ZipEntry[] = [];
  let total = 0;
  let offset = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL) throw new ZipError('Corrupt zip (bad central directory entry)');
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    offset += 46 + nameLength + extraLength + commentLength;

    const name = safeEntryName(rawName);
    if (name === null) {
      if (!rawName.endsWith('/') && !rawName.includes('__MACOSX') && !rawName.endsWith('.DS_Store')) throw new ZipError(`Unsafe path in zip: ${rawName}`);
      continue;
    }
    if (uncompressedSize > limits.maxEntryBytes) throw new ZipError(`${name} is larger than ${Math.round(limits.maxEntryBytes / 1024 / 1024)} MB`);
    total += uncompressedSize;
    if (total > limits.maxTotalBytes) throw new ZipError(`The bundle is larger than ${Math.round(limits.maxTotalBytes / 1024 / 1024)} MB unpacked`);

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) throw new ZipError(`Corrupt zip (bad local header for ${name})`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > buffer.length) throw new ZipError(`Corrupt zip (data out of range for ${name})`);
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) {
      try {
        data = inflateRawSync(compressed, { maxOutputLength: limits.maxEntryBytes });
      } catch {
        throw new ZipError(`Could not decompress ${name}`);
      }
    } else throw new ZipError(`${name} uses an unsupported compression method (${method})`);
    if (data.length !== uncompressedSize) throw new ZipError(`Corrupt zip (size mismatch for ${name})`);
    entries.push({ name, size: data.length, data });
  }
  return entries;
}
