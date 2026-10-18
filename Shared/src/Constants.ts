/** Limits and defaults shared by server validation and client UI. */

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export const ICON_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const WALLPAPER_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024;

export const ICON_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'] as const;
export const WALLPAPER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const SHORTCUT_NAME_MAX = 64;
export const SHORTCUT_URL_MAX = 2048;

/** Phone layout kicks in below this viewport width (px). */
export const PHONE_BREAKPOINT = 768;

/** Desktop icon grid cell used to find the first free slot for new shortcuts. */
export const ICON_CELL = { width: 96, height: 112 } as const;

export const WINDOW_MIN_SIZE = { width: 320, height: 200 } as const;
export const WINDOW_DEFAULT_SIZE = { width: 1000, height: 680 } as const;

export const SESSION_COOKIE_NAME = 'landscape_session';
