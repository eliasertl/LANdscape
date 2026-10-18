import type { FastifyInstance } from 'fastify';
import type { ClientChannel } from 'ssh2';
import { z } from 'zod';
import { terminalClientMessageSchema, type TerminalServerMessage } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { guardSocket, rawToBuffer, rawToString, sendJson } from '../Http/WsUtils';
import { SshUnavailableError } from './Connection';

const query = z.object({
  cols: z.coerce.number().int().min(2).max(1000).default(80),
  rows: z.coerce.number().int().min(1).max(500).default(24),
});

/**
 * /ws/terminal: one SSH shell per socket. Binary frames carry terminal
 * bytes in both directions; JSON text frames carry resize messages.
 */
export function registerTerminalWs(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/ws/terminal', { websocket: true }, (socket, request) => {
    const params = query.safeParse(request.query);
    const cols = params.success ? params.data.cols : 80;
    const rows = params.success ? params.data.rows : 24;
    let stream: ClientChannel | null = null;
    let closed = false;
    const send = (message: TerminalServerMessage) => sendJson(socket, message);

    const pending: Buffer[] = [];
    guardSocket(socket, ctx.log, (raw, isBinary) => {
      if (isBinary) {
        const data = rawToBuffer(raw);
        if (stream) stream.write(data);
        else pending.push(data);
        return;
      }
      const text = rawToString(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Text frames that are not JSON are treated as terminal input (older clients).
        if (stream) stream.write(text);
        else pending.push(Buffer.from(text));
        return;
      }
      const result = terminalClientMessageSchema.safeParse(parsed);
      if (result.success && stream) stream.setWindow(result.data.rows, result.data.cols, 0, 0);
    });

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (stream) {
        try {
          stream.end();
          stream.close();
        } catch {
          // ignore
        }
      }
      stream = null;
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    ctx.ssh
      .shell({ cols, rows })
      .then((shell) => {
        if (closed) {
          shell.close();
          return;
        }
        stream = shell;
        send({ type: 'ready' });
        for (const chunk of pending.splice(0)) shell.write(chunk);
        shell.on('data', (chunk: Buffer) => {
          if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true });
        });
        shell.stderr.on('data', (chunk: Buffer) => {
          if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true });
        });
        shell.on('exit', (code: number | null, signal?: string) => {
          send({ type: 'exit', code, signal: signal ?? null });
        });
        shell.on('close', () => {
          stream = null;
          if (socket.readyState === socket.OPEN) socket.close(1000, 'shell closed');
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof SshUnavailableError ? `${error.message} ${error.hint}` : error instanceof Error ? error.message : String(error);
        send({ type: 'error', message });
        if (socket.readyState === socket.OPEN) socket.close(1011, 'ssh unavailable');
      });
  });
}
