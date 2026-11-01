import type { AnchoredPosition, Folder } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { newId, nowIso } from '../Ids';
import { positionFromRow, type PositionRow } from './Positions';

interface FolderRow extends Row, PositionRow {
  id: string;
  name: string;
  created_at: string;
}

function toFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, position: positionFromRow(row), createdAt: row.created_at };
}

/** Desktop folders: one-cell items that hold shortcuts (shortcuts.folder_id). */
export class FoldersRepository {
  constructor(private readonly db: Database) {}

  list(): Folder[] {
    return this.db.all<FolderRow>('SELECT * FROM folders ORDER BY created_at').map(toFolder);
  }

  find(id: string): Folder | undefined {
    const row = this.db.get<FolderRow>('SELECT * FROM folders WHERE id = ?', id);
    return row ? toFolder(row) : undefined;
  }

  create(name: string, position: AnchoredPosition): Folder {
    const id = newId();
    this.db.run(
      'INSERT INTO folders (id, name, anchor_x, anchor_y, offset_col, offset_row, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      name,
      position.anchorX,
      position.anchorY,
      position.offsetCol,
      position.offsetRow,
      nowIso(),
    );
    return this.find(id) as Folder;
  }

  update(id: string, patch: { name?: string; position?: AnchoredPosition }): Folder | undefined {
    const current = this.find(id);
    if (!current) return undefined;
    const position = patch.position ?? current.position;
    this.db.run(
      'UPDATE folders SET name = ?, anchor_x = ?, anchor_y = ?, offset_col = ?, offset_row = ? WHERE id = ?',
      patch.name ?? current.name,
      position.anchorX,
      position.anchorY,
      position.offsetCol,
      position.offsetRow,
      id,
    );
    return this.find(id);
  }

  delete(id: string): boolean {
    return this.db.run('DELETE FROM folders WHERE id = ?', id).changes > 0;
  }
}
