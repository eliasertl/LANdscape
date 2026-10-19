import { proxyPortsFullMessage, shortcutWantsProxy, type Shortcut } from '@landscape/shared';

export type ShortcutFrame =
  | { kind: 'direct'; url: string }
  | { kind: 'proxy'; url: string; port: number }
  | { kind: 'blocked'; title: string; detail: string; hint: string | null };

/**
 * The URL of a shortcut on its embed proxy port. Built from the hostname
 * LANdscape was opened with, so it works via LAN IP, hostname or VPN alike.
 */
export function proxyUrl(shortcut: Shortcut, port: number): string {
  const target = new URL(shortcut.url);
  return `${location.protocol}//${location.hostname}:${port}${target.pathname}${target.search}${target.hash}`;
}

/** Decides how a shortcut window shows its site: directly, through the proxy, or not at all (with why). */
export function resolveShortcutFrame(shortcut: Shortcut, proxyTotal: number): ShortcutFrame {
  if (shortcut.openMode === 'newtab') {
    return { kind: 'blocked', title: 'Opens in a new tab', detail: 'This shortcut is set to always open in a new browser tab.', hint: null };
  }
  const https = location.protocol === 'https:';

  if (shortcutWantsProxy(shortcut)) {
    if (shortcut.proxyPort !== null) {
      if (https) {
        return {
          kind: 'blocked',
          title: 'The proxy needs plain HTTP',
          detail: 'LANdscape is served over HTTPS, but its embed proxy ports speak plain HTTP, so the browser refuses to show them here. Open the site in a new tab instead.',
          hint: null,
        };
      }
      return { kind: 'proxy', url: proxyUrl(shortcut, shortcut.proxyPort), port: shortcut.proxyPort };
    }
    const full = proxyPortsFullMessage(proxyTotal);
    if (shortcut.openMode === 'proxy') {
      return { kind: 'blocked', title: 'No proxy port available', detail: full, hint: null };
    }
    return {
      kind: 'blocked',
      title: "This site can't be embedded",
      detail: shortcut.embedReason ?? 'The site sends headers that forbid showing it inside another page.',
      hint: `It would open through the LANdscape proxy, but ${full.charAt(0).toLowerCase()}${full.slice(1)}`,
    };
  }

  if (https && shortcut.url.startsWith('http:')) {
    return {
      kind: 'blocked',
      title: 'Blocked as mixed content',
      detail: 'LANdscape is served over HTTPS, so the browser refuses to embed this plain-http site. Open it in a new tab instead.',
      hint: null,
    };
  }
  return { kind: 'direct', url: shortcut.url };
}

/** Whether double-clicking the icon cannot show the site in a window (for the small icon badge). */
export function opensOutsideWindow(shortcut: Shortcut): boolean {
  return shortcut.openMode === 'newtab' || (shortcutWantsProxy(shortcut) && shortcut.proxyPort === null);
}
