import { connect } from 'node:net';
import type { FastifyBaseLogger } from 'fastify';
import type { MonitorSample, MonitorState, MonitorStatus, MonitorTarget, Shortcut } from '@landscape/shared';
import type { Repositories } from '../Db/Repositories';
import type { EventBus } from '../Events/EventBus';
import type { NotificationService } from '../Notify/NotificationService';
import { assertHttpUrl, fetchFollowing } from '../Desktop/SafeFetch';

/** Samples kept per target (at the default 60 s interval: about five hours). */
export const HISTORY_LIMIT = 288;
const CHECK_TIMEOUT_MS = 8000;

interface Entry {
  target: MonitorTarget;
  state: MonitorState;
  checkedAt: string | null;
  latencyMs: number | null;
  reason: string | null;
  history: MonitorSample[];
}

export interface CheckResult {
  up: boolean;
  latencyMs: number | null;
  reason: string | null;
}

/** One HTTP check: any HTTP answer counts as up (a 401 login page is a healthy service); network errors and timeouts are down. */
export async function checkHttp(address: string): Promise<CheckResult> {
  const started = Date.now();
  try {
    const url = assertHttpUrl(address);
    const { response } = await fetchFollowing(url, { method: 'GET', accept: 'text/html,*/*', timeoutMs: CHECK_TIMEOUT_MS });
    await response.body?.cancel().catch(() => undefined);
    const latencyMs = Date.now() - started;
    if (response.status >= 500) return { up: false, latencyMs, reason: `HTTP ${response.status}` };
    return { up: true, latencyMs, reason: null };
  } catch (error) {
    return { up: false, latencyMs: null, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** One "ping": a TCP connect to host:port (ICMP needs raw sockets the container does not have). */
export function checkPing(address: string): Promise<CheckResult> {
  return new Promise((resolve) => {
    const match = /^(.+?):(\d{1,5})$/.exec(address.trim());
    if (!match) {
      resolve({ up: false, latencyMs: null, reason: 'Use host:port' });
      return;
    }
    const host = match[1]?.replace(/^\[|\]$/g, '') ?? '';
    const port = Number(match[2]);
    const started = Date.now();
    const socket = connect({ host, port, timeout: CHECK_TIMEOUT_MS });
    const done = (result: CheckResult) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => done({ up: true, latencyMs: Date.now() - started, reason: null }));
    socket.once('timeout', () => done({ up: false, latencyMs: null, reason: 'Timed out' }));
    socket.once('error', (error: NodeJS.ErrnoException) => done({ up: false, latencyMs: null, reason: error.code ?? error.message }));
  });
}

/**
 * Checks every target (shortcuts with the health check on, plus targets
 * apps registered) at the configured interval, keeps a short history, and
 * reports state changes as events and notifications. Runs server-side, so
 * it works while no browser is open.
 */
export class MonitorService {
  private readonly entries = new Map<string, Entry>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastInterval = 0;

  constructor(
    private readonly deps: {
      repos: Repositories;
      events: EventBus;
      notifications: NotificationService;
      log: FastifyBaseLogger;
      intervalSeconds: () => number;
      notifyOnChange: () => boolean;
      check?: (target: MonitorTarget) => Promise<CheckResult>;
    },
  ) {}

  /** Targets derived from shortcuts (health check on) plus app-registered ones. */
  targets(): MonitorTarget[] {
    const fromShortcuts = this.deps.repos.shortcuts
      .list()
      .filter((s: Shortcut) => s.healthCheck)
      .map((s) => ({ id: `shortcut:${s.id}`, kind: 'http' as const, label: s.name, address: s.url, owner: `shortcut:${s.id}` }));
    return [...fromShortcuts, ...this.deps.repos.monitorTargets.list()];
  }

  /** Re-reads the target list (after shortcut changes); drops entries whose target is gone. */
  reconcile(): void {
    const wanted = new Map(this.targets().map((t) => [t.id, t]));
    for (const id of [...this.entries.keys()]) if (!wanted.has(id)) this.entries.delete(id);
    for (const target of wanted.values()) {
      const existing = this.entries.get(target.id);
      if (existing) existing.target = target;
      else this.entries.set(target.id, { target, state: 'unknown', checkedAt: null, latencyMs: null, reason: null, history: [] });
    }
    this.deps.events.publish({ type: 'monitor-targets' });
  }

  register(target: MonitorTarget): void {
    this.deps.repos.monitorTargets.upsert(target);
    this.reconcile();
  }

  unregister(id: string): boolean {
    const removed = this.deps.repos.monitorTargets.delete(id);
    this.reconcile();
    return removed;
  }

  start(): void {
    this.reconcile();
    this.schedule(true);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  statuses(): MonitorStatus[] {
    return [...this.entries.values()].map((entry) => this.status(entry));
  }

  statusOf(id: string): MonitorStatus | undefined {
    const entry = this.entries.get(id);
    return entry ? this.status(entry) : undefined;
  }

  /** Checks every target now (the timer also calls this); safe to call while a run is in progress. */
  async checkAll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      this.reconcile();
      await Promise.all([...this.entries.values()].map((entry) => this.checkOne(entry)));
    } finally {
      this.running = false;
    }
  }

  private status(entry: Entry): MonitorStatus {
    return { target: entry.target, state: entry.state, checkedAt: entry.checkedAt, latencyMs: entry.latencyMs, reason: entry.reason, history: entry.history };
  }

  private schedule(first: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    const seconds = this.deps.intervalSeconds();
    this.lastInterval = seconds;
    this.timer = setTimeout(
      () => {
        void this.checkAll().finally(() => this.schedule(false));
      },
      first ? 3000 : seconds * 1000,
    );
    this.timer.unref();
  }

  /** Applies a changed interval setting without waiting for the current timer. */
  rescheduleIfChanged(): void {
    if (this.timer && this.deps.intervalSeconds() !== this.lastInterval) this.schedule(false);
  }

  private async checkOne(entry: Entry): Promise<void> {
    const check = this.deps.check ?? ((target: MonitorTarget) => (target.kind === 'http' ? checkHttp(target.address) : checkPing(target.address)));
    const result = await check(entry.target);
    const previous = entry.state;
    const now = new Date().toISOString();
    entry.state = result.up ? 'up' : 'down';
    entry.checkedAt = now;
    entry.latencyMs = result.latencyMs;
    entry.reason = result.reason;
    entry.history.push({ at: now, up: result.up, latencyMs: result.latencyMs });
    if (entry.history.length > HISTORY_LIMIT) entry.history.splice(0, entry.history.length - HISTORY_LIMIT);
    if (previous === entry.state) return;
    this.deps.events.publish({ type: 'monitor-status', status: this.status(entry) });
    // The first result after start is not a change worth a notification unless it is "down".
    if (previous === 'unknown' && entry.state === 'up') return;
    if (!this.deps.notifyOnChange()) return;
    this.deps.notifications.notify({
      source: 'monitor',
      level: entry.state === 'down' ? 'error' : 'info',
      title: entry.state === 'down' ? `${entry.target.label} is down` : `${entry.target.label} is back`,
      body: entry.state === 'down' ? (result.reason ?? 'No answer') : `Answered in ${result.latencyMs ?? 0} ms`,
      data: { target: entry.target.id, owner: entry.target.owner },
    });
  }
}
