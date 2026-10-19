import { shortcutWantsProxy, type Embeddable, type OpenMode, type ProxyRange } from '@landscape/shared';

export interface PlanShortcut {
  id: string;
  openMode: OpenMode;
  embeddable: Embeddable;
  proxyPort: number | null;
  createdAt: string;
}

export interface ProxyPlan {
  /** Shortcuts whose port is taken away (no longer proxied, out of range, or a duplicate). */
  release: string[];
  /** New assignments, in the order they were made. */
  assign: { id: string; port: number }[];
  /** Shortcuts that should use the proxy but got no port because the range is full. */
  waiting: string[];
}

/**
 * Decides which shortcuts hold which proxy ports. Existing assignments are
 * kept while still valid, so a running app keeps its port (and cookies).
 * Free ports go out lowest first: explicit "proxy" shortcuts before "auto"
 * ones, older before newer.
 */
export function planProxyPorts(shortcuts: PlanShortcut[], range: ProxyRange): ProxyPlan {
  const byAge = [...shortcuts].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const kept = new Set<number>();
  const holding = new Set<string>();
  const release: string[] = [];

  for (const shortcut of byAge) {
    const port = shortcut.proxyPort;
    if (port === null) continue;
    const valid = shortcutWantsProxy(shortcut) && port >= range.start && port <= range.end && !kept.has(port);
    if (valid) {
      kept.add(port);
      holding.add(shortcut.id);
    } else {
      release.push(shortcut.id);
    }
  }

  const needing = byAge
    .filter((s) => shortcutWantsProxy(s) && !holding.has(s.id))
    .sort((a, b) => Number(b.openMode === 'proxy') - Number(a.openMode === 'proxy'));

  const assign: { id: string; port: number }[] = [];
  const waiting: string[] = [];
  let next = range.start;
  for (const shortcut of needing) {
    while (next <= range.end && kept.has(next)) next += 1;
    if (next > range.end) {
      waiting.push(shortcut.id);
      continue;
    }
    assign.push({ id: shortcut.id, port: next });
    kept.add(next);
  }
  return { release, assign, waiting };
}
