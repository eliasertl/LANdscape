import { Swap } from '@phosphor-icons/react';
import { useDesktopStore, proxyTotal } from '../Store/DesktopStore';
import type { DesktopWindow } from '../Store/WindowStore';
import { resolveShortcutFrame } from './ShortcutFrame';
import styles from './ProxyBadge.module.css';

/** The proxy port a window's site is shown through, or null (direct, app, or badge turned off in Settings). */
function useProxyBadgePort(win: DesktopWindow): number | null {
  return useDesktopStore((s) => {
    if (win.kind !== 'shortcut' || s.settings?.proxyIndicator === 'none') return null;
    const shortcut = s.shortcuts.find((x) => x.id === win.shortcutId);
    if (!shortcut) return null;
    const frame = resolveShortcutFrame(shortcut, proxyTotal(s.proxy));
    return frame.kind === 'proxy' ? frame.port : null;
  });
}

/**
 * Small mark next to a window title for sites shown through the embed proxy.
 * On phones there is no hover, so the port is spelled out next to the icon.
 */
export function ProxyBadge({ win, showPort = false }: { win: DesktopWindow; showPort?: boolean }) {
  const port = useProxyBadgePort(win);
  if (port === null) return null;
  const label = `Embedded via LANdscape proxy (:${port})`;
  return (
    <span className={styles.badge} title={label} aria-label={label} role="img" data-proxy-badge={port}>
      <Swap weight="bold" aria-hidden="true" />
      {showPort && <span className={styles.port}>:{port}</span>}
    </span>
  );
}
