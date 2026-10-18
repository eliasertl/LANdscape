import { randomBytes } from 'node:crypto';
import { SESSION_DURATION_MS } from '@landscape/shared';
import type { SessionsRepository } from '../Db/Repositories/SessionsRepository';

export interface Session {
  id: string;
  expiresAt: Date;
}

/** DB-backed sessions: logout really invalidates, expiry slides with use. */
export class SessionService {
  constructor(
    private readonly repo: SessionsRepository,
    private readonly durationMs = SESSION_DURATION_MS,
  ) {}

  create(userAgent: string): Session {
    const id = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + this.durationMs);
    this.repo.create(id, expiresAt, userAgent);
    return { id, expiresAt };
  }

  /** Validates a session id and slides its expiry (at most once per hour). */
  validate(id: string | undefined | null): Session | null {
    if (!id || !/^[a-f0-9]{64}$/.test(id)) return null;
    const row = this.repo.find(id);
    if (!row) return null;
    const expiresAt = new Date(row.expires_at);
    const now = new Date();
    if (expiresAt.getTime() <= now.getTime()) {
      this.repo.delete(id);
      return null;
    }
    const lastSeen = new Date(row.last_seen_at);
    if (now.getTime() - lastSeen.getTime() > 60 * 60 * 1000) {
      const next = new Date(now.getTime() + this.durationMs);
      this.repo.touch(id, now, next);
      return { id, expiresAt: next };
    }
    return { id, expiresAt };
  }

  destroy(id: string): void {
    this.repo.delete(id);
  }

  pruneExpired(): number {
    return this.repo.deleteExpired(new Date());
  }
}
