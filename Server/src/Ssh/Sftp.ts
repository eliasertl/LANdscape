import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import type { SFTPWrapper } from 'ssh2';
import type { Attributes, FileEntryWithStats, Stats } from 'ssh2';
import { TEXT_FILE_MAX_BYTES, type FileEntry, type FileListing } from '@landscape/shared';
import { HttpError } from '../Http/Errors';
import type { SshPool } from './Connection';

/** Maps SFTP status codes to readable HTTP errors. */
export function mapSftpError(error: unknown, context: string): HttpError {
  const code = (error as { code?: number | string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  switch (code) {
    case 2:
      return new HttpError(404, 'not_found', `${context}: no such file or directory`);
    case 3:
      return new HttpError(403, 'permission_denied', `${context}: permission denied for the SSH user`);
    case 4:
      return new HttpError(409, 'sftp_failure', `${context}: the operation failed (${/\bFailure\b/.test(message) ? 'target exists or directory not empty' : message})`);
    case 6:
    case 7:
      return new HttpError(503, 'ssh_unavailable', `${context}: SFTP connection lost`);
    case 8:
      return new HttpError(501, 'not_supported', `${context}: operation not supported by the server`);
    default:
      return new HttpError(500, 'sftp_error', `${context}: ${message}`);
  }
}

function modeString(mode: number): string {
  const type = (mode & 0o170000) === 0o040000 ? 'd' : (mode & 0o170000) === 0o120000 ? 'l' : '-';
  const bits = ['r', 'w', 'x'];
  let out = type;
  for (let shift = 6; shift >= 0; shift -= 3) {
    for (let i = 0; i < 3; i += 1) out += mode & (1 << (shift + 2 - i)) ? bits[i] : '-';
  }
  return out;
}

function entryType(attrs: Attributes | Stats): FileEntry['type'] {
  const mode = attrs.mode ?? 0;
  const fmt = mode & 0o170000;
  if (fmt === 0o040000) return 'directory';
  if (fmt === 0o120000) return 'symlink';
  if (fmt === 0o100000) return 'file';
  return 'other';
}

function toEntry(dir: string, name: string, attrs: Attributes | Stats): FileEntry {
  return {
    name,
    path: dir === '/' ? `/${name}` : `${dir}/${name}`,
    type: entryType(attrs),
    size: attrs.size ?? 0,
    modifiedAt: new Date((attrs.mtime ?? 0) * 1000).toISOString(),
    mode: attrs.mode ?? 0,
    permissions: modeString(attrs.mode ?? 0),
    owner: attrs.uid ?? -1,
    group: attrs.gid ?? -1,
  };
}

function call<T>(fn: (cb: (err: Error | undefined | null, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/** File operations over the pool's shared SFTP session, with readable errors. */
export class SftpService {
  constructor(private readonly pool: SshPool) {}

  private async session(): Promise<SFTPWrapper> {
    return this.pool.sftp();
  }

  async list(dir: string): Promise<FileListing> {
    const sftp = await this.session();
    let entries: FileEntryWithStats[];
    try {
      entries = await call<FileEntryWithStats[]>((cb) => sftp.readdir(dir, cb));
    } catch (error) {
      throw mapSftpError(error, dir);
    }
    const mapped = entries
      .filter((e) => e.filename !== '.' && e.filename !== '..')
      .map((e) => toEntry(dir, e.filename, e.attrs));
    // Resolve symlink targets so directories behind links browse correctly.
    await Promise.all(
      mapped.map(async (entry) => {
        if (entry.type !== 'symlink') return;
        try {
          const target = await call<Stats>((cb) => sftp.stat(entry.path, cb));
          if (entryType(target) === 'directory') entry.type = 'directory';
        } catch {
          // dangling link
        }
      }),
    );
    mapped.sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (b.type === 'directory' && a.type !== 'directory') return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    return { path: dir, entries: mapped };
  }

  async stat(remotePath: string): Promise<FileEntry> {
    const sftp = await this.session();
    try {
      const stats = await call<Stats>((cb) => sftp.stat(remotePath, cb));
      return toEntry(path.posix.dirname(remotePath), path.posix.basename(remotePath), stats);
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
  }

  async readText(remotePath: string, maxBytes = TEXT_FILE_MAX_BYTES): Promise<{ content: string; size: number; modifiedAt: string }> {
    const sftp = await this.session();
    let stats: Stats;
    try {
      stats = await call<Stats>((cb) => sftp.stat(remotePath, cb));
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
    if (entryType(stats) === 'directory') throw new HttpError(400, 'is_directory', `${remotePath} is a directory`);
    if ((stats.size ?? 0) > maxBytes) throw new HttpError(413, 'too_large', `${remotePath} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB; open it with a different tool`);
    try {
      const buffer = await call<Buffer>((cb) => sftp.readFile(remotePath, cb));
      if (buffer.includes(0)) throw new HttpError(415, 'binary_file', `${remotePath} looks like a binary file`);
      return { content: buffer.toString('utf8'), size: buffer.length, modifiedAt: new Date((stats.mtime ?? 0) * 1000).toISOString() };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw mapSftpError(error, remotePath);
    }
  }

  async writeText(remotePath: string, content: string): Promise<FileEntry> {
    const sftp = await this.session();
    try {
      await call<void>((cb) => sftp.writeFile(remotePath, Buffer.from(content, 'utf8'), (err) => cb(err, undefined)));
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
    return this.stat(remotePath);
  }

  async mkdir(remotePath: string): Promise<FileEntry> {
    const sftp = await this.session();
    try {
      await call<void>((cb) => sftp.mkdir(remotePath, (err) => cb(err, undefined)));
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
    return this.stat(remotePath);
  }

  async rename(from: string, to: string): Promise<FileEntry> {
    const sftp = await this.session();
    try {
      await call<void>((cb) => sftp.rename(from, to, (err) => cb(err, undefined)));
    } catch (error) {
      throw mapSftpError(error, from);
    }
    return this.stat(to);
  }

  /** Deletes a file, or a directory recursively. */
  async remove(remotePath: string): Promise<void> {
    const sftp = await this.session();
    let stats: Stats;
    try {
      stats = await call<Stats>((cb) => sftp.lstat(remotePath, cb));
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
    if (entryType(stats) === 'directory') {
      const listing = await this.list(remotePath);
      for (const entry of listing.entries) {
        await this.remove(entry.path);
      }
      try {
        await call<void>((cb) => sftp.rmdir(remotePath, (err) => cb(err, undefined)));
      } catch (error) {
        throw mapSftpError(error, remotePath);
      }
      return;
    }
    try {
      await call<void>((cb) => sftp.unlink(remotePath, (err) => cb(err, undefined)));
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
  }

  async readStream(remotePath: string): Promise<{ stream: Readable; size: number; name: string }> {
    const entry = await this.stat(remotePath);
    if (entry.type === 'directory') throw new HttpError(400, 'is_directory', `${remotePath} is a directory`);
    const sftp = await this.session();
    const stream = sftp.createReadStream(remotePath, { highWaterMark: 256 * 1024 });
    return { stream, size: entry.size, name: entry.name };
  }

  async writeStream(remotePath: string): Promise<Writable> {
    const sftp = await this.session();
    return sftp.createWriteStream(remotePath, { highWaterMark: 256 * 1024 });
  }

  /** Reads the tail of a file (for log following). */
  async readTail(remotePath: string, maxBytes: number): Promise<{ content: string; size: number }> {
    const sftp = await this.session();
    let stats: Stats;
    try {
      stats = await call<Stats>((cb) => sftp.stat(remotePath, cb));
    } catch (error) {
      throw mapSftpError(error, remotePath);
    }
    const size = stats.size ?? 0;
    const start = Math.max(0, size - maxBytes);
    const content = await this.readRange(remotePath, start, size - start);
    return { content, size };
  }

  /** Reads `length` bytes starting at `start`. */
  async readRange(remotePath: string, start: number, length: number): Promise<string> {
    if (length <= 0) return '';
    const sftp = await this.session();
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = sftp.createReadStream(remotePath, { start, end: start + length - 1 });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', (error: Error) => reject(mapSftpError(error, remotePath)));
    });
  }
}
