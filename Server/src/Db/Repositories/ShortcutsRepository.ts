import type { AnchoredPosition, Embeddable, IconMode, OpenMode, Shortcut } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { newId, nowIso } from '../Ids';
import { positionFromRow, type PositionRow } from './Positions';

interface ShortcutRow extends Row, PositionRow {
  id: string;
  name: string;
  url: string;
  icon_mode: string;
  icon_file: string | null;
  folder_id: string | null;
  embeddable: string;
  embed_checked_at: string | null;
  embed_reason: string | null;
  open_mode: string;
  proxy_port: number | null;
  proxy_tag: string | null;
  created_at: string;
  updated_at: string;
}

function toShortcut(row: ShortcutRow): Shortcut {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    iconMode: row.icon_mode as IconMode,
    iconFile: row.icon_file,
    position: positionFromRow(row),
    folderId: row.folder_id,
    embeddable: row.embeddable as Embeddable,
    embedCheckedAt: row.embed_checked_at,
    embedReason: row.embed_reason,
    openMode: row.open_mode as OpenMode,
    proxyPort: row.proxy_port === null ? null : Number(row.proxy_port),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ShortcutInsert {
  name: string;
  url: string;
  iconMode: IconMode;
  iconFile: string | null;
  position: AnchoredPosition;
  folderId: string | null;
  embeddable: Embeddable;
  embedReason: string | null;
  openMode: OpenMode;
}

export type ShortcutPatch = Partial<ShortcutInsert & { embedCheckedAt: string | null }>;

/** Server-only view of a proxy assignment (the cookie tag is never sent to the client). */
export interface ProxyAssignmentRow {
  id: string;
  name: string;
  url: string;
  port: number;
  tag: string;
}

export class ShortcutsRepository {
  constructor(private readonly db: Database) {}

  list(): Shortcut[] {
    return this.db.all<ShortcutRow>('SELECT * FROM shortcuts ORDER BY created_at').map(toShortcut);
  }

  find(id: string): Shortcut | undefined {
    const row = this.db.get<ShortcutRow>('SELECT * FROM shortcuts WHERE id = ?', id);
    return row ? toShortcut(row) : undefined;
  }

  create(input: ShortcutInsert): Shortcut {
    const id = newId();
    const now = nowIso();
    this.db.run(
      `INSERT INTO shortcuts (id, name, url, icon_mode, icon_file, anchor_x, anchor_y, offset_col, offset_row, folder_id, embeddable, embed_checked_at, embed_reason, open_mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.url,
      input.iconMode,
      input.iconFile,
      input.position.anchorX,
      input.position.anchorY,
      input.position.offsetCol,
      input.position.offsetRow,
      input.folderId,
      input.embeddable,
      input.embeddable === 'unknown' && !input.embedReason ? null : now,
      input.embedReason,
      input.openMode,
      now,
      now,
    );
    return this.find(id) as Shortcut;
  }

  update(id: string, patch: ShortcutPatch): Shortcut | undefined {
    const current = this.find(id);
    if (!current) return undefined;
    const next = {
      name: patch.name ?? current.name,
      url: patch.url ?? current.url,
      iconMode: patch.iconMode ?? current.iconMode,
      iconFile: patch.iconFile === undefined ? current.iconFile : patch.iconFile,
      position: patch.position ?? current.position,
      folderId: patch.folderId === undefined ? current.folderId : patch.folderId,
      embeddable: patch.embeddable ?? current.embeddable,
      embedCheckedAt: patch.embedCheckedAt === undefined ? current.embedCheckedAt : patch.embedCheckedAt,
      embedReason: patch.embedReason === undefined ? current.embedReason : patch.embedReason,
      openMode: patch.openMode ?? current.openMode,
    };
    this.db.run(
      `UPDATE shortcuts SET name = ?, url = ?, icon_mode = ?, icon_file = ?, anchor_x = ?, anchor_y = ?, offset_col = ?, offset_row = ?,
       folder_id = ?, embeddable = ?, embed_checked_at = ?, embed_reason = ?, open_mode = ?, updated_at = ? WHERE id = ?`,
      next.name,
      next.url,
      next.iconMode,
      next.iconFile,
      next.position.anchorX,
      next.position.anchorY,
      next.position.offsetCol,
      next.position.offsetRow,
      next.folderId,
      next.embeddable,
      next.embedCheckedAt,
      next.embedReason,
      next.openMode,
      nowIso(),
      id,
    );
    return this.find(id);
  }

  /** Sets or clears a shortcut's proxy port and cookie tag without touching updated_at. */
  setProxy(id: string, port: number | null, tag: string | null): void {
    this.db.run('UPDATE shortcuts SET proxy_port = ?, proxy_tag = ? WHERE id = ?', port, tag, id);
  }

  proxyAssignments(): ProxyAssignmentRow[] {
    return this.db
      .all<ShortcutRow>('SELECT * FROM shortcuts WHERE proxy_port IS NOT NULL ORDER BY proxy_port')
      .map((row) => ({ id: row.id, name: row.name, url: row.url, port: Number(row.proxy_port), tag: row.proxy_tag ?? '' }));
  }

  /** Shortcuts inside a folder, oldest first. */
  inFolder(folderId: string): Shortcut[] {
    return this.db.all<ShortcutRow>('SELECT * FROM shortcuts WHERE folder_id = ? ORDER BY created_at', folderId).map(toShortcut);
  }

  delete(id: string): boolean {
    return this.db.run('DELETE FROM shortcuts WHERE id = ?', id).changes > 0;
  }
}
