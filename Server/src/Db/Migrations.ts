import type { Database } from './Database';

/** Ordered migrations. Each entry runs once; the index + 1 becomes the user_version. */
export const MIGRATIONS: string[] = [
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
  // Embed proxy: the port a shortcut is served on and a random tag that namespaces its cookies.
  // Ports for existing blocked "auto" shortcuts are assigned at startup by Proxy/ProxyService.ts,
  // because the range comes from the configuration.
  `
  ALTER TABLE shortcuts ADD COLUMN proxy_port INTEGER;
  ALTER TABLE shortcuts ADD COLUMN proxy_tag TEXT;
  CREATE UNIQUE INDEX shortcuts_proxy_port ON shortcuts(proxy_port) WHERE proxy_port IS NOT NULL;
  `,
  // Anchored layout (Shared/src/Layout.ts): positions become "cells from an edge or the center"
  // instead of pixels, so a layout keeps its shape on other screen sizes. Existing items become
  // top-left anchors computed from the old 96 × 112 px grid, so nothing moves. Also: widget size
  // steps, desktop folders, and the folder a shortcut lives in. The old x/y columns stay unused.
  `
  CREATE TABLE folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    anchor_x TEXT NOT NULL DEFAULT 'left',
    anchor_y TEXT NOT NULL DEFAULT 'top',
    offset_col INTEGER NOT NULL DEFAULT 0,
    offset_row INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  ALTER TABLE shortcuts ADD COLUMN anchor_x TEXT NOT NULL DEFAULT 'left';
  ALTER TABLE shortcuts ADD COLUMN anchor_y TEXT NOT NULL DEFAULT 'top';
  ALTER TABLE shortcuts ADD COLUMN offset_col INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shortcuts ADD COLUMN offset_row INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE shortcuts ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
  UPDATE shortcuts SET
    offset_col = MAX(0, CAST(ROUND((x - 16) / 96.0) AS INTEGER)),
    offset_row = MAX(0, CAST(ROUND((y - 16) / 112.0) AS INTEGER));

  ALTER TABLE widgets ADD COLUMN anchor_x TEXT NOT NULL DEFAULT 'left';
  ALTER TABLE widgets ADD COLUMN anchor_y TEXT NOT NULL DEFAULT 'top';
  ALTER TABLE widgets ADD COLUMN offset_col INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE widgets ADD COLUMN offset_row INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE widgets ADD COLUMN size TEXT NOT NULL DEFAULT 'm';
  UPDATE widgets SET
    offset_col = MAX(0, CAST(ROUND((x - 16) / 96.0) AS INTEGER)),
    offset_row = MAX(0, CAST(ROUND((y - 16) / 112.0) AS INTEGER));
  `,
];

export function runMigrations(db: Database): void {
  const current = db.userVersion;
  for (let i = current; i < MIGRATIONS.length; i += 1) {
    db.transaction(() => {
      db.exec(MIGRATIONS[i] as string);
      db.userVersion = i + 1;
    });
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;
