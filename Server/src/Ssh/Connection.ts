import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../Config';
import { readSshKey } from '../Config';
import { HostKeyChangedError, HostKeyStore } from './HostKeys';

export class SshUnavailableError extends Error {
  override name = 'SshUnavailableError';
  constructor(
    message: string,
    public readonly hint: string,
  ) {
    super(message);
  }
}

/** OpenSSH defaults to MaxSessions 10; stay below it per connection. */
const MAX_CHANNELS_PER_CONNECTION = 8;
const CONNECT_TIMEOUT_MS = 10_000;

interface PooledConnection {
  client: Client;
  channels: number;
  ready: Promise<void>;
  closed: boolean;
  sftp: SFTPWrapper | null;
  sftpPromise: Promise<SFTPWrapper> | null;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

/**
 * Pool of ssh2 clients to the host. Channels (shell, exec, sftp) are spread
 * over connections so that many terminals and log followers never hit the
 * server's per-connection session limit. Connections are opened lazily and
 * dropped when they close.
 */
export class SshPool {
  private readonly connections: PooledConnection[] = [];
  private readonly hostKeys: HostKeyStore;
  private lastError: string | null = null;

  constructor(
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
  ) {
    this.hostKeys = new HostKeyStore(config.dataDir);
  }

  /** True when SSH is configured (user set and key readable). */
  get configured(): boolean {
    return Boolean(this.config.ssh.user) && readSshKey(this.config) !== null;
  }

  get lastErrorMessage(): string | null {
    return this.lastError;
  }

  private assertConfigured(): void {
    if (!this.config.ssh.user) {
      throw new SshUnavailableError('SSH_USER is not set.', 'Set SSH_USER (and SSH_HOST/SSH_PORT) in the container environment.');
    }
    if (readSshKey(this.config) === null) {
      throw new SshUnavailableError(
        `SSH private key not readable at ${this.config.ssh.keyPath}.`,
        'Place the private key in the data directory under ssh/ (see README) and make sure it is readable by the server user.',
      );
    }
  }

  private connect(): PooledConnection {
    const client = new Client();
    const entry: PooledConnection = { client, channels: 0, ready: Promise.resolve(), closed: false, sftp: null, sftpPromise: null };
    const key = readSshKey(this.config) as string;
    const { host, port, user } = this.config.ssh;
    entry.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out connecting to ${host}:${port}`));
        client.end();
      }, CONNECT_TIMEOUT_MS);
      client.on('ready', () => {
        clearTimeout(timer);
        this.lastError = null;
        resolve();
      });
      client.on('error', (error: Error) => {
        clearTimeout(timer);
        this.lastError = describeSshError(error);
        reject(new Error(this.lastError));
      });
      client.on('close', () => {
        entry.closed = true;
        entry.sftp = null;
        const index = this.connections.indexOf(entry);
        if (index >= 0) this.connections.splice(index, 1);
      });
      const connectConfig: ConnectConfig = {
        host,
        port,
        username: user as string,
        privateKey: key,
        readyTimeout: CONNECT_TIMEOUT_MS,
        keepaliveInterval: 15_000,
        keepaliveCountMax: 3,
        hostVerifier: (rawKey: Buffer) => {
          try {
            return this.hostKeys.verify(host, port, rawKey);
          } catch (error) {
            this.lastError = error instanceof Error ? error.message : String(error);
            return false;
          }
        },
      };
      client.connect(connectConfig);
    });
    this.connections.push(entry);
    return entry;
  }

  /** Returns a ready connection with a free channel slot. */
  private async acquire(): Promise<PooledConnection> {
    this.assertConfigured();
    let entry = this.connections.find((c) => !c.closed && c.channels < MAX_CHANNELS_PER_CONNECTION);
    if (!entry) entry = this.connect();
    try {
      await entry.ready;
    } catch (error) {
      const index = this.connections.indexOf(entry);
      if (index >= 0) this.connections.splice(index, 1);
      const message = error instanceof Error ? error.message : String(error);
      throw new SshUnavailableError(message, hintFor(message));
    }
    return entry;
  }

  /** Opens an interactive shell; the caller owns the channel and must close it. */
  async shell(options: { cols: number; rows: number; term?: string }): Promise<ClientChannel> {
    const entry = await this.acquire();
    return new Promise((resolve, reject) => {
      entry.client.shell({ term: options.term ?? 'xterm-256color', cols: options.cols, rows: options.rows }, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        this.track(entry, stream);
        resolve(stream);
      });
    });
  }

  /** Starts a command and returns its stream (for log following). With pty, closing sends SIGHUP. */
  async spawn(command: string, options: { pty?: boolean } = {}): Promise<ClientChannel> {
    const entry = await this.acquire();
    return new Promise((resolve, reject) => {
      entry.client.exec(command, { pty: options.pty ? { term: 'dumb', cols: 200, rows: 50 } : false }, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        this.track(entry, stream);
        resolve(stream);
      });
    });
  }

  /** Runs a command to completion with bounded output. */
  async exec(command: string, options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<ExecResult> {
    const stream = await this.spawn(command);
    const max = options.maxBytes ?? 4 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      const out: Buffer[] = [];
      const err: Buffer[] = [];
      let outSize = 0;
      let errSize = 0;
      let code: number | null = null;
      const timer = setTimeout(() => {
        stream.close();
        reject(new Error(`Command timed out: ${command.slice(0, 80)}`));
      }, options.timeoutMs ?? 30_000);
      stream.on('data', (chunk: Buffer) => {
        if (outSize < max) {
          out.push(chunk);
          outSize += chunk.length;
        }
      });
      stream.stderr.on('data', (chunk: Buffer) => {
        if (errSize < 256 * 1024) {
          err.push(chunk);
          errSize += chunk.length;
        }
      });
      stream.on('exit', (exitCode: number | null) => {
        code = exitCode;
      });
      stream.on('close', () => {
        clearTimeout(timer);
        resolve({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), code });
      });
      stream.on('error', (error: Error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  /** Shared long-lived SFTP session (re-opened when the connection drops). */
  async sftp(): Promise<SFTPWrapper> {
    const existing = this.connections.find((c) => !c.closed && c.sftp !== null);
    if (existing?.sftp) return existing.sftp;
    const pending = this.connections.find((c) => !c.closed && c.sftpPromise !== null);
    if (pending?.sftpPromise) return pending.sftpPromise;
    const entry = await this.acquire();
    entry.sftpPromise = new Promise<SFTPWrapper>((resolve, reject) => {
      entry.client.sftp((error, sftp) => {
        entry.sftpPromise = null;
        if (error) {
          reject(error);
          return;
        }
        entry.channels += 1;
        entry.sftp = sftp;
        sftp.on('close', () => {
          entry.channels = Math.max(0, entry.channels - 1);
          if (entry.sftp === sftp) entry.sftp = null;
        });
        resolve(sftp);
      });
    });
    return entry.sftpPromise;
  }

  /** Connects and runs a trivial command; used by Settings → About. */
  async probe(): Promise<{ ok: boolean; detail: string; hint: string | null }> {
    try {
      const result = await this.exec('echo landscape-ok', { timeoutMs: 10_000 });
      if (result.stdout.includes('landscape-ok')) {
        return { ok: true, detail: `Connected as ${this.config.ssh.user}@${this.config.ssh.host}:${this.config.ssh.port}.`, hint: null };
      }
      return { ok: false, detail: `Unexpected response from the host shell: ${result.stderr || result.stdout}`.slice(0, 200), hint: 'Check the login shell of the SSH user.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, detail: message, hint: error instanceof SshUnavailableError ? error.hint : hintFor(message) };
    }
  }

  /** Closes every connection (shutdown). */
  close(): void {
    for (const entry of this.connections.splice(0)) {
      entry.closed = true;
      entry.client.end();
    }
  }

  private track(entry: PooledConnection, stream: ClientChannel): void {
    entry.channels += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      entry.channels = Math.max(0, entry.channels - 1);
    };
    stream.on('close', release);
    stream.on('end', release);
  }
}

function describeSshError(error: Error): string {
  const message = error.message || String(error);
  if (/ECONNREFUSED/.test(message)) return `Connection refused by ${message.replace(/^.*ECONNREFUSED\s*/, '')}`.trim();
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'SSH host not found (DNS).';
  if (/ETIMEDOUT|Timed out/.test(message)) return 'SSH connection timed out.';
  if (/All configured authentication methods failed/.test(message)) return 'SSH authentication failed: the key is not authorised for this user.';
  if (/host key/i.test(message) || error instanceof HostKeyChangedError) return message;
  if (/Cannot parse privateKey/.test(message)) return 'The SSH private key could not be parsed (unsupported format or passphrase-protected).';
  return message;
}

function hintFor(message: string): string {
  if (/refused/i.test(message)) return 'Is sshd running on the host and is SSH_HOST/SSH_PORT correct? host.docker.internal needs the extra_hosts entry.';
  if (/not found/i.test(message)) return 'Check SSH_HOST.';
  if (/timed out/i.test(message)) return 'Check the network path from the container to the host (firewall, SSH_PORT).';
  if (/authentication failed/i.test(message)) return 'Append the public key to ~/.ssh/authorized_keys of SSH_USER on the host.';
  if (/host key changed/i.test(message)) return 'Delete the known_host file in the data directory if the host was reinstalled.';
  if (/parse privateKey/i.test(message)) return 'Use an unencrypted ed25519 or RSA key in OpenSSH format.';
  return 'See the README troubleshooting section.';
}
