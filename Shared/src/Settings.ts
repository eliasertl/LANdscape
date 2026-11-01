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
};

/** A partial update: top-level keys are optional, groups may name only the fields that change. */
export const settingsUpdateSchema = z
  .object({
    theme: SETTINGS_FIELDS.theme,
    wallpaper: SETTINGS_FIELDS.wallpaper,
    enabledApps: SETTINGS_FIELDS.enabledApps,
    proxyIndicator: SETTINGS_FIELDS.proxyIndicator,
    proxy: proxySettingsSchema.partial(),
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
