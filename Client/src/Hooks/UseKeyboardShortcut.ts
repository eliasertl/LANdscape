import { useEffect } from 'react';

export interface ShortcutSpec {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

function matches(event: KeyboardEvent, spec: ShortcutSpec): boolean {
  if (event.key.toLowerCase() !== spec.key.toLowerCase()) return false;
  const ctrlOrMeta = spec.ctrl || spec.meta;
  if (ctrlOrMeta && !(event.ctrlKey || event.metaKey)) return false;
  if (!ctrlOrMeta && (event.ctrlKey || event.metaKey)) return false;
  if (Boolean(spec.shift) !== event.shiftKey) return false;
  if (Boolean(spec.alt) !== event.altKey) return false;
  return true;
}

/** Global keyboard shortcut (document level; iframes with focus will not forward keys). */
export function useKeyboardShortcut(spec: ShortcutSpec, handler: (event: KeyboardEvent) => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (matches(event, spec)) {
        event.preventDefault();
        handler(event);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [spec.key, spec.ctrl, spec.meta, spec.shift, spec.alt, handler, enabled, spec]);
}
