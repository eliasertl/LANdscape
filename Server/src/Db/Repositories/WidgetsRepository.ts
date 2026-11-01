import { WIDGET_FALLBACK_INTERVAL_MS, type AnchoredPosition, type Widget, type WidgetSettings, type WidgetSize, type WidgetType } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { newId, nowIso } from '../Ids';
import { positionFromRow, type PositionRow } from './Positions';

interface WidgetRow extends Row, PositionRow {
  id: string;
  type: string;
  size: string;
  settings: string;
  created_at: string;
}

function parseSettings(raw: string): WidgetSettings {
  let parsed: Record<string, unknown> = {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const intervalMs =
    typeof parsed.intervalMs === 'number' && Number.isFinite(parsed.intervalMs)
      ? parsed.intervalMs
      : WIDGET_FALLBACK_INTERVAL_MS;
  return { ...parsed, intervalMs };
}

function toWidget(row: WidgetRow): Widget {
  return {
    id: row.id,
    type: row.type,
    position: positionFromRow(row),
    size: row.size as WidgetSize,
    settings: parseSettings(row.settings),
    createdAt: row.created_at,
  };
}

export class WidgetsRepository {
  constructor(private readonly db: Database) {}

  list(): Widget[] {
    return this.db.all<WidgetRow>('SELECT * FROM widgets ORDER BY created_at').map(toWidget);
  }

  find(id: string): Widget | undefined {
    const row = this.db.get<WidgetRow>('SELECT * FROM widgets WHERE id = ?', id);
    return row ? toWidget(row) : undefined;
  }

  /** The client sends the widget's default interval; the fallback covers older clients and the first-run seed. */
  create(type: WidgetType, position: AnchoredPosition, size: WidgetSize = 'm', settings: Partial<WidgetSettings> = {}): Widget {
    const id = newId();
    const merged: WidgetSettings = { intervalMs: WIDGET_FALLBACK_INTERVAL_MS, ...settings };
    this.db.run(
      'INSERT INTO widgets (id, type, anchor_x, anchor_y, offset_col, offset_row, size, settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      type,
      position.anchorX,
      position.anchorY,
      position.offsetCol,
      position.offsetRow,
      size,
      JSON.stringify(merged),
      nowIso(),
    );
    return this.find(id) as Widget;
  }

  update(id: string, patch: { position?: AnchoredPosition; size?: WidgetSize; settings?: WidgetSettings }): Widget | undefined {
    const current = this.find(id);
    if (!current) return undefined;
    const settings = patch.settings ? { ...current.settings, ...patch.settings } : current.settings;
    const position = patch.position ?? current.position;
    this.db.run(
      'UPDATE widgets SET anchor_x = ?, anchor_y = ?, offset_col = ?, offset_row = ?, size = ?, settings = ? WHERE id = ?',
      position.anchorX,
      position.anchorY,
      position.offsetCol,
      position.offsetRow,
      patch.size ?? current.size,
      JSON.stringify(settings),
      id,
    );
    return this.find(id);
  }

  delete(id: string): boolean {
    return this.db.run('DELETE FROM widgets WHERE id = ?', id).changes > 0;
  }

  count(): number {
    const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM widgets');
    return Number(row?.n ?? 0);
  }
}
