import { registries } from './Registries';
import { isSafeMode } from './SafeMode';
import { useDesktopStore } from '../Store/DesktopStore';
import { useWindowStore } from '../Store/WindowStore';
import { useUiStore } from '../Store/UiStore';
import { useDeviceStore } from '../Store/DeviceStore';
import { useSessionStore } from '../Store/SessionStore';

declare global {
  interface Window {
    /** Inspection handle for the browser console and the Playwright tests (see Docs/Architecture.md → Debugging). */
    landscapeDebug?: unknown;
  }
}

/**
 * Exposes the registries and stores on `window.landscapeDebug`. Same-origin
 * code can already reach all of this through the API; the handle only makes
 * problems quicker to inspect (e.g. `landscapeDebug.registries.apps.list()`).
 */
export function installDebugHandle(): void {
  window.landscapeDebug = {
    registries,
    isSafeMode,
    stores: { desktop: useDesktopStore, windows: useWindowStore, ui: useUiStore, device: useDeviceStore, session: useSessionStore },
  };
}
