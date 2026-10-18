import type { RawData, WebSocket } from 'ws';

/** Converts a ws RawData frame into a string. */
export function rawToString(raw: RawData): string {
  if (typeof raw === 'string') return raw;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (Array.isArray(raw)) return Buffer.concat(raw).toString('utf8');
  return Buffer.from(raw).toString('utf8');
}

/** Converts a ws RawData frame into a Buffer. */
export function rawToBuffer(raw: RawData): Buffer {
  if (typeof raw === 'string') return Buffer.from(raw, 'utf8');
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

export function sendJson(socket: WebSocket, message: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}
