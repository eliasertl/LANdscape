import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Returns the session signing secret: the configured one, or a generated
 * secret persisted at DATA_DIR/session-secret so restarts keep sessions valid.
 */
export function loadOrCreateSessionSecret(configured: string | null, dataDir: string): string {
  if (configured) return configured;
  const file = path.join(dataDir, 'session-secret');
  try {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // fall through and create one
  }
  mkdirSync(dataDir, { recursive: true });
  const secret = randomBytes(48).toString('base64url');
  writeFileSync(file, `${secret}\n`, { mode: 0o600 });
  return secret;
}
