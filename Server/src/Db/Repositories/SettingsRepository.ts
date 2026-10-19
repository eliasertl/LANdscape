import { APP_IDS, type AppId, type ProxyIndicator, type Settings, type Theme, type WallpaperChoice } from '@landscape/shared';
import type { Database } from '../Database';

export const DEFAULT_WALLPAPER: WallpaperChoice = { kind: 'bundled', file: 'aurora.webp' };

function defaultEnabledApps(): Record<AppId, boolean> {
  return Object.fromEntries(APP_IDS.map((id) => [id, true])) as Record<AppId, boolean>;
}

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
    const theme = this.getRaw<Theme>('theme') ?? 'system';
    const wallpaper = this.getRaw<WallpaperChoice>('wallpaper') ?? DEFAULT_WALLPAPER;
    const enabledApps = { ...defaultEnabledApps(), ...(this.getRaw<Partial<Record<AppId, boolean>>>('enabledApps') ?? {}) };
    const proxyIndicator = this.getRaw<ProxyIndicator>('proxyIndicator') === 'none' ? 'none' : 'badge';
    return { theme, wallpaper, enabledApps, proxyIndicator };
  }

  update(patch: {
    theme?: Theme;
    wallpaper?: WallpaperChoice;
    enabledApps?: Partial<Record<AppId, boolean>>;
    proxyIndicator?: ProxyIndicator;
  }): Settings {
    this.db.transaction(() => {
      if (patch.theme) this.setRaw('theme', patch.theme);
      if (patch.proxyIndicator) this.setRaw('proxyIndicator', patch.proxyIndicator);
      if (patch.wallpaper) this.setRaw('wallpaper', patch.wallpaper);
      if (patch.enabledApps) {
        const current = this.get().enabledApps;
        this.setRaw('enabledApps', { ...current, ...patch.enabledApps });
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
