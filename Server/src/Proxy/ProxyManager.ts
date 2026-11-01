import type { FastifyBaseLogger } from 'fastify';
import type { ProxyPortState } from '@landscape/shared';
import { ProxyListener, type ProxyRoute } from './Listener';
import { LeaseTable, idleDecision } from './Leases';

/** How often expired leases and idle ports are checked. */
export const SWEEP_MS = 5_000;

interface Entry {
  route: ProxyRoute;
  /** Null while closed; a fresh listener is created for every opening. */
  listener: ProxyListener | null;
  state: ProxyPortState;
  error: string | null;
  opening: Promise<void> | null;
  /** Set while the previous listener shuts down, so a reopen waits for the port to be free. */
  closing: Promise<void> | null;
  /** When the port last became unused (last lease gone); idle time counts from the later of this and the last connection. */
  unusedSince: number;
}

export interface ListenerStatus {
  state: ProxyPortState;
  listening: boolean;
  error: string | null;
  reason: string;
  leases: number;
  connections: number;
  closesInMs: number | null;
}

export class ProxyPortError extends Error {}

/**
 * Owns the listener of every assigned proxy port. The assignment (port and
 * cookie tag) is permanent, the listener is not: a port opens when a window
 * leases it and closes once no lease is alive, no request or WebSocket is
 * active, and the idle grace period has passed (see `sweep`).
 */
export class ProxyManager {
  private readonly entries = new Map<number, Entry>();
  private readonly leases = new LeaseTable();
  private started = false;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly options: {
      host: string;
      isAuthenticated: (cookieHeader: string | undefined) => boolean;
      log: FastifyBaseLogger;
      /** Read on every sweep so a changed setting applies immediately. */
      idleGraceMs: () => number;
    },
  ) {}

  /** Takes the full desired set of routes; dropped ports close, new ones wait (closed) for their first lease. */
  sync(routes: ProxyRoute[]): void {
    const desired = new Map(routes.map((route) => [route.port, route]));
    for (const [port, entry] of this.entries) {
      if (!desired.has(port)) {
        this.entries.delete(port);
        this.leases.releasePort(port);
        if (entry.listener) {
          void entry.listener.close();
          this.options.log.info({ port }, 'Embed proxy port closed (assignment removed)');
        }
      }
    }
    for (const route of desired.values()) {
      const existing = this.entries.get(route.port);
      if (existing) {
        existing.route = route;
        continue;
      }
      this.entries.set(route.port, { route, listener: null, state: 'closed', error: null, opening: null, closing: null, unusedSince: Date.now() });
    }
  }

  /** Enables leasing and starts the idle sweep (called once the main server is up). */
  start(): void {
    this.started = true;
    if (!this.sweepTimer) {
      this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
      this.sweepTimer.unref();
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    await Promise.all([...this.entries.values()].map((entry) => this.closeEntry(entry, null)));
  }

  /** Leases a port for a window and opens its listener if needed. Rejects with ProxyPortError when it cannot listen. */
  async acquire(port: number, now = Date.now()): Promise<string> {
    const entry = this.entries.get(port);
    if (!entry) throw new ProxyPortError(`Port ${port} is not assigned to a shortcut`);
    await this.ensureOpen(entry);
    return this.leases.acquire(port, now);
  }

  /** Renews a lease; reopens the port if it had been closed meanwhile. Returns null for an unknown or expired lease. */
  async renew(id: string, now = Date.now()): Promise<number | null> {
    const port = this.leases.renew(id, now);
    if (port === null) return null;
    const entry = this.entries.get(port);
    if (!entry) return null;
    await this.ensureOpen(entry);
    return port;
  }

  release(id: string, now = Date.now()): void {
    const port = this.leases.release(id);
    if (port === null) return;
    const entry = this.entries.get(port);
    if (entry && this.leases.count(port, now) === 0) entry.unusedSince = now;
  }

  /** Expires leases and closes ports that have been idle for the grace period. Public so tests can pass a clock. */
  sweep(now = Date.now()): void {
    for (const port of this.leases.expire(now)) {
      const entry = this.entries.get(port);
      if (entry && this.leases.count(port, now) === 0) entry.unusedSince = now;
    }
    for (const entry of this.entries.values()) {
      if (entry.state !== 'open') continue;
      const decision = this.decide(entry, now);
      if (decision.close) {
        this.options.log.info({ port: entry.route.port }, 'Embed proxy port closed (idle)');
        void this.closeEntry(entry, null);
      }
    }
  }

  status(port: number, now = Date.now()): ListenerStatus {
    const entry = this.entries.get(port);
    if (!entry) return { state: 'closed', listening: false, error: 'Not assigned', reason: 'Not assigned', leases: 0, connections: 0, closesInMs: null };
    const leases = this.leases.count(port, now);
    const connections = entry.listener?.activity().active ?? 0;
    const base = { state: entry.state, listening: entry.state === 'open', error: entry.error, leases, connections };
    switch (entry.state) {
      case 'open': {
        const decision = this.decide(entry, now);
        return { ...base, reason: decision.reason, closesInMs: decision.closesInMs };
      }
      case 'opening':
        return { ...base, reason: 'Opening…', closesInMs: null };
      case 'error':
        return { ...base, reason: entry.error ?? 'Could not open', closesInMs: null };
      default:
        return { ...base, reason: 'Closed until a window uses it', closesInMs: null };
    }
  }

  private decide(entry: Entry, now: number) {
    const activity = entry.listener?.activity() ?? { active: 0, lastActivityAt: 0 };
    return idleDecision({
      leases: this.leases.count(entry.route.port, now),
      activeConnections: activity.active,
      idleSince: Math.max(entry.unusedSince, activity.lastActivityAt),
      now,
      graceMs: this.options.idleGraceMs(),
    });
  }

  private ensureOpen(entry: Entry): Promise<void> {
    if (!this.started) return Promise.reject(new ProxyPortError('The embed proxy is not running yet'));
    if (entry.state === 'open') return Promise.resolve();
    if (entry.opening) return entry.opening;
    if (entry.closing) return entry.closing.then(() => this.ensureOpen(entry));
    const { port } = entry.route;
    const listener = new ProxyListener({
      port,
      host: this.options.host,
      route: () => (this.entries.get(port) === entry ? entry.route : null),
      isAuthenticated: this.options.isAuthenticated,
      log: this.options.log,
    });
    entry.state = 'opening';
    entry.listener = listener;
    entry.opening = listener.listen().then(
      () => {
        entry.opening = null;
        if (this.entries.get(port) !== entry || !this.started) {
          void listener.close();
          throw new ProxyPortError(`Port ${port} was released while opening`);
        }
        entry.state = 'open';
        entry.error = null;
        entry.unusedSince = Date.now();
        this.options.log.info({ port, target: entry.route.target.origin }, 'Embed proxy port opened');
      },
      (error: NodeJS.ErrnoException) => {
        entry.opening = null;
        entry.listener = null;
        entry.state = 'error';
        entry.error = error.code === 'EADDRINUSE' ? `Port ${port} is already in use on this host` : (error.code ?? error.message);
        this.options.log.warn({ port, code: error.code }, 'Embed proxy port could not be opened');
        throw new ProxyPortError(entry.error);
      },
    );
    return entry.opening;
  }

  private async closeEntry(entry: Entry, error: string | null): Promise<void> {
    const listener = entry.listener;
    entry.listener = null;
    entry.state = 'closed';
    entry.error = error;
    if (!listener) return;
    const closing = listener.close();
    entry.closing = closing;
    await closing;
    if (entry.closing === closing) entry.closing = null;
  }
}
