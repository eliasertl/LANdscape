import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricsHub } from '@server/Metrics/Hub';
import { cpuPercent, parseLoadAvg, parseProcStat } from '@server/Metrics/Parsers/ProcStat';
import { parseMemInfo } from '@server/Metrics/Parsers/MemInfo';
import { computeThroughput, parseNetDev } from '@server/Metrics/Parsers/NetDev';
import { assignIpv4ToInterfaces, parseFibTrieLocals, parseIfInet6, parseRoutes } from '@server/Metrics/Parsers/HostAddresses';
import { readTemperatures } from '@server/Metrics/Parsers/Sensors';
import { parseDf, parseMounts } from '@server/Metrics/Parsers/Mounts';
import { parseUptime } from '@server/Metrics/Parsers/Uptime';
import { parseProcessStat, parseProcessStatus, processesWithCpu, readProcesses } from '@server/Metrics/Parsers/Processes';

const fixtures = path.resolve(import.meta.dirname, 'Fixtures');
const proc = (file: string) => readFileSync(path.join(fixtures, 'Proc', file), 'utf8');

describe('/proc/stat', () => {
  it('parses totals and cores and computes usage from deltas', () => {
    const first = parseProcStat(proc('stat'));
    const second = parseProcStat(proc('stat.later'));
    expect(first.cores).toHaveLength(4);
    expect(first.total.user).toBe(100000);
    // total delta = 1000 + 400 + 1000 = 2400 jiffies, busy = 1400 → 58.3 %
    expect(cpuPercent(first.total, second.total)).toBeCloseTo(58.33, 1);
    expect(cpuPercent(first.cores[0]!, second.cores[0]!)).toBeCloseTo(83.33, 1);
    expect(cpuPercent(first.total, first.total)).toBe(0);
    expect(parseLoadAvg(proc('loadavg'))).toEqual([0.52, 0.61, 0.7]);
  });
});

describe('/proc/meminfo', () => {
  it('converts kB to bytes and uses MemAvailable', () => {
    const mem = parseMemInfo(proc('meminfo'));
    expect(mem.totalBytes).toBe(16318196 * 1024);
    expect(mem.availableBytes).toBe(9876544 * 1024);
    expect(mem.usedBytes).toBe((16318196 - 9876544) * 1024);
    expect(mem.swapTotalBytes).toBe(4194300 * 1024);
    expect(mem.swapUsedBytes).toBe((4194300 - 4000000) * 1024);
  });
});

describe('/proc/net', () => {
  it('skips loopback and virtual interfaces and computes rates', () => {
    const counters = parseNetDev(proc('1/net/dev'));
    expect(counters.map((c) => c.name)).toEqual(['eth0', 'wlan0']);
    expect(counters[0]).toMatchObject({ rxBytes: 5_000_000_000, txBytes: 1_000_000_000 });
    const later = counters.map((c) => ({ ...c, rxBytes: c.rxBytes + 2_000_000, txBytes: c.txBytes + 500_000 }));
    const rates = computeThroughput(counters, later, 2);
    expect(rates[0]).toMatchObject({ name: 'eth0', rxBytesPerSecond: 1_000_000, txBytesPerSecond: 250_000 });
    expect(computeThroughput([], later, 2)[0]?.rxBytesPerSecond).toBe(0);
    expect(parseNetDev(proc('1/net/dev'), true).map((c) => c.name)).toContain('docker0');
  });

  it('derives host IPv4 addresses per interface from fib_trie and route', () => {
    const locals = parseFibTrieLocals(proc('1/net/fib_trie'));
    expect(locals).toEqual(['172.17.0.1', '192.168.1.50', '192.168.2.7']);
    const routes = parseRoutes(proc('1/net/route'));
    expect(routes.find((r) => r.iface === 'eth0' && r.mask !== 0)).toBeDefined();
    const assigned = assignIpv4ToInterfaces(locals, routes);
    expect(assigned.get('eth0')).toEqual(['192.168.1.50']);
    expect(assigned.get('wlan0')).toEqual(['192.168.2.7']);
    expect(assigned.get('docker0')).toEqual(['172.17.0.1']);
  });

  it('reads global IPv6 addresses from if_inet6', () => {
    const v6 = parseIfInet6(proc('1/net/if_inet6'));
    expect(v6.get('eth0')).toEqual(['2001:db8::1']);
    expect(v6.has('lo')).toBe(false);
  });
});

describe('/sys temperatures', () => {
  it('reads hwmon sensors with labels and thermal zones', () => {
    const sensors = readTemperatures(path.join(fixtures, 'Sys'));
    const byLabel = Object.fromEntries(sensors.map((s) => [s.label, s]));
    expect(byLabel.Tctl).toMatchObject({ celsius: 45.125, critical: 95 });
    expect(byLabel.Tccd1).toMatchObject({ celsius: 42 });
    expect(byLabel.Composite).toMatchObject({ celsius: 38.85, max: 84.85 });
    expect(byLabel.x86_pkg_temp).toMatchObject({ celsius: 46 });
    expect(readTemperatures(path.join(fixtures, 'Nope'))).toEqual([]);
  });
});

describe('mount table', () => {
  it('keeps real file systems, decodes spaces and drops duplicates and docker internals', () => {
    const mounts = parseMounts(proc('1/mounts'));
    expect(mounts.map((m) => m.mountPoint)).toEqual(['/', '/DATA', '/mnt/media disk', '/mnt/nas']);
    expect(mounts.find((m) => m.mountPoint === '/mnt/nas')?.fsType).toBe('nfs4');
  });

  it('parses df -P -B1 output', () => {
    const rows = parseDf(readFileSync(path.join(fixtures, 'df.txt'), 'utf8'));
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual({ mountPoint: '/mnt/media disk', totalBytes: 2_000_000_000_000, usedBytes: 500_000_000_000, freeBytes: 1_500_000_000_000 });
  });
});

describe('uptime', () => {
  it('parses seconds and derives the boot time', () => {
    const uptime = parseUptime(proc('uptime'), 1_700_000_000_000);
    expect(uptime.seconds).toBeCloseTo(123456.78);
    expect(new Date(uptime.bootedAt).getTime()).toBeCloseTo(1_700_000_000_000 - 123456.78 * 1000, -2);
  });
});

describe('processes', () => {
  it('parses stat with parentheses in the name and status fields', () => {
    const stat = parseProcessStat(proc('1234/stat'));
    expect(stat).toMatchObject({ pid: 1234, name: 'my (weird) proc', state: 'S', ppid: 1, utime: 1500, stime: 500, rssPages: 2000 });
    expect(parseProcessStatus(proc('1234/status'))).toEqual({ uid: 1000, vmRssBytes: 8192 * 1024 });
  });

  it('reads a procfs tree and computes CPU% between samples', () => {
    const raw = readProcesses(path.join(fixtures, 'Proc'));
    expect(raw.map((p) => p.pid).sort()).toEqual([1234, 5678]);
    const node = raw.find((p) => p.pid === 1234)!;
    expect(node.command).toBe('node server.js --port 8080');
    expect(node.rssBytes).toBe(8192 * 1024);
    const kworker = raw.find((p) => p.pid === 5678)!;
    expect(kworker.command).toBe('[kworker/0:1]');

    const users = (uid: number) => (uid === 1000 ? 'elias' : uid === 0 ? 'root' : String(uid));
    const first = processesWithCpu(raw, null, 1_000_000, 4, users);
    expect(first.processes[0]?.cpuPercent).toBe(0);
    const later = raw.map((p) => (p.pid === 1234 ? { ...p, cpuTicks: p.cpuTicks + 100 } : p));
    const second = processesWithCpu(later, first.state, 1_000_400, 4, users);
    // 100 of 400 total jiffies on a 4-core box = one full core = 100 %
    expect(second.processes.find((p) => p.pid === 1234)).toMatchObject({ cpuPercent: 100, user: 'elias' });
    expect(second.processes.find((p) => p.pid === 5678)).toMatchObject({ cpuPercent: 0, user: 'root' });
  });
});

describe('metrics hub', () => {
  const hubs: MetricsHub[] = [];
  afterEach(() => hubs.forEach((h) => h.stop()));

  it('samples at the fastest interval and fans out per subscriber interval', async () => {
    const hub = new MetricsHub();
    hubs.push(hub);
    let samples = 0;
    hub.register('uptime', async () => {
      samples += 1;
      return { available: true, data: { seconds: samples, bootedAt: '' } };
    });
    const fast: unknown[] = [];
    const slow: unknown[] = [];
    const a = hub.addSubscriber((m) => fast.push(m));
    const b = hub.addSubscriber((m) => slow.push(m));
    a.subscribe('uptime', 500);
    b.subscribe('uptime', 2000);
    await new Promise((r) => setTimeout(r, 1800));
    expect(samples).toBeGreaterThanOrEqual(3);
    expect(fast.length).toBeGreaterThanOrEqual(3);
    expect(slow.length).toBeLessThanOrEqual(2);
    a.dispose();
    b.dispose();
    const after = samples;
    await new Promise((r) => setTimeout(r, 700));
    expect(samples).toBe(after);
  });

  it('reports unavailable metrics instead of throwing', async () => {
    const hub = new MetricsHub();
    hubs.push(hub);
    hub.register('cpu', async () => {
      throw new Error('boom');
    });
    const received: unknown[] = [];
    const sub = hub.addSubscriber((m) => received.push(m));
    sub.subscribe('cpu', 500);
    await new Promise((r) => setTimeout(r, 50));
    expect(received[0]).toMatchObject({ type: 'unavailable', metric: 'cpu', reason: 'boom' });
    sub.dispose();
  });
});
