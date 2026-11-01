import { z } from 'zod';
import { APP_ID_PATTERN } from './AppIds';

/**
 * Server-side settings, shared by every device. Each top-level key is stored
 * as one JSON value in the `settings` table (Server/src/Db/Repositories/SettingsRepository.ts).
 *
 * To add a setting: add the field to its group below and give it a default in
 * DEFAULT_SETTINGS. Older databases simply lack the key and get the default,
 * so an upgrade never changes what the owner sees. Per-device settings live in
 * Client/src/Store/DeviceStore.ts instead.
 */

export const themeSchema = z.enum(['light', 'dark', 'system']);

export const wallpaperChoiceSchema = z.object({
  kind: z.enum(['bundled', 'upload']),
  file: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #ff8800');

export const ACCENT_PRESETS = {
  blue: '#007aff',
  purple: '#af52de',
  pink: '#ff2d55',
  red: '#ff3b30',
  orange: '#ff9500',
  yellow: '#ffcc00',
  green: '#34c759',
  teal: '#30b0c7',
  graphite: '#8e8e93',
} as const;

export const appearanceSettingsSchema = z.object({
  /** A preset name or a hex color. */
  accent: z.union([z.enum(Object.keys(ACCENT_PRESETS) as [keyof typeof ACCENT_PRESETS, ...(keyof typeof ACCENT_PRESETS)[]]), hexColor]),
  /** Blur radius of the translucent materials in px. */
  blur: z.number().int().min(0).max(40),
  slideshow: z.object({
    enabled: z.boolean(),
    intervalMinutes: z.number().int().min(1).max(1440),
    order: z.enum(['sequence', 'shuffle']),
    wallpapers: z.array(wallpaperChoiceSchema).max(100),
  }),
  timeOfDay: z.object({
    enabled: z.boolean(),
    morning: wallpaperChoiceSchema.nullable(),
    day: wallpaperChoiceSchema.nullable(),
    evening: wallpaperChoiceSchema.nullable(),
    night: wallpaperChoiceSchema.nullable(),
  }),
});

export const desktopSettingsSchema = z.object({
  iconSize: z.enum(['s', 'm', 'l']),
  labels: z.enum(['show', 'hide', 'shadow']),
  /** Clicks needed to open a desktop icon. */
  openWith: z.enum(['single', 'double']),
  showIcons: z.boolean(),
  density: z.enum(['compact', 'normal', 'roomy']),
});

export const taskbarSettingsSchema = z.object({
  /** floating = centered pill (default); win10/win11 = full-width docked; dock = floating with magnification. */
  style: z.enum(['floating', 'win10', 'win11', 'dock']),
  position: z.enum(['bottom', 'top', 'left', 'right']),
  autoHide: z.boolean(),
  size: z.enum(['s', 'm', 'l']),
  /** Window titles next to the icons (Windows styles). */
  showTitles: z.boolean(),
  clock: z.object({
    seconds: z.boolean(),
    hours: z.enum(['auto', '12', '24']),
    showDate: z.boolean(),
  }),
  /** Pinned items in order: "app:<id>" or "shortcut:<id>". */
  pinned: z.array(z.string().regex(/^(app|shortcut):[A-Za-z0-9_-]{1,64}$/)).max(50),
  /** Tray items switched off (registry ids). */
  trayHidden: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}(\/[a-z0-9][a-z0-9-]{0,47})?$/)).max(50),
});

export const windowSettingsSchema = z.object({
  animation: z.enum(['normal', 'fast', 'off']),
  /** macOS traffic lights on the left, or Windows-style buttons on the right. */
  buttons: z.enum(['mac', 'windows']),
  openMaximized: z.boolean(),
  cascade: z.boolean(),
});

export const keyboardSettingsSchema = z.object({
  /** Overrides per action id: a combo like "Ctrl+Alt+ArrowLeft", or "" to unbind. Missing = default. */
  bindings: z.record(z.string().regex(/^[a-z]+\.[A-Za-z]+$/), z.string().max(64)),
});

export const proxySettingsSchema = z.object({
  /** Seconds an embed proxy port stays open after its last window closed and its last connection ended. */
  idleGraceSeconds: z.number().int().min(10).max(3600),
});

/** One schema per stored key. */
export const SETTINGS_FIELDS = {
  theme: themeSchema,
  wallpaper: wallpaperChoiceSchema,
  /** Apps switched off in Settings → Apps. Missing ids are enabled. */
  enabledApps: z.record(z.string().regex(APP_ID_PATTERN), z.boolean()),
  proxyIndicator: z.enum(['badge', 'none']),
  proxy: proxySettingsSchema,
  appearance: appearanceSettingsSchema,
  desktop: desktopSettingsSchema,
  taskbar: taskbarSettingsSchema,
  windows: windowSettingsSchema,
  keyboard: keyboardSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_FIELDS;

export const settingsSchema = z.object(SETTINGS_FIELDS);

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  wallpaper: { kind: 'bundled', file: 'aurora.webp' },
  enabledApps: {},
  proxyIndicator: 'badge',
  proxy: { idleGraceSeconds: 60 },
  appearance: {
    accent: 'blue',
    blur: 24,
    slideshow: { enabled: false, intervalMinutes: 30, order: 'sequence', wallpapers: [] },
    timeOfDay: { enabled: false, morning: null, day: null, evening: null, night: null },
  },
  desktop: { iconSize: 'm', labels: 'show', openWith: 'double', showIcons: true, density: 'normal' },
  taskbar: {
    style: 'floating',
    position: 'bottom',
    autoHide: false,
    size: 'm',
    showTitles: false,
    clock: { seconds: false, hours: 'auto', showDate: true },
    pinned: [],
    trayHidden: [],
  },
  windows: { animation: 'normal', buttons: 'mac', openMaximized: false, cascade: true },
  keyboard: { bindings: {} },
};

/** A partial update: top-level keys are optional, groups may name only the fields that change. */
export const settingsUpdateSchema = z
  .object({
    theme: SETTINGS_FIELDS.theme,
    wallpaper: SETTINGS_FIELDS.wallpaper,
    enabledApps: SETTINGS_FIELDS.enabledApps,
    proxyIndicator: SETTINGS_FIELDS.proxyIndicator,
    proxy: proxySettingsSchema.partial(),
    appearance: appearanceSettingsSchema
      .extend({ slideshow: appearanceSettingsSchema.shape.slideshow.partial(), timeOfDay: appearanceSettingsSchema.shape.timeOfDay.partial() })
      .partial(),
    desktop: desktopSettingsSchema.partial(),
    taskbar: taskbarSettingsSchema.extend({ clock: taskbarSettingsSchema.shape.clock.partial() }).partial(),
    windows: windowSettingsSchema.partial(),
    keyboard: keyboardSettingsSchema.partial(),
  })
  .partial()
  .strict();

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Merges `patch` into `base`: plain objects merge recursively, everything else (arrays included) is replaced. */
export function mergeSettingValue<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) result[key] = mergeSettingValue(result[key], value);
  return result as T;
}

/**
 * Reads one stored value: defaults fill missing fields, and a value that no
 * longer validates (e.g. written by a newer version) falls back to the default.
 */
export function readSettingValue<K extends SettingsKey>(key: K, stored: unknown): Settings[K] {
  const fallback = DEFAULT_SETTINGS[key];
  if (stored === undefined) return structuredClone(fallback);
  const candidate = mergeSettingValue(structuredClone(fallback), stored);
  const parsed = SETTINGS_FIELDS[key].safeParse(candidate);
  return parsed.success ? (parsed.data as Settings[K]) : structuredClone(fallback);
}

/** Applies a validated patch to complete settings (pure; used by the server and for optimistic client updates). */
export function applySettingsPatch(current: Settings, patch: SettingsUpdateInput): Settings {
  const next = { ...current } as Record<SettingsKey, unknown>;
  for (const key of Object.keys(patch) as SettingsKey[]) {
    next[key] = mergeSettingValue(current[key], patch[key]);
  }
  return next as Settings;
}
