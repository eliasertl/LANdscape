import { WIDGET_DEFAULT_INTERVAL_MS, type Widget, type WidgetSettings, type WidgetType } from '@landscape/shared';
import type { Database, Row } from '../Database';
import { newId, nowIso } from '../Ids';

interface WidgetRow extends Row {
  id: string;
  type: string;
  x: number;
  y: number;
  settings: string;
  created_at: string;
}

function parseSettings(type: WidgetType, raw: string): WidgetSettings {
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
      : WIDGET_DEFAULT_INTERVAL_MS[type];
  return { ...parsed, intervalMs };
}

function toWidget(row: WidgetRow): Widget {
  const type = row.type as WidgetType;
  return {
    id: row.id,
    type,
    x: Number(row.x),
    y: Number(row.y),
    settings: parseSettings(type, row.settings),
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

  create(type: WidgetType, x: number, y: number, settings: Partial<WidgetSettings> = {}): Widget {
    const id = newId();
    const merged: WidgetSettings = { intervalMs: WIDGET_DEFAULT_INTERVAL_MS[type], ...settings };
    this.db.run(
      'INSERT INTO widgets (id, type, x, y, settings, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id,
      type,
      x,
      y,
      JSON.stringify(merged),
      nowIso(),
    );
    return this.find(id) as Widget;
  }

  update(id: string, patch: { x?: number; y?: number; settings?: WidgetSettings }): Widget | undefined {
    const current = this.find(id);
    if (!current) return undefined;
    const settings = patch.settings ? { ...current.settings, ...patch.settings } : current.settings;
    this.db.run(
      'UPDATE widgets SET x = ?, y = ?, settings = ? WHERE id = ?',
      patch.x ?? current.x,
      patch.y ?? current.y,
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
