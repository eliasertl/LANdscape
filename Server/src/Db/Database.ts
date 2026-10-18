import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { runMigrations } from './Migrations';

export type Row = Record<string, SQLOutputValue>;

/**
 * Thin wrapper around node:sqlite so the rest of the server never touches the
 * driver directly. Swapping to better-sqlite3 would only change this file.
 */
export class Database {
  private readonly db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 5000');
    runMigrations(this);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, ...params: SQLInputValue[]): { changes: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  get<T extends Row = Row>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T extends Row = Row>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  get userVersion(): number {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    return row.user_version;
  }

  set userVersion(version: number) {
    this.db.exec(`PRAGMA user_version = ${Math.floor(version)}`);
  }

  close(): void {
    this.db.close();
  }
}
