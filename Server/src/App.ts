import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { WALLPAPER_UPLOAD_MAX_BYTES } from '@landscape/shared';
import type { Config } from './Config';
import { Database } from './Db/Database';
import { createRepositories, seedDefaults } from './Db/Repositories';
import { SessionService } from './Auth/Sessions';
import { Lockout } from './Auth/Lockout';
import { loadOrCreateSessionSecret } from './Auth/SecretStore';
import { installGuard, readSessionIdFromHeader } from './Auth/Guard';
import { registerAuthRoutes } from './Auth/AuthRoutes';
import { errorHandler } from './Http/Errors';
import { installSecurityHeaders } from './Http/SecurityHeaders';
import { installStatic } from './Http/Static';
import { registerHealthRoute } from './Http/HealthRoute';
import type { ServerContext } from './Context';
import { registerDesktopRoutes } from './Desktop/DesktopRoutes';
import { MetricsHub } from './Metrics/Hub';
import { registerMetricsWs } from './Metrics/MetricsWs';
import { registerSystemRoutes } from './System/SystemRoutes';
import { registerSamplers } from './Metrics/Samplers';
import { DockerClient } from './Docker/Client';
import { SshPool } from './Ssh/Connection';
import { SftpService } from './Ssh/Sftp';
import { registerFileRoutes } from './Ssh/FileRoutes';
import { registerTerminalWs } from './Ssh/TerminalWs';
import { registerProcessRoutes } from './Ssh/ProcessRoutes';
import { registerContainerRoutes } from './Docker/ContainerRoutes';
import { registerLogsWs } from './Logs/LogsWs';
import { ProxyService } from './Proxy/ProxyService';
import { registerProxyRoutes } from './Proxy/ProxyRoutes';

export interface BuiltApp {
  app: FastifyInstance;
  ctx: ServerContext;
  close(): Promise<void>;
}

export interface BuildOptions {
  config: Config;
  /** Use ':memory:' in tests. Defaults to DATA_DIR/landscape.db. */
  databaseFile?: string;
  logger?: boolean;
}

export async function buildApp(options: BuildOptions): Promise<BuiltApp> {
  const { config } = options;
  mkdirSync(config.dataDir, { recursive: true });
  mkdirSync(path.join(config.dataDir, 'icons'), { recursive: true });
  mkdirSync(path.join(config.dataDir, 'wallpapers'), { recursive: true });

  const app = Fastify({
    logger: options.logger === false ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
  });

  const db = new Database(options.databaseFile ?? path.join(config.dataDir, 'landscape.db'));
  const repos = createRepositories(db);
  seedDefaults(repos);
  const sessions = new SessionService(repos.sessions);
  const lockout = new Lockout();
  const metrics = new MetricsHub();
  const docker = new DockerClient(config);
  const ssh = new SshPool(config, app.log);
  const sftp = new SftpService(ssh);
  const proxy = new ProxyService({
    db,
    repos,
    range: config.proxyPorts,
    host: config.host,
    // Evaluated per request, after the cookie plugin below has decorated the instance.
    isAuthenticated: (cookieHeader) => sessions.validate(readSessionIdFromHeader(app, cookieHeader)) !== null,
    log: app.log,
  });
  const ctx: ServerContext = { config, db, repos, sessions, lockout, metrics, docker, ssh, sftp, proxy, log: app.log };
  registerSamplers(metrics, {
    config,
    docker,
    sshExec: ssh.configured ? async (command) => (await ssh.exec(command, { timeoutMs: 15_000 })).stdout : null,
  });

  const secret = loadOrCreateSessionSecret(config.sessionSecret, config.dataDir);

  app.setErrorHandler(errorHandler);
  await installSecurityHeaders(app);
  await app.register(cookie, { secret });
  await app.register(multipart, { limits: { fileSize: WALLPAPER_UPLOAD_MAX_BYTES, files: 1, fields: 10 } });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });

  installGuard(app, sessions);
  registerHealthRoute(app);
  registerAuthRoutes(app, ctx);
  registerDesktopRoutes(app, ctx);
  registerMetricsWs(app, ctx);
  registerSystemRoutes(app, ctx, ssh.configured ? () => ssh.probe() : null);
  registerFileRoutes(app, ctx);
  registerTerminalWs(app, ctx);
  registerProcessRoutes(app, ctx);
  registerContainerRoutes(app, ctx);
  registerLogsWs(app, ctx);
  registerProxyRoutes(app, ctx);
  await installStatic(app, config.clientDir);

  const pruneTimer = setInterval(
    () => {
      try {
        sessions.pruneExpired();
        lockout.prune();
      } catch (error) {
        app.log.warn({ err: error }, 'Periodic cleanup failed');
      }
    },
    60 * 60 * 1000,
  );
  pruneTimer.unref();

  // Assign ports to shortcuts that need one (e.g. blocked "auto" shortcuts after an upgrade
  // or a changed range). Listeners open later, in start(), once LANdscape itself listens.
  proxy.reconcile();

  return {
    app,
    ctx,
    async close() {
      clearInterval(pruneTimer);
      metrics.stop();
      ssh.close();
      await proxy.stop();
      await app.close();
      db.close();
    },
  };
}
