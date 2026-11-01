import {
  DEFAULT_SETTINGS,
  SETTINGS_FIELDS,
  applySettingsPatch,
  readSettingValue,
  type Settings,
  type SettingsKey,
  type SettingsUpdateInput,
  type WallpaperChoice,
} from '@landscape/shared';
import type { Database } from '../Database';

export const DEFAULT_WALLPAPER: WallpaperChoice = DEFAULT_SETTINGS.wallpaper;

const KEYS = Object.keys(SETTINGS_FIELDS) as SettingsKey[];

/**
 * Settings are a key/value table: one JSON value per top-level key of
 * `Settings` (see Shared/src/Settings.ts for the schema and defaults).
 */
export class SettingsRepository {
  constructor(private readonly db: Database) {}

  private getRaw<T>(key: string): T | undefined {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
    if (!row) return undefined;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return undefined;
    }
  }

  private setRaw(key: string, value: unknown): void {
    this.db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value),
    );
  }

  get(): Settings {
    const result = {} as Record<SettingsKey, unknown>;
    for (const key of KEYS) result[key] = readSettingValue(key, this.getRaw(key));
    return result as Settings;
  }

  /**
   * Merges a validated patch and stores only the keys it touches. Returns
   * null-free settings; throws when the merged result is invalid (cannot
   * happen with a patch that passed settingsUpdateSchema, kept as a guard).
   */
  update(patch: SettingsUpdateInput): Settings {
    this.db.transaction(() => {
      const next = applySettingsPatch(this.get(), patch);
      for (const key of Object.keys(patch) as SettingsKey[]) {
        if (patch[key] === undefined) continue;
        this.setRaw(key, SETTINGS_FIELDS[key].parse(next[key]));
      }
    });
    return this.get();
  }

  getFlag(key: string): boolean {
    return this.getRaw<boolean>(key) === true;
  }

  setFlag(key: string, value: boolean): void {
    this.setRaw(key, value);
  }
}
