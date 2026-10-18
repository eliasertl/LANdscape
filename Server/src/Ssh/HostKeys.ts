import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** OpenSSH-style fingerprint of a raw public key blob. */
export function fingerprint(key: Buffer): string {
  return `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
}

export class HostKeyChangedError extends Error {
  override name = 'HostKeyChangedError';
  constructor(
    public readonly expected: string,
    public readonly actual: string,
    public readonly file: string,
  ) {
    super(`The SSH host key changed (expected ${expected}, got ${actual}). If this is intended, delete ${file} and reconnect.`);
  }
}

/**
 * Trust-on-first-use host key store: the first fingerprint seen for
 * host:port is persisted to DATA_DIR/ssh/known_host; a different key later
 * is refused with a clear message.
 */
export class HostKeyStore {
  readonly file: string;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'ssh', 'known_host');
  }

  private read(): Map<string, string> {
    const map = new Map<string, string>();
    try {
      for (const line of readFileSync(this.file, 'utf8').split('\n')) {
        const [host, fp] = line.trim().split(/\s+/);
        if (host && fp) map.set(host, fp);
      }
    } catch {
      // no file yet
    }
    return map;
  }

  /** Returns true when the key is trusted (first use or unchanged); throws when it changed. */
  verify(host: string, port: number, key: Buffer): boolean {
    const id = `${host}:${port}`;
    const actual = fingerprint(key);
    const known = this.read();
    const expected = known.get(id);
    if (expected === undefined) {
      known.set(id, actual);
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(this.file, [...known].map(([h, fp]) => `${h} ${fp}`).join('\n') + '\n', { mode: 0o600 });
      return true;
    }
    if (expected !== actual) throw new HostKeyChangedError(expected, actual, this.file);
    return true;
  }
}
