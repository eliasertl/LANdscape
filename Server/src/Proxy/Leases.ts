import { randomBytes } from 'node:crypto';

/**
 * A lease dies this long after its last renewal. The client renews every
 * 20 s; the margin covers background tabs, whose timers browsers throttle
 * to about once a minute.
 */
export const LEASE_TTL_MS = 150_000;

interface Lease {
  port: number;
  expiresAt: number;
}

/**
 * Who currently needs which proxy port. A window that shows a proxied site
 * holds a lease and renews it; a lease that is not renewed in time expires.
 * Pure bookkeeping: time is always passed in, so tests control the clock.
 */
export class LeaseTable {
  private readonly leases = new Map<string, Lease>();

  constructor(private readonly ttlMs = LEASE_TTL_MS) {}

  acquire(port: number, now: number): string {
    const id = randomBytes(16).toString('hex');
    this.leases.set(id, { port, expiresAt: now + this.ttlMs });
    return id;
  }

  /** Extends a live lease. Returns its port, or null when it is unknown or already expired. */
  renew(id: string, now: number): number | null {
    const lease = this.leases.get(id);
    if (!lease || lease.expiresAt <= now) {
      this.leases.delete(id);
      return null;
    }
    lease.expiresAt = now + this.ttlMs;
    return lease.port;
  }

  release(id: string): number | null {
    const lease = this.leases.get(id);
    this.leases.delete(id);
    return lease?.port ?? null;
  }

  /** Drops every lease on a port (the port lost its assignment). */
  releasePort(port: number): void {
    for (const [id, lease] of this.leases) if (lease.port === port) this.leases.delete(id);
  }

  /** Removes expired leases and returns the ports they were on. */
  expire(now: number): number[] {
    const ports = new Set<number>();
    for (const [id, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(id);
        ports.add(lease.port);
      }
    }
    return [...ports];
  }

  /** Live leases on a port. */
  count(port: number, now: number): number {
    let n = 0;
    for (const lease of this.leases.values()) if (lease.port === port && lease.expiresAt > now) n += 1;
    return n;
  }
}

export interface IdleInput {
  leases: number;
  /** In-flight requests plus upgraded (WebSocket) connections. Idle keep-alive sockets do not count. */
  activeConnections: number;
  /** When the last lease ended or the last connection finished (ms since epoch). */
  idleSince: number;
  now: number;
  graceMs: number;
}

export type IdleDecision =
  | { close: false; reason: string; closesInMs: number | null }
  | { close: true; reason: string; closesInMs: null };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Whether an open port should close now, and a short reason for Settings → Proxy. */
export function idleDecision(input: IdleInput): IdleDecision {
  if (input.leases > 0) return { close: false, reason: `In use by ${plural(input.leases, 'window')}`, closesInMs: null };
  if (input.activeConnections > 0) return { close: false, reason: `${plural(input.activeConnections, 'active connection')}`, closesInMs: null };
  const remaining = input.idleSince + input.graceMs - input.now;
  if (remaining > 0) return { close: false, reason: `Idle, closes in ${Math.ceil(remaining / 1000)} s`, closesInMs: remaining };
  return { close: true, reason: 'Idle', closesInMs: null };
}
