/**
 * Keyboard shortcuts: a combo is stored as text like "Ctrl+Alt+ArrowLeft"
 * (modifiers in a fixed order, then the key as KeyboardEvent.key with
 * single letters upper-cased, " " written as "Space"). Settings → Keyboard
 * Shortcuts stores overrides per action id; everything else is a default.
 *
 * The browser reserves the Windows/Command key and many Ctrl combinations
 * (Ctrl+W, Ctrl+T, …), so defaults use Ctrl+Alt.
 */
export interface KeyCombo {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string;
}

export interface ShortcutActionInfo {
  id: string;
  title: string;
  group: 'launcher' | 'windows' | 'system';
  defaultCombo: string | null;
}

export const SHORTCUT_ACTIONS: ShortcutActionInfo[] = [
  { id: 'launcher.open', title: 'Open the launcher', group: 'launcher', defaultCombo: 'Ctrl+Space' },
  { id: 'window.close', title: 'Close window', group: 'windows', defaultCombo: 'Ctrl+Alt+W' },
  { id: 'window.minimize', title: 'Minimize window', group: 'windows', defaultCombo: 'Ctrl+Alt+M' },
  { id: 'window.maximize', title: 'Maximize or restore window', group: 'windows', defaultCombo: 'Ctrl+Alt+Enter' },
  { id: 'window.snapLeft', title: 'Snap window to the left half', group: 'windows', defaultCombo: 'Ctrl+Alt+ArrowLeft' },
  { id: 'window.snapRight', title: 'Snap window to the right half', group: 'windows', defaultCombo: 'Ctrl+Alt+ArrowRight' },
  { id: 'window.snapUp', title: 'Maximize window (snap up)', group: 'windows', defaultCombo: 'Ctrl+Alt+ArrowUp' },
  { id: 'window.snapDown', title: 'Restore or minimize window (snap down)', group: 'windows', defaultCombo: 'Ctrl+Alt+ArrowDown' },
  { id: 'window.next', title: 'Switch to the next window', group: 'windows', defaultCombo: 'Ctrl+Alt+Tab' },
  { id: 'desktop.show', title: 'Show the desktop (minimize all)', group: 'windows', defaultCombo: 'Ctrl+Alt+D' },
  { id: 'settings.open', title: 'Open Settings', group: 'system', defaultCombo: 'Ctrl+Alt+,' },
  { id: 'session.lock', title: 'Lock', group: 'system', defaultCombo: 'Ctrl+Alt+L' },
  { id: 'notifications.toggle', title: 'Open the notification center', group: 'system', defaultCombo: 'Ctrl+Alt+N' },
];

const MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;

function normalizeKey(key: string): string {
  if (key === ' ' || key.toLowerCase() === 'space' || key === 'Spacebar') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Parses "Ctrl+Alt+ArrowLeft"; returns null for an empty or modifier-only combo. */
export function parseCombo(text: string): KeyCombo | null {
  const parts = text
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const combo: KeyCombo = { ctrl: false, alt: false, shift: false, meta: false, key: '' };
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') combo.ctrl = true;
    else if (lower === 'alt' || lower === 'option') combo.alt = true;
    else if (lower === 'shift') combo.shift = true;
    else if (lower === 'meta' || lower === 'cmd' || lower === 'win') combo.meta = true;
    else if (combo.key) return null;
    else combo.key = normalizeKey(part);
  }
  return combo.key ? combo : null;
}

export function formatCombo(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  if (combo.meta) parts.push('Meta');
  parts.push(normalizeKey(combo.key));
  return parts.join('+');
}

/** A combo from a key event (null while only modifiers are down). */
export function comboFromEvent(event: { key: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }): KeyCombo | null {
  if ((MODIFIERS as readonly string[]).includes(event.key) || event.key === 'Control' || event.key === 'OS' || event.key === 'AltGraph') return null;
  return { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey, key: normalizeKey(event.key) };
}

export function sameCombo(a: KeyCombo | null, b: KeyCombo | null): boolean {
  if (!a || !b) return false;
  return a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta && a.key.toLowerCase() === b.key.toLowerCase();
}

/** Looks like a shortcut the browser or OS will not let a page see or override. */
export function isReservedCombo(combo: KeyCombo): string | null {
  if (combo.meta) return 'The Windows/Command key is reserved by the browser and the operating system.';
  if (combo.ctrl && !combo.alt && !combo.shift && ['W', 'T', 'N', 'R', 'L', 'F', 'P', 'S', 'Tab', 'F4'].includes(combo.key)) {
    return `Ctrl+${combo.key} is reserved by the browser.`;
  }
  if (!combo.ctrl && !combo.alt && !combo.meta && combo.key.length === 1) return 'Plain letters and digits would interfere with typing.';
  if (['F5', 'F11', 'F12'].includes(combo.key) && !combo.ctrl && !combo.alt) return `${combo.key} is reserved by the browser.`;
  return null;
}

/** Effective combo per action: the stored override ("" = unbound) or the default. */
export function effectiveBindings(overrides: Record<string, string>): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const action of SHORTCUT_ACTIONS) {
    const override = overrides[action.id];
    result[action.id] = override === undefined ? action.defaultCombo : override === '' ? null : override;
  }
  return result;
}

/** Action ids that share a combo with another action. */
export function findConflicts(bindings: Record<string, string | null>): Record<string, string[]> {
  const byCombo = new Map<string, string[]>();
  for (const [id, text] of Object.entries(bindings)) {
    const combo = text ? parseCombo(text) : null;
    if (!combo) continue;
    const key = formatCombo(combo).toLowerCase();
    byCombo.set(key, [...(byCombo.get(key) ?? []), id]);
  }
  const conflicts: Record<string, string[]> = {};
  for (const ids of byCombo.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) conflicts[id] = ids.filter((other) => other !== id);
  }
  return conflicts;
}

/** The action bound to an event, if any. */
export function matchShortcut(bindings: Record<string, string | null>, event: Parameters<typeof comboFromEvent>[0]): string | null {
  const combo = comboFromEvent(event);
  if (!combo) return null;
  for (const [id, text] of Object.entries(bindings)) {
    if (text && sameCombo(parseCombo(text), combo)) return id;
  }
  return null;
}
