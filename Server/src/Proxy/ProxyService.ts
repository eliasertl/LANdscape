import { randomBytes } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { shortcutWantsProxy, type ProxyOverview, type ProxyRange, type Shortcut } from '@landscape/shared';
import type { Database } from '../Db/Database';
import type { Repositories } from '../Db/Repositories';
import type { ProxyRoute } from './Listener';
import { ProxyManager } from './ProxyManager';
import { planProxyPorts, type PlanShortcut } from './Assignments';
import { cookiePrefix } from './Rewrite';

function newTag(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (const byte of randomBytes(6)) tag += alphabet[byte % alphabet.length];
  return tag;
}

/**
 * Keeps proxy port assignments in the database consistent with the shortcuts
 * and the configured range, and keeps the listeners in line with the
 * assignments. `reconcile` is the one place where ports change hands.
 */
export class ProxyService {
  private readonly manager: ProxyManager;

  constructor(
    private readonly deps: {
      db: Database;
      repos: Repositories;
      range: ProxyRange;
      host: string;
      isAuthenticated: (cookieHeader: string | undefined) => boolean;
      log: FastifyBaseLogger;
    },
  ) {
    this.manager = new ProxyManager({ host: deps.host, isAuthenticated: deps.isAuthenticated, log: deps.log });
  }

  get range(): ProxyRange {
    return { ...this.deps.range };
  }

  get total(): number {
    return this.deps.range.end - this.deps.range.start + 1;
  }

  /** Applies the port plan to the database and the listeners. Safe to call any time. */
  reconcile(): void {
    const plan = planProxyPorts(this.deps.repos.shortcuts.list(), this.deps.range);
    if (plan.release.length > 0 || plan.assign.length > 0) {
      this.deps.db.transaction(() => {
        for (const id of plan.release) this.deps.repos.shortcuts.setProxy(id, null, null);
        // Every new assignment gets a fresh tag, so cookies left behind by a previous
        // holder of the same port are never forwarded to the new target.
        for (const { id, port } of plan.assign) this.deps.repos.shortcuts.setProxy(id, port, newTag());
      });
      for (const { id, port } of plan.assign) this.deps.log.info({ shortcutId: id, port }, 'Embed proxy port assigned');
    }
    if (plan.waiting.length > 0) this.deps.log.debug({ waiting: plan.waiting.length }, 'All embed proxy ports are in use');
    this.manager.sync(this.routes());
  }

  /** Drops a shortcut's assignment so the next reconcile hands out a fresh one (used when its target origin changes). */
  release(id: string): void {
    this.deps.repos.shortcuts.setProxy(id, null, null);
  }

  /**
   * Whether `candidate` (a new shortcut, or an existing one with pending
   * changes) may be saved. An explicit "proxy" choice is refused when the
   * range is full; "auto" shortcuts are accepted and fall back to a new tab.
   */
  hasRoomFor(candidate: PlanShortcut): boolean {
    if (candidate.openMode !== 'proxy') return true;
    const others = this.deps.repos.shortcuts.list().filter((s) => s.id !== candidate.id);
    return !planProxyPorts([...others, candidate], this.deps.range).waiting.includes(candidate.id);
  }

  overview(): ProxyOverview {
    const rows = this.deps.repos.shortcuts.proxyAssignments();
    const waiting = this.deps.repos.shortcuts
      .list()
      .filter((s: Shortcut) => shortcutWantsProxy(s) && s.proxyPort === null)
      .map((s) => ({ shortcutId: s.id, name: s.name }));
    return {
      ...this.range,
      total: this.total,
      used: rows.length,
      ports: rows.map((row) => ({ port: row.port, shortcutId: row.id, name: row.name, target: new URL(row.url).origin, ...this.manager.status(row.port) })),
      waiting,
    };
  }

  /** Opens the listeners; called once LANdscape itself is listening. */
  start(): void {
    this.manager.start();
  }

  stop(): Promise<void> {
    return this.manager.stop();
  }

  private routes(): ProxyRoute[] {
    return this.deps.repos.shortcuts.proxyAssignments().map((row) => ({
      port: row.port,
      target: new URL(new URL(row.url).origin),
      cookiePrefix: cookiePrefix(row.port, row.tag),
    }));
  }
}
