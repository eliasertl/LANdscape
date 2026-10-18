import type { Database } from './Database';

/** Ordered migrations. Each entry runs once; the index + 1 becomes the user_version. */
const migrations: string[] = [
  `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX sessions_expires_at ON sessions(expires_at);

  CREATE TABLE shortcuts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon_mode TEXT NOT NULL DEFAULT 'favicon',
    icon_file TEXT,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    embeddable TEXT NOT NULL DEFAULT 'unknown',
    embed_checked_at TEXT,
    embed_reason TEXT,
    open_mode TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE widgets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    settings TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );

  CREATE TABLE window_memory (
    app_key TEXT PRIMARY KEY,
    x REAL NOT NULL,
    y REAL NOT NULL,
    width REAL NOT NULL,
    height REAL NOT NULL,
    maximized INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export function runMigrations(db: Database): void {
  const current = db.userVersion;
  for (let i = current; i < migrations.length; i += 1) {
    db.transaction(() => {
      db.exec(migrations[i] as string);
      db.userVersion = i + 1;
    });
  }
}

export const SCHEMA_VERSION = migrations.length;
