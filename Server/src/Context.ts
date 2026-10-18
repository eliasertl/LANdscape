import type { FastifyBaseLogger } from 'fastify';
import type { Config } from './Config';
import type { Database } from './Db/Database';
import type { Repositories } from './Db/Repositories';
import type { SessionService } from './Auth/Sessions';
import type { Lockout } from './Auth/Lockout';
import type { MetricsHub } from './Metrics/Hub';

/** Everything route modules need, passed explicitly instead of via decorators. */
export interface ServerContext {
  config: Config;
  db: Database;
  repos: Repositories;
  sessions: SessionService;
  lockout: Lockout;
  metrics: MetricsHub;
  log: FastifyBaseLogger;
}
