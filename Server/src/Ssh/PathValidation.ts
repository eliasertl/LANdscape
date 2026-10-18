import path from 'node:path';
import { badRequest } from '../Http/Errors';

const MAX_PATH = 4096;

/**
 * Normalises a user-supplied remote path for SFTP. The SSH user's own
 * permissions are the real boundary; this only guarantees we send a sane,
 * absolute, NUL-free POSIX path and never build paths from stray segments.
 */
export function normalizeRemotePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) throw badRequest('Path is required');
  if (input.length > MAX_PATH) throw badRequest('Path is too long');
  if (input.includes('\0')) throw badRequest('Path contains an invalid character');
  if (!input.startsWith('/')) throw badRequest('Path must be absolute');
  const normalized = path.posix.normalize(input);
  if (normalized.split('/').includes('..')) throw badRequest('Path must not contain ".." segments');
  return normalized === '/' ? '/' : normalized.replace(/\/+$/, '');
}

/** Validates a new file or folder name (single path segment). */
export function validateEntryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw badRequest('Name is required');
  if (trimmed.length > 255) throw badRequest('Name is too long');
  if (trimmed === '.' || trimmed === '..') throw badRequest('Invalid name');
  if (trimmed.includes('/') || trimmed.includes('\0')) throw badRequest('Name must not contain "/"');
  return trimmed;
}

export function joinRemote(dir: string, name: string): string {
  return normalizeRemotePath(path.posix.join(dir, validateEntryName(name)));
}

export function parentOf(remotePath: string): string {
  return path.posix.dirname(remotePath);
}
