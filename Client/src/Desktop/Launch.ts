import type { AppId, Shortcut } from '@landscape/shared';
import { getApp } from '../Apps/Registry';
import { useDesktopStore } from '../Store/DesktopStore';
import { useWindowStore } from '../Store/WindowStore';
import { toast } from '../Components/Toast';

/** Opens a shortcut in a window, or in a new tab when it must not be embedded. */
export function openShortcut(shortcut: Shortcut, forceNewTab = false): void {
  if (forceNewTab || shortcut.openMode === 'newtab') {
    window.open(shortcut.url, '_blank', 'noopener');
    return;
  }
  useWindowStore.getState().open({ kind: 'shortcut', shortcutId: shortcut.id, title: shortcut.name });
}

/** Opens a built-in app, respecting the enabled flag and single-instance rule. */
export function openApp(appId: AppId, params?: Record<string, unknown>): string | null {
  const app = getApp(appId);
  if (!app) return null;
  const settings = useDesktopStore.getState().settings;
  if (settings && settings.enabledApps[appId] === false) {
    toast.info(`${app.name} is disabled in Settings.`);
    return null;
  }
  return useWindowStore.getState().open({
    kind: 'app',
    appId,
    title: app.name,
    params,
    defaultSize: app.defaultSize,
    single: app.single,
  });
}
