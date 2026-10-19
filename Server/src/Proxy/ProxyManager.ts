import type { FastifyBaseLogger } from 'fastify';
import { ProxyListener, type ProxyRoute } from './Listener';

/** Retry delay for a port that could not be bound (e.g. still held by an old process). */
const RETRY_MS = 30_000;

interface Entry {
  route: ProxyRoute;
  listener: ProxyListener;
  state: 'idle' | 'starting' | 'listening' | 'error';
  error: string | null;
  retry: NodeJS.Timeout | null;
}

export interface ListenerStatus {
  listening: boolean;
  error: string | null;
}

/**
 * Owns one listener per assigned proxy port. `sync` is called with the full
 * desired set of routes whenever assignments change; ports that are no longer
 * assigned are closed, new ones are opened, and re-targeted ones keep their
 * socket and pick up the new route on the next request.
 */
export class ProxyManager {
  private readonly entries = new Map<number, Entry>();
  private started = false;

  constructor(
    private readonly options: {
      host: string;
      isAuthenticated: (cookieHeader: string | undefined) => boolean;
      log: FastifyBaseLogger;
    },
  ) {}

  sync(routes: ProxyRoute[]): void {
    const desired = new Map(routes.map((route) => [route.port, route]));
    for (const [port, entry] of this.entries) {
      if (!desired.has(port)) {
        this.entries.delete(port);
        if (entry.retry) clearTimeout(entry.retry);
        void entry.listener.close();
        this.options.log.info({ port }, 'Embed proxy port closed');
      }
    }
    for (const route of desired.values()) {
      const existing = this.entries.get(route.port);
      if (existing) {
        existing.route = route;
        continue;
      }
      const entry: Entry = {
        route,
        state: 'idle',
        error: null,
        retry: null,
        listener: new ProxyListener({
          port: route.port,
          host: this.options.host,
          route: () => (this.entries.get(route.port) === entry ? entry.route : null),
          isAuthenticated: this.options.isAuthenticated,
          log: this.options.log,
        }),
      };
      this.entries.set(route.port, entry);
      if (this.started) this.open(entry);
    }
  }

  /** Starts listening on every assigned port (called once the main server is up). */
  start(): void {
    this.started = true;
    for (const entry of this.entries.values()) {
      if (entry.state === 'idle') this.open(entry);
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    const closing = [...this.entries.values()].map((entry) => {
      if (entry.retry) clearTimeout(entry.retry);
      entry.retry = null;
      entry.state = 'idle';
      return entry.listener.close();
    });
    await Promise.all(closing);
  }

  status(port: number): ListenerStatus {
    const entry = this.entries.get(port);
    if (!entry) return { listening: false, error: 'Not assigned' };
    return { listening: entry.state === 'listening', error: entry.error };
  }

  private open(entry: Entry): void {
    entry.state = 'starting';
    const { port } = entry.route;
    entry.listener.listen().then(
      () => {
        if (this.entries.get(port) !== entry || !this.started) {
          void entry.listener.close();
          return;
        }
        entry.state = 'listening';
        entry.error = null;
        this.options.log.info({ port, target: entry.route.target.origin }, 'Embed proxy port listening');
      },
      (error: NodeJS.ErrnoException) => {
        if (this.entries.get(port) !== entry) return;
        entry.state = 'error';
        entry.error = error.code === 'EADDRINUSE' ? `Port ${port} is already in use on this host` : (error.code ?? error.message);
        this.options.log.warn({ port, code: error.code }, 'Embed proxy port could not be opened; retrying');
        entry.retry = setTimeout(() => {
          entry.retry = null;
          if (this.started && this.entries.get(port) === entry) this.open(entry);
        }, RETRY_MS);
        entry.retry.unref();
      },
    );
  }
}
