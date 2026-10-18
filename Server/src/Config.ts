import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  loginUsername: string;
  loginPasswordHash: string;
  /** Explicit secret from the environment; null means "generate and persist in the data dir". */
  sessionSecret: string | null;
  ssh: {
    host: string;
    port: number;
    user: string | null;
    keyPath: string;
  };
  hostProc: string;
  hostSys: string;
  /** Optional read-only mount of the host root, used for disk usage via statfs. */
  hostRoot: string | null;
  dockerSocket: string;
  trustProxy: boolean;
  logLevel: string;
  /** Directory containing the built client (index.html, assets, wallpapers). */
  clientDir: string;
  version: string;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require(path.resolve(import.meta.dirname, '..', 'package.json')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return process.env.LANDSCAPE_VERSION ?? '0.0.0';
  }
}

function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 65535) {
    throw new ConfigError(`${name} must be a port number, got "${raw}"`);
  }
  return value;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

/** Looks like a bcrypt hash ($2a$, $2b$ or $2y$, cost, 53 chars of salt+hash). */
export function looksLikeBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

/**
 * Reads configuration from the environment. Throws ConfigError with an
 * actionable message when the login credentials are missing so that an admin
 * tool can never start unauthenticated by accident.
 */
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const loginUsername = env('LOGIN_USERNAME');
  const loginPasswordHash = env('LOGIN_PASSWORD_HASH');

  if (overrides.loginUsername === undefined && !loginUsername) {
    throw new ConfigError(
      'LOGIN_USERNAME is not set. LANdscape refuses to start without login credentials. ' +
        'Set LOGIN_USERNAME and LOGIN_PASSWORD_HASH (a bcrypt hash) in the container environment.',
    );
  }
  if (overrides.loginPasswordHash === undefined && !loginPasswordHash) {
    throw new ConfigError(
      'LOGIN_PASSWORD_HASH is not set. Generate one with ' +
        '`docker run --rm landscape:latest hash-password` or `htpasswd -bnBC 10 "" \'password\' | tr -d \':\\n\'`. ' +
        'In docker-compose.yml every "$" in the hash must be written as "$$".',
    );
  }
  const hash = overrides.loginPasswordHash ?? loginPasswordHash ?? '';
  if (!looksLikeBcryptHash(hash)) {
    throw new ConfigError(
      'LOGIN_PASSWORD_HASH does not look like a bcrypt hash (expected "$2b$10$..." with 60 characters). ' +
        'If you use docker-compose, make sure every "$" is escaped as "$$".',
    );
  }

  const dataDir = path.resolve(env('DATA_DIR', '/etc/landscape') as string);
  const defaultClientDir = path.resolve(import.meta.dirname, '..', '..', 'Client', 'dist');

  const config: Config = {
    port: envInt('PORT', 8080),
    host: env('HOST', '0.0.0.0') as string,
    dataDir,
    loginUsername: loginUsername ?? '',
    loginPasswordHash: hash,
    sessionSecret: env('SESSION_SECRET') ?? null,
    ssh: {
      host: env('SSH_HOST', 'host.docker.internal') as string,
      port: envInt('SSH_PORT', 22),
      user: env('SSH_USER') ?? null,
      keyPath: env('SSH_KEY_PATH', path.join(dataDir, 'ssh', 'id_ed25519')) as string,
    },
    hostProc: env('HOST_PROC', '/host/proc') as string,
    hostSys: env('HOST_SYS', '/host/sys') as string,
    hostRoot: env('HOST_ROOT', '/host/root') ?? null,
    dockerSocket: env('DOCKER_SOCKET', '/var/run/docker.sock') as string,
    trustProxy: envBool('TRUST_PROXY', false),
    logLevel: env('LOG_LEVEL', 'info') as string,
    clientDir: env('CLIENT_DIR', defaultClientDir) as string,
    version: readVersion(),
    ...overrides,
  };

  return config;
}

/** A copy of the config that is safe to log (no hash, secret or key material). */
export function redactConfig(config: Config): Record<string, unknown> {
  return {
    port: config.port,
    host: config.host,
    dataDir: config.dataDir,
    loginUsername: config.loginUsername,
    sessionSecret: config.sessionSecret ? '[from env]' : '[generated in data dir]',
    ssh: { ...config.ssh, keyPath: config.ssh.keyPath, configured: Boolean(config.ssh.user) },
    hostProc: config.hostProc,
    hostSys: config.hostSys,
    hostRoot: config.hostRoot,
    dockerSocket: config.dockerSocket,
    trustProxy: config.trustProxy,
    clientDir: config.clientDir,
    version: config.version,
  };
}

/** Reads the SSH private key, or null when it is not present/readable. Never logs it. */
export function readSshKey(config: Config): string | null {
  try {
    return readFileSync(config.ssh.keyPath, 'utf8');
  } catch {
    return null;
  }
}
