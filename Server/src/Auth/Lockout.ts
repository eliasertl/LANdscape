import { LOCKOUT_DURATION_MS, LOCKOUT_MAX_FAILURES } from '@landscape/shared';

interface Entry {
  failures: number;
  lockedUntil: number | null;
  lastFailure: number;
}

/**
 * In-memory per-IP login lockout: after N failures the IP is locked for a
 * fixed duration. State is intentionally not persisted; a restart clears it.
 */
export class Lockout {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures = LOCKOUT_MAX_FAILURES,
    private readonly durationMs = LOCKOUT_DURATION_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Seconds until the lock expires, or 0 when the IP is not locked. */
  lockedFor(ip: string): number {
    const entry = this.entries.get(ip);
    if (!entry?.lockedUntil) return 0;
    const remaining = entry.lockedUntil - this.now();
    if (remaining <= 0) {
      this.entries.delete(ip);
      return 0;
    }
    return Math.ceil(remaining / 1000);
  }

  /** Records a failure and returns the number of attempts left before lockout. */
  recordFailure(ip: string): { remaining: number; lockedForSeconds: number } {
    const now = this.now();
    const entry = this.entries.get(ip) ?? { failures: 0, lockedUntil: null, lastFailure: now };
    // Forget stale failures that are older than the lock window.
    if (now - entry.lastFailure > this.durationMs) entry.failures = 0;
    entry.failures += 1;
    entry.lastFailure = now;
    if (entry.failures >= this.maxFailures) {
      entry.lockedUntil = now + this.durationMs;
      entry.failures = 0;
    }
    this.entries.set(ip, entry);
    return {
      remaining: entry.lockedUntil ? 0 : this.maxFailures - entry.failures,
      lockedForSeconds: entry.lockedUntil ? Math.ceil(this.durationMs / 1000) : 0,
    };
  }

  recordSuccess(ip: string): void {
    this.entries.delete(ip);
  }

  /** Drops stale entries; called periodically. */
  prune(): void {
    const now = this.now();
    for (const [ip, entry] of this.entries) {
      const lockExpired = entry.lockedUntil !== null && entry.lockedUntil <= now;
      const stale = entry.lockedUntil === null && now - entry.lastFailure > this.durationMs;
      if (lockExpired || stale) this.entries.delete(ip);
    }
  }
}
