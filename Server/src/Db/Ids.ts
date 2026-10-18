import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Time-sortable, URL-safe id: 8 chars of base36 timestamp + 12 random chars. */
export function newId(): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const bytes = randomBytes(12);
  let random = '';
  for (const byte of bytes) random += ALPHABET[byte % ALPHABET.length];
  return `${time}${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
