import type { Readable } from 'node:stream';

/**
 * Demultiplexes Docker's log stream format: 8-byte header per frame
 * (stream type, 3 zero bytes, big-endian length), then the payload.
 * Containers started with a TTY send raw bytes instead; detect that.
 */
export class DockerLogDemuxer {
  private buffer: Buffer = Buffer.alloc(0);
  private raw: boolean | null = null;

  constructor(private readonly onText: (text: string) => void) {}

  push(chunk: Buffer): void {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    if (this.raw === null && this.buffer.length >= 8) {
      const type = this.buffer[0] ?? 0;
      const zeros = this.buffer[1] === 0 && this.buffer[2] === 0 && this.buffer[3] === 0;
      this.raw = !(zeros && type <= 2);
    }
    if (this.raw === null) return;
    if (this.raw) {
      this.onText(this.buffer.toString('utf8'));
      this.buffer = Buffer.alloc(0);
      return;
    }
    for (;;) {
      if (this.buffer.length < 8) return;
      const length = this.buffer.readUInt32BE(4);
      if (this.buffer.length < 8 + length) return;
      const payload = this.buffer.subarray(8, 8 + length);
      this.onText(payload.toString('utf8'));
      this.buffer = this.buffer.subarray(8 + length);
    }
  }

  flush(): void {
    if (this.raw !== false && this.buffer.length > 0) {
      this.onText(this.buffer.toString('utf8'));
      this.buffer = Buffer.alloc(0);
    }
  }
}

/** Pipes a Docker log stream through the demuxer until it ends. */
export function pipeDockerLogs(stream: Readable, onText: (text: string) => void, onEnd: (reason: string) => void): () => void {
  const demuxer = new DockerLogDemuxer(onText);
  const onData = (chunk: Buffer) => demuxer.push(chunk);
  const finish = (reason: string) => () => {
    demuxer.flush();
    onEnd(reason);
  };
  stream.on('data', onData);
  stream.once('end', finish('end'));
  stream.once('close', finish('closed'));
  stream.once('error', (error: Error) => onEnd(`error: ${error.message}`));
  return () => {
    stream.off('data', onData);
    try {
      stream.destroy();
    } catch {
      // ignore
    }
  };
}
