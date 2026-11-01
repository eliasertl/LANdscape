/**
 * App and widget identifiers. There is no fixed list: built-in apps and
 * widgets register themselves in the client registries (Client/src/Platform),
 * catalog apps register from their manifest. These patterns are the only
 * contract the server needs.
 */

/** An app id: lowercase letters, digits and dashes, e.g. "settings" or "weather". */
export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

/** A widget type: a built-in name ("cpu") or "<appId>/<name>" for widgets contributed by an app. */
export const WIDGET_TYPE_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}(\/[a-z0-9][a-z0-9-]{0,47})?$/;

export type AppId = string;
export type WidgetType = string;

export function isAppId(value: string): boolean {
  return APP_ID_PATTERN.test(value);
}

export function isWidgetType(value: string): boolean {
  return WIDGET_TYPE_PATTERN.test(value);
}

/** Update interval for widgets that do not declare one. */
export const WIDGET_FALLBACK_INTERVAL_MS = 5000;

export const WIDGET_MIN_INTERVAL_MS = 500;
export const WIDGET_MAX_INTERVAL_MS = 10 * 60 * 1000;
