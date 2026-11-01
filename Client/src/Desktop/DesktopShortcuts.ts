import { useEffect } from 'react';
import { registerShortcutHandler } from '../Platform/Keyboard';
import { useWindowStore } from '../Store/WindowStore';
import { useUiStore } from '../Store/UiStore';
import { useSessionStore } from '../Store/SessionStore';
import { openApp } from './Launch';

/**
 * What the rebindable shortcuts (Shared/src/Keyboard.ts → SHORTCUT_ACTIONS)
 * do on the desktop. Window actions apply to the focused window.
 */
export function useDesktopShortcuts(): void {
  useEffect(() => {
    const windows = () => useWindowStore.getState();
    const focused = () => {
      const state = windows();
      return state.focusedId && state.windows.some((w) => w.id === state.focusedId && !w.closing) ? state.focusedId : null;
    };
    const unregister = [
      registerShortcutHandler('launcher.open', () => useUiStore.getState().toggleStartMenu()),
      registerShortcutHandler('window.close', () => {
        const id = focused();
        if (id) void windows().requestClose(id);
      }),
      registerShortcutHandler('window.minimize', () => {
        const id = focused();
        if (id) windows().minimize(id);
      }),
      registerShortcutHandler('window.maximize', () => {
        const id = focused();
        if (id) windows().toggleMaximize(id);
      }),
      registerShortcutHandler('window.snapLeft', () => {
        const id = focused();
        if (id) windows().snapKeyboard(id, 'left');
      }),
      registerShortcutHandler('window.snapRight', () => {
        const id = focused();
        if (id) windows().snapKeyboard(id, 'right');
      }),
      registerShortcutHandler('window.snapUp', () => {
        const id = focused();
        if (id) windows().snapKeyboard(id, 'up');
      }),
      registerShortcutHandler('window.snapDown', () => {
        const id = focused();
        if (id) windows().snapKeyboard(id, 'down');
      }),
      registerShortcutHandler('window.next', () => windows().focusNext()),
      registerShortcutHandler('desktop.show', () => windows().minimizeAll()),
      registerShortcutHandler('settings.open', () => openApp('settings')),
      registerShortcutHandler('session.lock', () => void useSessionStore.getState().lock()),
    ];
    return () => unregister.forEach((fn) => fn());
  }, []);
}
