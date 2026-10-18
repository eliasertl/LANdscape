import type { Database } from '../Database';
import { nowIso } from '../Ids';

export interface SessionRow {
  id: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  user_agent: string;
}

export class SessionsRepository {
  constructor(private readonly db: Database) {}

  create(id: string, expiresAt: Date, userAgent: string): void {
    const now = nowIso();
    this.db.run(
      'INSERT INTO sessions (id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?)',
      id,
      now,
      expiresAt.toISOString(),
      now,
      userAgent.slice(0, 512),
    );
  }

  find(id: string): SessionRow | undefined {
    return this.db.get<SessionRow & Record<string, string>>('SELECT * FROM sessions WHERE id = ?', id);
  }

  touch(id: string, lastSeen: Date, expiresAt: Date): void {
    this.db.run(
      'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?',
      lastSeen.toISOString(),
      expiresAt.toISOString(),
      id,
    );
  }

  delete(id: string): void {
    this.db.run('DELETE FROM sessions WHERE id = ?', id);
  }

  deleteExpired(now: Date): number {
    return this.db.run('DELETE FROM sessions WHERE expires_at <= ?', now.toISOString()).changes;
  }

  count(): number {
    const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions');
    return Number(row?.n ?? 0);
  }
}
