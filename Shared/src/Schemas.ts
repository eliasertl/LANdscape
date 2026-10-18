import { z } from 'zod';
import { APP_IDS, WIDGET_MAX_INTERVAL_MS, WIDGET_MIN_INTERVAL_MS, WIDGET_TYPES } from './AppIds';
import { SHORTCUT_NAME_MAX, SHORTCUT_URL_MAX } from './Constants';
import { METRIC_NAMES } from './Metrics';

const coordinate = z.number().finite().min(-100000).max(100000);

export const httpUrlSchema = z
  .string()
  .trim()
  .min(1, 'URL is required')
  .max(SHORTCUT_URL_MAX)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Enter a valid http:// or https:// URL');

export const loginSchema = z.object({
  username: z.string().min(1).max(256),
  password: z.string().min(1).max(1024),
});

export const shortcutCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(SHORTCUT_NAME_MAX),
  url: httpUrlSchema,
  iconMode: z.enum(['favicon', 'upload']).default('favicon'),
  iconFile: z.string().max(128).nullable().optional(),
  openMode: z.enum(['auto', 'embed', 'newtab']).default('auto'),
  x: coordinate.optional(),
  y: coordinate.optional(),
});

export const shortcutUpdateSchema = shortcutCreateSchema.partial();

export const shortcutPositionsSchema = z.object({
  positions: z.array(z.object({ id: z.string().min(1).max(64), x: coordinate, y: coordinate })).max(500),
});

export const embedCheckSchema = z.object({ url: httpUrlSchema });

export const widgetSettingsSchema = z
  .object({
    intervalMs: z.number().int().min(WIDGET_MIN_INTERVAL_MS).max(WIDGET_MAX_INTERVAL_MS),
  })
  .catchall(z.unknown());

export const widgetCreateSchema = z.object({
  type: z.enum(WIDGET_TYPES),
  x: coordinate,
  y: coordinate,
  settings: widgetSettingsSchema.partial().optional(),
});

export const widgetUpdateSchema = z.object({
  x: coordinate.optional(),
  y: coordinate.optional(),
  settings: widgetSettingsSchema.optional(),
});

export const windowGeometrySchema = z.object({
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(100).max(20000),
  height: z.number().finite().min(60).max(20000),
  maximized: z.boolean(),
});

export const appKeySchema = z
  .string()
  .regex(/^(shortcut:[A-Za-z0-9_-]{1,64}|app:[a-z-]{1,32})$/, 'Invalid app key');

const enabledAppsSchema = z.object(
  Object.fromEntries(APP_IDS.map((id) => [id, z.boolean()])) as Record<(typeof APP_IDS)[number], z.ZodBoolean>,
);

export const settingsUpdateSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  wallpaper: z
    .object({
      kind: z.enum(['bundled', 'upload']),
      file: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
    })
    .optional(),
  enabledApps: enabledAppsSchema.partial().optional(),
});

export const metricsClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    metric: z.enum(METRIC_NAMES),
    intervalMs: z.number().int().min(WIDGET_MIN_INTERVAL_MS).max(WIDGET_MAX_INTERVAL_MS),
  }),
  z.object({ type: z.literal('unsubscribe'), metric: z.enum(METRIC_NAMES) }),
]);

export const terminalClientMessageSchema = z.object({
  type: z.literal('resize'),
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(1).max(500),
});

/** Absolute POSIX path for SFTP operations. Normalisation happens server-side. */
export const remotePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => p.startsWith('/') && !p.includes('\0'), 'Path must be absolute');

export const logSourceSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('docker'),
    containerId: z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/),
    tail: z.number().int().min(1).max(10000).default(500),
    follow: z.boolean().default(true),
  }),
  z.object({
    source: z.literal('journal'),
    unit: z
      .string()
      .regex(/^[A-Za-z0-9@._:\\-]{1,256}$/)
      .nullable()
      .default(null),
    lines: z.number().int().min(1).max(10000).default(500),
    follow: z.boolean().default(true),
  }),
  z.object({
    source: z.literal('file'),
    path: remotePathSchema,
    follow: z.boolean().default(true),
  }),
]);

/** Plain union: the "open" variants share the type literal and differ by source. */
export const logsClientMessageSchema = z.union([
  z.object({ type: z.literal('close') }),
  z.object({ type: z.literal('open') }).and(logSourceSchema),
]);

export const killSignalSchema = z.object({ signal: z.enum(['TERM', 'KILL']).default('TERM') });

export const containerIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/);

export type LoginInput = z.infer<typeof loginSchema>;
export type ShortcutCreateInput = z.infer<typeof shortcutCreateSchema>;
export type ShortcutUpdateInput = z.infer<typeof shortcutUpdateSchema>;
export type WidgetCreateInput = z.infer<typeof widgetCreateSchema>;
export type WidgetUpdateInput = z.infer<typeof widgetUpdateSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
