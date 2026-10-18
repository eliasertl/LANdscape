import type { RawData, WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';

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

/**
 * Wraps a WebSocket message handler so a thrown error closes that socket
 * instead of crashing the process (ws emits handlers outside Fastify's
 * error boundary).
 */
export function guardSocket(socket: WebSocket, log: FastifyBaseLogger, handler: (raw: RawData, isBinary: boolean) => void | Promise<void>): void {
  socket.on('message', (raw, isBinary) => {
    try {
      const result = handler(raw, isBinary);
      if (result && typeof result.catch === 'function') {
        result.catch((error: unknown) => fail(socket, log, error));
      }
    } catch (error) {
      fail(socket, log, error);
    }
  });
}

function fail(socket: WebSocket, log: FastifyBaseLogger, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  log.error({ err: error }, 'WebSocket handler failed');
  sendJson(socket, { type: 'error', message });
  try {
    socket.close(1011, 'handler error');
  } catch {
    // ignore
  }
}
