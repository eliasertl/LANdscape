import { effectiveBindings, matchShortcut } from '@landscape/shared';
import { useDesktopStore } from '../Store/DesktopStore';

type Handler = () => void;

const handlers = new Map<string, Handler>();
let installed = false;

/** Registers what an action id does when its shortcut is pressed; returns the unregister function. */
export function registerShortcutHandler(actionId: string, handler: Handler): () => void {
  handlers.set(actionId, handler);
  return () => {
    if (handlers.get(actionId) === handler) handlers.delete(actionId);
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * One document-level keydown listener for every rebindable shortcut
 * (Settings → Keyboard Shortcuts). Bindings are read from the settings on
 * each key press, so a change applies immediately. Keys inside iframes never
 * reach the document; that is a browser limit.
 */
export function installKeyboardShortcuts(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const bindings = effectiveBindings(useDesktopStore.getState().settings?.keyboard.bindings ?? {});
    const actionId = matchShortcut(bindings, event);
    if (!actionId) return;
    // Plain-key shortcuts (none by default) must not steal typing; modifier combos are always ours.
    if (!event.ctrlKey && !event.altKey && !event.metaKey && isTypingTarget(event.target)) return;
    const handler = handlers.get(actionId);
    if (!handler) return;
    event.preventDefault();
    event.stopPropagation();
    handler();
  });
}
