import { getApp } from '../Apps/Registry';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import type { DesktopWindow } from '../Store/WindowStore';
import { PlaceholderIcon } from '../Desktop/PlaceholderIcon';
import { AppTile } from '../Desktop/AppTile';

/** Small icon for a window (title bar, taskbar): app tile or shortcut favicon. */
export function WindowIcon({ win, size }: { win: DesktopWindow; size: number }) {
  const shortcut = useDesktopStore((s) => (win.shortcutId ? s.shortcuts.find((x) => x.id === win.shortcutId) : undefined));
  if (win.kind === 'app' && win.appId) {
    const app = getApp(win.appId);
    if (app) return <AppTile app={app} size={size} />;
  }
  if (shortcut) {
    const url = shortcutIconUrl(shortcut);
    if (url) return <img src={url} width={size} height={size} alt="" style={{ borderRadius: Math.round(size * 0.2), objectFit: 'cover' }} />;
    return <PlaceholderIcon name={shortcut.name} size={size} />;
  }
  return <PlaceholderIcon name={win.title} size={size} />;
}
