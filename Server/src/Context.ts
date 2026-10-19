import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './Config';
import type { Database } from './Db/Database';
import type { Repositories } from './Db/Repositories';
import type { SessionService } from './Auth/Sessions';
import type { Lockout } from './Auth/Lockout';
import type { MetricsHub } from './Metrics/Hub';
import type { DockerClient } from './Docker/Client';
import type { SshPool } from './Ssh/Connection';
import type { SftpService } from './Ssh/Sftp';
import type { ProxyService } from './Proxy/ProxyService';

/** Everything route modules need, passed explicitly instead of via decorators. */
export interface ServerContext {
  config: Config;
  db: Database;
  repos: Repositories;
  sessions: SessionService;
  lockout: Lockout;
  metrics: MetricsHub;
  docker: DockerClient;
  ssh: SshPool;
  sftp: SftpService;
  proxy: ProxyService;
  log: FastifyBaseLogger;
}
