import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { logsClientMessageSchema, type LogsServerMessage } from '@landscape/shared';
import type { ServerContext } from '../Context';
import { guardSocket, rawToString, sendJson } from '../Http/WsUtils';
import { DockerLogDemuxer, pipeDockerLogs } from '../Docker/LogStream';
import { SshUnavailableError } from '../Ssh/Connection';
import { normalizeRemotePath } from '../Ssh/PathValidation';
import { HttpError } from '../Http/Errors';

const FILE_TAIL_BYTES = 256 * 1024;
const FILE_POLL_MS = 1000;

/** Shell-quotes a string for use in a remote command. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Builds the journalctl command for a unit filter and follow mode. */
export function journalCommand(unit: string | null, lines: number, follow: boolean): string {
  const parts = ['journalctl', '--no-pager', '-o', 'short-iso', '-n', String(lines)];
  if (unit) parts.push('-u', shellQuote(unit));
  if (follow) parts.push('-f');
  return parts.join(' ');
}

/**
 * /ws/logs streams one log source per socket: a Docker container, the host
 * journal (via SSH) or a file (via SFTP, polled for growth when following).
 */
export function registerLogsWs(app: FastifyInstance, ctx: ServerContext): void {
  app.get('/ws/logs', { websocket: true }, (socket) => {
    let stop: (() => void) | null = null;
    const send = (message: LogsServerMessage) => sendJson(socket, message);
    const fail = (error: unknown) => {
      const message =
        error instanceof SshUnavailableError ? `${error.message} ${error.hint}` : error instanceof HttpError || error instanceof Error ? error.message : String(error);
      send({ type: 'error', message });
    };

    const closeCurrent = () => {
      if (stop) {
        const s = stop;
        stop = null;
        s();
      }
    };

    guardSocket(socket, ctx.log, (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawToString(raw));
      } catch {
        send({ type: 'error', message: 'Invalid JSON' });
        return;
      }
      const result = logsClientMessageSchema.safeParse(parsed);
      if (!result.success) {
        send({ type: 'error', message: 'Invalid message' });
        return;
      }
      const message = result.data;
      closeCurrent();
      if (message.type === 'close') return;

      if (message.source === 'docker') {
        if (!ctx.docker.available) {
          fail(new Error(`Docker socket not found at ${ctx.config.dockerSocket}.`));
          return;
        }
        const container = ctx.docker.docker.getContainer(message.containerId);
        const options = { stdout: true, stderr: true, tail: message.tail, timestamps: false };
        if (message.follow) {
          container
            .logs({ ...options, follow: true })
            .then((stream) => {
              const readable = stream as unknown as Readable;
              stop = pipeDockerLogs(
                readable,
                (text) => send({ type: 'chunk', text }),
                (reason) => send({ type: 'end', reason }),
              );
            })
            .catch((error: unknown) => fail(error));
        } else {
          container
            .logs({ ...options, follow: false })
            .then((buffer) => {
              const demuxer = new DockerLogDemuxer((text) => send({ type: 'chunk', text }));
              demuxer.push(buffer);
              demuxer.flush();
              send({ type: 'end', reason: 'end of log' });
            })
            .catch((error: unknown) => fail(error));
        }
        return;
      }

      if (message.source === 'journal') {
        const command = journalCommand(message.unit, message.lines, message.follow);
        ctx.ssh
          .spawn(command, { pty: message.follow })
          .then((stream) => {
            stream.on('data', (chunk: Buffer) => send({ type: 'chunk', text: chunk.toString('utf8') }));
            stream.stderr.on('data', (chunk: Buffer) => send({ type: 'chunk', text: chunk.toString('utf8') }));
            stream.on('close', () => send({ type: 'end', reason: 'journalctl exited' }));
            stop = () => {
              try {
                stream.signal('TERM');
              } catch {
                // ignore
              }
              stream.close();
            };
          })
          .catch((error: unknown) => fail(error));
        return;
      }

      // File source: tail over SFTP, then poll for growth.
      let remote: string;
      try {
        remote = normalizeRemotePath(message.path);
      } catch (error) {
        fail(error);
        return;
      }
      let cancelled = false;
      let timer: NodeJS.Timeout | null = null;
      stop = () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
      ctx.sftp
        .readTail(remote, FILE_TAIL_BYTES)
        .then(({ content, size }) => {
          if (cancelled) return;
          send({ type: 'chunk', text: content });
          if (!message.follow) {
            send({ type: 'end', reason: 'end of file' });
            return;
          }
          let offset = size;
          const poll = async () => {
            if (cancelled) return;
            try {
              const stat = await ctx.sftp.stat(remote);
              if (stat.size < offset) {
                send({ type: 'chunk', text: '\n--- file truncated, restarting ---\n' });
                offset = 0;
              }
              if (stat.size > offset) {
                const text = await ctx.sftp.readRange(remote, offset, Math.min(stat.size - offset, 1024 * 1024));
                offset += Buffer.byteLength(text, 'utf8');
                send({ type: 'chunk', text });
              }
            } catch (error) {
              fail(error);
              return;
            }
            if (!cancelled) timer = setTimeout(() => void poll(), FILE_POLL_MS);
          };
          timer = setTimeout(() => void poll(), FILE_POLL_MS);
        })
        .catch((error: unknown) => fail(error));
    });

    socket.on('close', closeCurrent);
    socket.on('error', closeCurrent);
  });
}
