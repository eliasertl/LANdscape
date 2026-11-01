import { createHash, randomBytes } from 'node:crypto';
import { SESSION_DURATION_MS, type SessionSummary } from '@landscape/shared';
import type { SessionRow, SessionsRepository } from '../Db/Repositories/SessionsRepository';

export interface Session {
  id: string;
  expiresAt: Date;
  /** Locked sessions exist but may only unlock, log out or read the session probe. */
  locked: boolean;
}

/** How often last_seen_at is written (activity heartbeats arrive about once a minute). */
const TOUCH_INTERVAL_MS = 60_000;

/** The opaque key shown in Settings → Sessions (never the cookie value). */
export function sessionKey(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 16);
}

/** A short, readable device name from a user agent ("Chrome on Windows"). */
export function describeDevice(userAgent: string): string {
  const ua = userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  if (!os && !browser) return ua ? 'Unknown device' : 'API client';
  return [browser, os].filter(Boolean).join(' on ');
}

/**
 * DB-backed sessions: logout really invalidates, expiry slides with use, and
 * a session can be locked server-side (the API refuses calls until the
 * password is entered again). Sessions that stay idle longer than
 * Settings → Lock → idle minutes lock themselves on their next request.
 */
export class SessionService {
  constructor(
    private readonly repo: SessionsRepository,
    private readonly options: {
      /** Sliding lifetime; read per call so the setting applies without a restart. */
      durationMs?: () => number;
      /** Idle minutes before auto-lock (0 = never). */
      idleMinutes?: () => number;
      now?: () => Date;
    } = {},
  ) {}

  private durationMs(): number {
    return this.options.durationMs?.() ?? SESSION_DURATION_MS;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  create(userAgent: string): Session {
    const id = randomBytes(32).toString('hex');
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.durationMs());
    this.repo.create(id, expiresAt, userAgent, describeDevice(userAgent), now);
    return { id, expiresAt, locked: false };
  }

  /**
   * Validates a session id, slides its expiry and records activity (at most
   * once a minute). `activity: false` (the session probe, lock-screen polls)
   * never counts as activity, so an idle session still auto-locks.
   */
  validate(id: string | undefined | null, activity = true): Session | null {
    if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
    const row = this.repo.find(id);
    if (!row) return null;
    const now = this.now();
    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() <= now.getTime()) {
      this.repo.delete(id);
      return null;
    }
    let locked = row.locked_at !== null;
    const lastSeen = new Date(row.last_seen_at);
    const idle = this.options.idleMinutes?.() ?? 0;
    if (!locked && idle > 0 && now.getTime() - lastSeen.getTime() >= idle * 60_000) {
      this.repo.setLocked(id, now);
      locked = true;
    }
    if (activity && !locked && now.getTime() - lastSeen.getTime() > TOUCH_INTERVAL_MS) {
      const next = new Date(now.getTime() + this.durationMs());
      this.repo.touch(id, now, next);
      return { id, expiresAt: next, locked };
    }
    return { id, expiresAt, locked };
  }

  lock(id: string): void {
    this.repo.setLocked(id, this.now());
  }

  unlock(id: string): void {
    const now = this.now();
    this.repo.setLocked(id, null);
    this.repo.touch(id, now, new Date(now.getTime() + this.durationMs()));
  }

  list(currentId: string | null): SessionSummary[] {
    return this.repo.list().map((row: SessionRow) => ({
      key: sessionKey(row.id),
      device: row.device,
      userAgent: row.user_agent,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      locked: row.locked_at !== null,
      current: row.id === currentId,
    }));
  }

  /** Revokes the session with this key; returns false when it does not exist. */
  revokeByKey(key: string): boolean {
    const row = this.repo.list().find((r) => sessionKey(r.id) === key);
    if (!row) return false;
    this.repo.delete(row.id);
    return true;
  }

  revokeOthers(currentId: string): number {
    return this.repo.deleteOthers(currentId);
  }

  destroy(id: string): void {
    this.repo.delete(id);
  }

  pruneExpired(): number {
    return this.repo.deleteExpired(this.now());
  }
}
