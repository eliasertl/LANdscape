import { z } from 'zod';
import { APP_ID_PATTERN, WIDGET_MAX_INTERVAL_MS, WIDGET_MIN_INTERVAL_MS, WIDGET_TYPE_PATTERN } from './AppIds';
import { PERMISSIONS } from './Permissions';
import { SHORTCUT_NAME_MAX, SHORTCUT_URL_MAX } from './Constants';
import { METRIC_NAMES } from './Metrics';

const cellOffset = z.number().int().min(-1000).max(1000);

export const anchoredPositionSchema = z.object({
  anchorX: z.enum(['left', 'center', 'right']),
  anchorY: z.enum(['top', 'center', 'bottom']),
  offsetCol: cellOffset,
  offsetRow: cellOffset,
});

export const idSchema = z.string().regex(/^[a-z0-9]{1,64}$/, 'Invalid id');

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

export const unlockSchema = z.object({ password: z.string().min(1).max(1024) });

export const sessionKeySchema = z.string().regex(/^[a-f0-9]{16}$/, 'Invalid session key');

const shortcutFields = {
  name: z.string().trim().min(1, 'Name is required').max(SHORTCUT_NAME_MAX),
  url: httpUrlSchema,
  iconMode: z.enum(['favicon', 'upload']),
  iconFile: z.string().max(128).nullable().optional(),
  openMode: z.enum(['auto', 'embed', 'proxy', 'newtab']),
  position: anchoredPositionSchema.optional(),
  folderId: idSchema.nullable().optional(),
  healthCheck: z.boolean().optional(),
};

export const shortcutCreateSchema = z.object({
  ...shortcutFields,
  iconMode: shortcutFields.iconMode.default('favicon'),
  openMode: shortcutFields.openMode.default('auto'),
});

/** No defaults here: a partial update must never reset fields it does not mention. */
export const shortcutUpdateSchema = z.object(shortcutFields).partial();

/** One call moves any mix of desktop items (after a drop, an untangle or a re-anchor). */
export const desktopPositionsSchema = z.object({
  items: z.array(z.object({ kind: z.enum(['shortcut', 'widget', 'folder']), id: idSchema, position: anchoredPositionSchema })).max(1000),
});

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(SHORTCUT_NAME_MAX),
  position: anchoredPositionSchema.optional(),
});

export const folderUpdateSchema = folderCreateSchema.partial();

export const embedCheckSchema = z.object({ url: httpUrlSchema });

export const widgetSettingsSchema = z
  .object({
    intervalMs: z.number().int().min(WIDGET_MIN_INTERVAL_MS).max(WIDGET_MAX_INTERVAL_MS),
  })
  .catchall(z.unknown());

export const widgetSizeSchema = z.enum(['s', 'm', 'l']);

export const widgetCreateSchema = z.object({
  type: z.string().regex(WIDGET_TYPE_PATTERN, 'Invalid widget type'),
  position: anchoredPositionSchema,
  size: widgetSizeSchema.default('m'),
  settings: widgetSettingsSchema.partial().optional(),
});

export const widgetUpdateSchema = z.object({
  position: anchoredPositionSchema.optional(),
  size: widgetSizeSchema.optional(),
  settings: widgetSettingsSchema.optional(),
});

const coordinate = z.number().finite().min(-100000).max(100000);

export const windowGeometrySchema = z.object({
  x: coordinate,
  y: coordinate,
  width: z.number().finite().min(100).max(20000),
  height: z.number().finite().min(60).max(20000),
  maximized: z.boolean(),
});

export const appKeySchema = z
  .string()
  .regex(/^(shortcut:[A-Za-z0-9_-]{1,64}|app:[a-z0-9][a-z0-9-]{0,47})$/, 'Invalid app key');

export const appIdSchema = z.string().regex(APP_ID_PATTERN, 'Invalid app id');

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

export const notificationCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(1000).default(''),
  level: z.enum(['info', 'warning', 'error']).default('info'),
  /** Apps pass "app:<id>"; the UI's test button passes "test". */
  source: z.string().regex(/^(test|app:[a-z0-9][a-z0-9-]{0,47})$/).default('test'),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const notificationsReadSchema = z.object({ ids: z.union([z.literal('all'), z.array(z.string().regex(/^[a-z0-9]{1,64}$/)).max(500)]) });

export const monitorTargetSchema = z.object({
  /** "<appId>:<key>"; shortcut targets are managed by the server itself. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}:[A-Za-z0-9_-]{1,64}$/),
  kind: z.enum(['http', 'ping']),
  label: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(2048),
  owner: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
});

export const permissionListSchema = z.array(z.enum(PERMISSIONS)).max(20);

/** Install from the catalog or a URL; uploads go through multipart with the same `approve`/`trusted` fields. */
export const appInstallSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('catalog'), id: z.string().regex(APP_ID_PATTERN), approve: z.union([z.literal('all'), permissionListSchema]).default([]), trusted: z.boolean().default(false) }),
  z.object({ source: z.literal('url'), url: httpUrlSchema, approve: z.union([z.literal('all'), permissionListSchema]).default([]), trusted: z.boolean().default(false) }),
]);

export const appTrustSchema = z.object({ trusted: z.boolean().optional(), granted: permissionListSchema.optional() }).strict();

export const appStorageKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/, 'Invalid storage key');

export const appFetchSchema = z.object({
  url: httpUrlSchema,
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
  headers: z.record(z.string().regex(/^[A-Za-z0-9-]{1,64}$/), z.string().max(4096)).default({}),
  body: z.string().max(1024 * 1024).optional(),
});

export const sshExecSchema = z.object({ command: z.string().min(1).max(4096), timeoutMs: z.number().int().min(1000).max(120_000).default(30_000) });

export const killSignalSchema = z.object({ signal: z.enum(['TERM', 'KILL']).default('TERM') });

export const containerIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/);

export type LoginInput = z.infer<typeof loginSchema>;
export type ShortcutCreateInput = z.infer<typeof shortcutCreateSchema>;
export type ShortcutUpdateInput = z.infer<typeof shortcutUpdateSchema>;
export type WidgetCreateInput = z.infer<typeof widgetCreateSchema>;
export type WidgetUpdateInput = z.infer<typeof widgetUpdateSchema>;
