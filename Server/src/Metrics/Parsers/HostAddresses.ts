/**
 * Host IP addresses from procfs, without netlink access:
 *  - IPv4: /proc/<pid>/net/fib_trie lists every local address as "/32 host LOCAL";
 *          /proc/<pid>/net/route maps destination prefixes to interfaces so each
 *          local address can be assigned to the interface whose subnet contains it.
 *  - IPv6: /proc/<pid>/net/if_inet6 lists address + interface name directly.
 */

export interface RouteEntry {
  iface: string;
  destination: number;
  mask: number;
}

function hexLeToInt(hex: string): number {
  // /proc/net/route stores little-endian hex (e.g. 0001A8C0 for 192.168.1.0).
  const bytes = hex.match(/../g) ?? [];
  return bytes.reverse().reduce((acc, b) => acc * 256 + Number.parseInt(b, 16), 0);
}

export function parseRoutes(text: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  for (const line of text.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8) continue;
    const [iface, destination, , , , , , mask] = parts;
    if (!iface || !destination || !mask) continue;
    routes.push({ iface, destination: hexLeToInt(destination), mask: hexLeToInt(mask) });
  }
  return routes;
}

export function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + Number(part), 0);
}

/** Local IPv4 addresses from fib_trie ("/32 host LOCAL" entries). */
export function parseFibTrieLocals(text: string): string[] {
  const addresses = new Set<string>();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const addressMatch = /\|--\s+(\d+\.\d+\.\d+\.\d+)\s*$/.exec(line);
    if (!addressMatch) continue;
    const address = addressMatch[1] as string;
    // The following line(s) describe the entry type.
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
      const detail = lines[j] ?? '';
      if (/\|--/.test(detail) || /\+--/.test(detail)) break;
      if (/\/32 host LOCAL/.test(detail)) {
        if (!address.startsWith('127.')) addresses.add(address);
        break;
      }
    }
  }
  return [...addresses];
}

/** Assigns each local IPv4 address to the interface with the most specific matching route. */
export function assignIpv4ToInterfaces(addresses: string[], routes: RouteEntry[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const address of addresses) {
    const value = ipv4ToInt(address);
    let best: RouteEntry | null = null;
    for (const route of routes) {
      if (route.mask === 0) continue;
      if ((value & route.mask) >>> 0 === (route.destination & route.mask) >>> 0) {
        if (!best || route.mask > best.mask) best = route;
      }
    }
    if (!best) continue;
    const list = result.get(best.iface) ?? [];
    list.push(address);
    result.set(best.iface, list);
  }
  return result;
}

/** Global/ULA IPv6 addresses per interface from if_inet6 (skips link-local and loopback). */
export function parseIfInet6(text: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const [hex, , , scope, , iface] = parts;
    if (!hex || hex.length !== 32 || !iface) continue;
    // scope 0x00 = global, 0x20 = link-local, 0x10 = host
    if (scope !== '00') continue;
    const groups = hex.match(/.{4}/g) ?? [];
    const compact = compressIpv6(groups.map((g) => Number.parseInt(g, 16).toString(16)).join(':'));
    const list = result.get(iface) ?? [];
    list.push(compact);
    result.set(iface, list);
  }
  return result;
}

function compressIpv6(address: string): string {
  // Replace the longest run of zero groups with "::".
  const groups = address.split(':');
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i] !== '0') continue;
    let j = i;
    while (j < groups.length && groups[j] === '0') j += 1;
    if (j - i > bestLength) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  if (bestLength < 2) return address;
  const head = groups.slice(0, bestStart).join(':');
  const tail = groups.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}
