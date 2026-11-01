import { z } from 'zod';
import { PERMISSIONS } from './Permissions';

/**
 * manifest.json of a catalog app (Docs/AppSdk.md). An app is a frontend-only
 * bundle: every code surface runs in a sandboxed iframe and talks to
 * LANdscape through the SDK; data-only contributions (cursors, themes,
 * wallpapers) need no code.
 */
const appId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/, 'App ids are lowercase letters, digits and dashes');
const localId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, 'Ids are lowercase letters, digits and dashes');
/** A path inside the bundle: relative, no traversal, no leading slash. */
export const bundlePath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^(?!\.\.?(\/|$))(?!.*\/\.\.?(\/|$))[A-Za-z0-9_][A-Za-z0-9._/-]*$/, 'Bundle paths are relative, without ".." or a leading slash');
const semver = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'Use semantic versioning (1.2.3)');
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const hostPattern = z.string().regex(/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i, 'Hosts look like "api.example.com" or "*.example.com"');

const size = z.object({ width: z.number().int().min(100).max(4000), height: z.number().int().min(60).max(4000) });
const cells = z.object({ cols: z.number().int().min(1).max(8), rows: z.number().int().min(1).max(6) });

export const widgetSettingsFieldSchema = z.object({
  key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/),
  label: z.string().min(1).max(60),
  type: z.enum(['toggle', 'select', 'text']),
  options: z.array(z.object({ value: z.string().max(64), label: z.string().max(60) })).max(50).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const appManifestSchema = z
  .object({
    id: appId,
    name: z.string().trim().min(1).max(60),
    version: semver,
    author: z.string().trim().min(1).max(80),
    description: z.string().trim().max(400).default(''),
    /** Path of a PNG or SVG inside the bundle. */
    icon: bundlePath.optional(),
    categories: z.array(z.string().regex(/^[a-z][a-z-]{0,23}$/)).max(5).default([]),
    homepage: z.string().url().max(500).optional(),
    permissions: z.array(z.enum(PERMISSIONS)).default([]),
    /** Hosts `net:fetch` may reach when the app is not trusted. */
    net: z.object({ hosts: z.array(hostPattern).max(50) }).default({ hosts: [] }),
    contributes: z
      .object({
        windows: z
          .array(
            z.object({
              id: localId.default('main'),
              title: z.string().max(60).optional(),
              entry: bundlePath,
              defaultSize: size.default({ width: 900, height: 600 }),
              minSize: size.optional(),
              single: z.boolean().default(true),
            }),
          )
          .max(10)
          .default([]),
        widgets: z
          .array(
            z.object({
              id: localId,
              name: z.string().min(1).max(60),
              description: z.string().max(120).default(''),
              entry: bundlePath,
              sizes: z.object({ s: cells.optional(), m: cells, l: cells.optional() }),
              defaultIntervalMs: z.number().int().min(500).max(600000).default(5000),
              settingsFields: z.array(widgetSettingsFieldSchema).max(20).default([]),
            }),
          )
          .max(10)
          .default([]),
        taskbarItems: z.array(z.object({ id: localId, title: z.string().min(1).max(60), entry: bundlePath })).max(5).default([]),
        trayItems: z.array(z.object({ id: localId, title: z.string().min(1).max(60), entry: bundlePath, defaultVisible: z.boolean().default(true) })).max(5).default([]),
        startupAnimations: z.array(z.object({ id: localId, name: z.string().min(1).max(60), entry: bundlePath })).max(5).default([]),
        cursorSets: z
          .array(
            z.object({
              id: localId,
              name: z.string().min(1).max(60),
              cursors: z.partialRecord(
                z.enum(['default', 'pointer', 'text', 'move', 'resize', 'busy']),
                z.object({ file: bundlePath, hotspotX: z.number().int().min(0).max(128), hotspotY: z.number().int().min(0).max(128) }),
              ),
            }),
          )
          .max(5)
          .default([]),
        themes: z
          .array(
            z.object({
              id: localId,
              name: z.string().min(1).max(60),
              /** Design-token overrides per scheme, e.g. { "--color-accent": "#ff8800" }. Only --color-* and --material-* tokens are applied. */
              tokens: z.object({
                light: z.record(z.string().regex(/^--[a-z-]+$/), z.string().max(120)).default({}),
                dark: z.record(z.string().regex(/^--[a-z-]+$/), z.string().max(120)).default({}),
              }),
              accent: hexColor.optional(),
            }),
          )
          .max(10)
          .default([]),
        wallpapers: z.array(z.object({ id: localId, name: z.string().min(1).max(60), file: bundlePath })).max(20).default([]),
        actions: z
          .array(
            z.object({
              id: localId,
              title: z.string().min(1).max(80),
              description: z.string().max(160).optional(),
              /** Which surface runs the action: a window entry (opens it with the params) or the background runner. */
              params: z.array(z.object({ key: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/), label: z.string().min(1).max(60), placeholder: z.string().max(80).optional() })).max(6).default([]),
            }),
          )
          .max(20)
          .default([]),
        /** A hidden page that runs while LANdscape is open (actions without a window, background timers). */
        background: z.object({ entry: bundlePath }).optional(),
      })
      .prefault({}),
  })
  .strict();

export type AppManifest = z.infer<typeof appManifestSchema>;
export type AppManifestInput = z.input<typeof appManifestSchema>;

/** Parses a manifest.json text; returns the manifest or a readable error. */
export function parseManifest(text: string): { manifest: AppManifest; error: null } | { manifest: null; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { manifest: null, error: 'manifest.json is not valid JSON' };
  }
  const result = appManifestSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    return { manifest: null, error: issue ? `manifest.json: ${issue.path.join('.') || 'root'}: ${issue.message}` : 'manifest.json is invalid' };
  }
  return { manifest: result.data, error: null };
}

/** Every bundle path the manifest references (checked against the zip on install). */
export function manifestEntries(manifest: AppManifest): string[] {
  const c = manifest.contributes;
  return [
    ...(manifest.icon ? [manifest.icon] : []),
    ...c.windows.map((w) => w.entry),
    ...c.widgets.map((w) => w.entry),
    ...c.taskbarItems.map((t) => t.entry),
    ...c.trayItems.map((t) => t.entry),
    ...c.startupAnimations.map((s) => s.entry),
    ...c.cursorSets.flatMap((s) => Object.values(s.cursors).map((cursor) => cursor.file)),
    ...c.wallpapers.map((w) => w.file),
    ...(c.background ? [c.background.entry] : []),
  ];
}

/** Compares semantic versions: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('-')[0]?.split('.').map(Number) ?? [];
  const pb = b.split('-')[0]?.split('.').map(Number) ?? [];
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Catalog/index.json: one entry per app, built by Scripts/src/BuildCatalog.ts. */
export const catalogEntrySchema = z.object({
  id: appId,
  name: z.string().min(1).max(60),
  version: semver,
  author: z.string().max(80).default(''),
  description: z.string().max(400).default(''),
  categories: z.array(z.string()).default([]),
  /** Data URL or relative path to an icon in the catalog folder. */
  icon: z.string().max(200000).nullable().default(null),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().min(0),
  /** http(s) URL of the versioned zip. */
  downloadUrl: z.string().url(),
  homepage: z.string().url().optional(),
});

export const catalogIndexSchema = z.object({
  schema: z.literal(1),
  generatedAt: z.string(),
  apps: z.array(catalogEntrySchema).max(500),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type CatalogIndex = z.infer<typeof catalogIndexSchema>;
