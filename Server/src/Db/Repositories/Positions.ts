import type { AnchorX, AnchorY, AnchoredPosition } from '@landscape/shared';
import type { Database } from '../Database';

/** The four anchor columns shared by shortcuts, widgets and folders (see Shared/src/Layout.ts). */
export interface PositionRow {
  anchor_x: string;
  anchor_y: string;
  offset_col: number;
  offset_row: number;
}

export function positionFromRow(row: PositionRow): AnchoredPosition {
  return {
    anchorX: row.anchor_x as AnchorX,
    anchorY: row.anchor_y as AnchorY,
    offsetCol: Number(row.offset_col),
    offsetRow: Number(row.offset_row),
  };
}

const TABLES = { shortcut: 'shortcuts', widget: 'widgets', folder: 'folders' } as const;

export type PositionedKind = keyof typeof TABLES;

/** Moves any mix of desktop items in one transaction. Unknown ids are ignored. */
export function updatePositions(db: Database, items: { kind: PositionedKind; id: string; position: AnchoredPosition }[]): void {
  db.transaction(() => {
    for (const item of items) {
      const table = TABLES[item.kind];
      db.run(
        `UPDATE ${table} SET anchor_x = ?, anchor_y = ?, offset_col = ?, offset_row = ? WHERE id = ?`,
        item.position.anchorX,
        item.position.anchorY,
        item.position.offsetCol,
        item.position.offsetRow,
        item.id,
      );
    }
  });
}
