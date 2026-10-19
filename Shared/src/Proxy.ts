import type { Embeddable, OpenMode } from './Types';

/** Default embed proxy port range (inclusive), published by the container. */
export const PROXY_PORT_START_DEFAULT = 8081;
export const PROXY_PORT_END_DEFAULT = 8100;

/**
 * Whether a shortcut should get an embed proxy port: always in "proxy" mode,
 * and in "auto" mode when the direct embed check says the site blocks framing.
 */
export function shortcutWantsProxy(shortcut: { openMode: OpenMode; embeddable: Embeddable }): boolean {
  return shortcut.openMode === 'proxy' || (shortcut.openMode === 'auto' && shortcut.embeddable === 'no');
}

export function proxyPortsFullMessage(total: number): string {
  return `All ${total} proxy ports are in use — free one or widen PROXY_PORT_START/END.`;
}
