/** Built-in app identifiers. Each has a self-contained folder under Client/src/Apps. */
export const APP_IDS = [
  'settings',
  'terminal',
  'files',
  'text-editor',
  'docker',
  'task-manager',
  'log-viewer',
] as const;

export type AppId = (typeof APP_IDS)[number];

export function isAppId(value: string): value is AppId {
  return (APP_IDS as readonly string[]).includes(value);
}

/** Widget type identifiers. Each has a self-contained folder under Client/src/Widgets. */
export const WIDGET_TYPES = [
  'clock',
  'cpu',
  'ram',
  'disk',
  'network',
  'temperature',
  'uptime',
  'docker-count',
] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];

export function isWidgetType(value: string): value is WidgetType {
  return (WIDGET_TYPES as readonly string[]).includes(value);
}

/** Default update interval per widget type, in milliseconds. */
export const WIDGET_DEFAULT_INTERVAL_MS: Record<WidgetType, number> = {
  clock: 1000,
  cpu: 2000,
  network: 2000,
  ram: 5000,
  temperature: 5000,
  'docker-count': 10000,
  disk: 30000,
  uptime: 60000,
};

export const WIDGET_MIN_INTERVAL_MS = 500;
export const WIDGET_MAX_INTERVAL_MS = 10 * 60 * 1000;
