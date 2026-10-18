export interface NetDevCounters {
  name: string;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

const IGNORED = /^(lo|veth|br-|docker|virbr|vnet|tap|tun)/;

/** Parses /proc/net/dev; skips loopback and container/virtual interfaces by default. */
export function parseNetDev(text: string, includeVirtual = false): NetDevCounters[] {
  const result: NetDevCounters[] = [];
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).trim();
    if (!name || name === 'face') continue;
    if (!includeVirtual && (IGNORED.test(name) || name === 'lo')) continue;
    const fields = line
      .slice(colon + 1)
      .trim()
      .split(/\s+/)
      .map(Number);
    if (fields.length < 16) continue;
    result.push({ name, rxBytes: fields[0] ?? 0, rxPackets: fields[1] ?? 0, txBytes: fields[8] ?? 0, txPackets: fields[9] ?? 0 });
  }
  return result;
}

export interface Throughput {
  name: string;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  rxBytesTotal: number;
  txBytesTotal: number;
}

/** Rates between two samples taken `seconds` apart; counters that wrapped yield 0. */
export function computeThroughput(previous: NetDevCounters[], current: NetDevCounters[], seconds: number): Throughput[] {
  const before = new Map(previous.map((c) => [c.name, c]));
  return current.map((c) => {
    const p = before.get(c.name);
    const rate = (now: number, then: number | undefined) => (p && seconds > 0 && then !== undefined && now >= then ? (now - then) / seconds : 0);
    return {
      name: c.name,
      rxBytesPerSecond: rate(c.rxBytes, p?.rxBytes),
      txBytesPerSecond: rate(c.txBytes, p?.txBytes),
      rxBytesTotal: c.rxBytes,
      txBytesTotal: c.txBytes,
    };
  });
}
