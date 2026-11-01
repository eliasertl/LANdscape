import type { ContainerInfo, Shortcut } from '@landscape/shared';

/** What the shortcut dialog is prefilled with from a container (Docker app → "Add as shortcut"). */
export interface ShortcutPrefill {
  name: string;
  url: string;
  /** Other published TCP ports the dialog can switch to. */
  ports: number[];
  /** Icon URL from a container label, used as an uploaded icon when present. */
  iconUrl: string | null;
}

/** "my_media-server" → "My Media Server". */
export function prettifyName(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Published TCP ports, lowest first, without duplicates. */
export function publishedTcpPorts(container: ContainerInfo): number[] {
  return [...new Set(container.ports.filter((p) => p.type === 'tcp' && p.publicPort).map((p) => p.publicPort as number))].sort((a, b) => a - b);
}

/** The URL for a port on the host LANdscape was opened with (works via LAN IP, hostname or VPN alike). */
export function containerUrl(port: number, hostname = location.hostname): string {
  return `http://${hostname}:${port}/`;
}

export function shortcutPrefillForContainer(container: ContainerInfo, hostname = location.hostname): ShortcutPrefill | null {
  const ports = publishedTcpPorts(container);
  const first = ports[0];
  if (first === undefined) return null;
  return { name: prettifyName(container.service ?? container.name), url: containerUrl(first, hostname), ports, iconUrl: container.icon };
}

/** A shortcut that already points at one of the container's published ports on this host. */
export function existingShortcutFor(container: ContainerInfo, shortcuts: Shortcut[], hostname = location.hostname): Shortcut | null {
  const ports = publishedTcpPorts(container);
  for (const shortcut of shortcuts) {
    try {
      const url = new URL(shortcut.url);
      const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
      if (url.hostname === hostname && ports.includes(port)) return shortcut;
    } catch {
      // ignore unparsable URLs
    }
  }
  return null;
}
