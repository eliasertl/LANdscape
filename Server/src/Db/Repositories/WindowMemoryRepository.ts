import type { WindowGeometry, WindowMemory } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { nowIso } from '../Ids';

interface WindowRow extends Row {
  app_key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: number;
}

export class WindowMemoryRepository {
  constructor(private readonly db: Database) {}

  all(): WindowMemory {
    const memory: WindowMemory = {};
    for (const row of this.db.all<WindowRow>('SELECT * FROM window_memory')) {
      memory[row.app_key] = {
        x: Number(row.x),
        y: Number(row.y),
        width: Number(row.width),
        height: Number(row.height),
        maximized: row.maximized === 1,
      };
    }
    return memory;
  }

  set(appKey: string, geometry: WindowGeometry): void {
    this.db.run(
      `INSERT INTO window_memory (app_key, x, y, width, height, maximized, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(app_key) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width,
       height = excluded.height, maximized = excluded.maximized, updated_at = excluded.updated_at`,
      appKey,
      geometry.x,
      geometry.y,
      geometry.width,
      geometry.height,
      geometry.maximized ? 1 : 0,
      nowIso(),
    );
  }

  delete(appKey: string): void {
    this.db.run('DELETE FROM window_memory WHERE app_key = ?', appKey);
  }
}
