import { existsSync, readFileSync, statfsSync } from 'node:fs';
import path from 'node:path';
import type { CpuMetric, DisksMetric, NetworkMetric } from '@landscape/shared';
import type { Config } from '../Config';
import type { DockerClient } from '../Docker/Client';
import type { MetricsHub, MetricResult } from './Hub';
import { cpuPercent, parseLoadAvg, parseProcStat, totalTime, type CpuTimes } from './Parsers/ProcStat';
import { parseMemInfo } from './Parsers/MemInfo';
import { computeThroughput, parseNetDev, type NetDevCounters } from './Parsers/NetDev';
import { assignIpv4ToInterfaces, parseFibTrieLocals, parseIfInet6, parseRoutes } from './Parsers/HostAddresses';
import { readTemperatures } from './Parsers/Sensors';
import { parseDf, parseMounts } from './Parsers/Mounts';
import { parseUptime } from './Parsers/Uptime';
import { parsePasswd, processesWithCpu, readProcesses, type ProcessSampleState } from './Parsers/Processes';

export interface SamplerDeps {
  config: Config;
  docker: DockerClient;
  /** Runs a command on the host over SSH, or null when SSH is unavailable. */
  sshExec: ((command: string) => Promise<string>) | null;
}

const NOT_MOUNTED = (what: string, mount: string) => `${what} is not mounted at ${mount}. Mount it read-only in docker-compose.yml.`;

function readProc(config: Config, file: string): string {
  const full = path.join(config.hostProc, file);
  if (!existsSync(path.join(config.hostProc, 'stat'))) throw new Error(NOT_MOUNTED('Host /proc', config.hostProc));
  return readFileSync(full, 'utf8');
}

function unavailable(error: unknown): MetricResult {
  return { available: false, reason: error instanceof Error ? error.message : String(error) };
}

/** Registers every metric sampler on the hub. */
export function registerSamplers(hub: MetricsHub, deps: SamplerDeps): void {
  const { config } = deps;

  // ---- CPU ------------------------------------------------------------
  let previousCpu: { total: CpuTimes; cores: CpuTimes[] } | null = null;
  hub.register('cpu', async () => {
    try {
      const stat = parseProcStat(readProc(config, 'stat'));
      let loadAverage: CpuMetric['loadAverage'] = null;
      try {
        loadAverage = parseLoadAvg(readProc(config, 'loadavg'));
      } catch {
        loadAverage = null;
      }
      const data: CpuMetric = {
        total: previousCpu ? cpuPercent(previousCpu.total, stat.total) : 0,
        cores: stat.cores.map((core, i) => (previousCpu?.cores[i] ? cpuPercent(previousCpu.cores[i] as CpuTimes, core) : 0)),
        loadAverage,
      };
      previousCpu = stat;
      return { available: true, data };
    } catch (error) {
      return unavailable(error);
    }
  });

  // ---- Memory ---------------------------------------------------------
  hub.register('memory', async () => {
    try {
      return { available: true, data: parseMemInfo(readProc(config, 'meminfo')) };
    } catch (error) {
      return unavailable(error);
    }
  });

  // ---- Network --------------------------------------------------------
  let previousNet: { at: number; counters: NetDevCounters[] } | null = null;
  hub.register('network', async () => {
    try {
      // /proc/1/net/dev is the host's network namespace (the container's own /proc/net is not).
      const counters = parseNetDev(readProc(config, '1/net/dev'));
      const now = Date.now();
      const throughput = computeThroughput(previousNet?.counters ?? [], counters, previousNet ? (now - previousNet.at) / 1000 : 0);
      previousNet = { at: now, counters };
      const addresses = hostAddresses(config);
      const data: NetworkMetric = {
        interfaces: throughput.map((t) => ({ ...t, addresses: addresses.get(t.name) ?? [] })),
      };
      return { available: true, data };
    } catch (error) {
      return unavailable(error);
    }
  });

  // ---- Temperatures ---------------------------------------------------
  hub.register('temperatures', async () => {
    if (!existsSync(path.join(config.hostSys, 'class'))) return { available: false, reason: NOT_MOUNTED('Host /sys', config.hostSys) };
    const sensors = readTemperatures(config.hostSys);
    if (sensors.length === 0) return { available: false, reason: 'No temperature sensors found under /sys/class/hwmon or /sys/class/thermal.' };
    return { available: true, data: { sensors } };
  });

  // ---- Uptime ---------------------------------------------------------
  hub.register('uptime', async () => {
    try {
      return { available: true, data: parseUptime(readProc(config, 'uptime')) };
    } catch (error) {
      return unavailable(error);
    }
  });

  // ---- Docker count ---------------------------------------------------
  hub.register('dockerCount', async () => {
    if (!deps.docker.available) return { available: false, reason: `Docker socket not found at ${config.dockerSocket}.` };
    try {
      return { available: true, data: await deps.docker.count() };
    } catch (error) {
      return unavailable(error);
    }
  });

  // ---- Disks ----------------------------------------------------------
  hub.register('disks', async () => {
    try {
      const mounts = parseMounts(readProc(config, '1/mounts'));
      const hostRoot = config.hostRoot && existsSync(path.join(config.hostRoot, 'proc')) ? config.hostRoot : null;
      let usageSource: DisksMetric['usageSource'] = 'none';
      let dfRows: ReturnType<typeof parseDf> = [];
      if (deps.sshExec) {
        try {
          dfRows = parseDf(await deps.sshExec('df -P -B1 -x tmpfs -x devtmpfs -x squashfs -x overlay 2>/dev/null'));
          if (dfRows.length > 0) usageSource = 'ssh';
        } catch {
          dfRows = [];
        }
      }
      const disks = mounts.map((m) => {
        const viaDf = dfRows.find((r) => r.mountPoint === m.mountPoint);
        if (viaDf) return { device: m.device, mountPoint: m.mountPoint, fsType: m.fsType, totalBytes: viaDf.totalBytes, usedBytes: viaDf.usedBytes, freeBytes: viaDf.freeBytes };
        if (hostRoot) {
          try {
            const s = statfsSync(path.join(hostRoot, m.mountPoint));
            const total = Number(s.blocks) * Number(s.bsize);
            const free = Number(s.bavail) * Number(s.bsize);
            if (total > 0) {
              if (usageSource === 'none') usageSource = 'hostRoot';
              return { device: m.device, mountPoint: m.mountPoint, fsType: m.fsType, totalBytes: total, usedBytes: total - Number(s.bfree) * Number(s.bsize), freeBytes: free };
            }
          } catch {
            // fall through
          }
        }
        return { device: m.device, mountPoint: m.mountPoint, fsType: m.fsType, totalBytes: null, usedBytes: null, freeBytes: null };
      });
      // Also surface host mounts that df knows but the mount table filter dropped (e.g. mergerfs).
      for (const row of dfRows) {
        if (!disks.some((d) => d.mountPoint === row.mountPoint) && !/^\/(proc|sys|dev|run)(\/|$)/.test(row.mountPoint)) {
          disks.push({ device: '', mountPoint: row.mountPoint, fsType: '', totalBytes: row.totalBytes, usedBytes: row.usedBytes, freeBytes: row.freeBytes });
        }
      }
      if (disks.length === 0) return { available: false, reason: 'No real file systems found in the host mount table.' };
      return { available: true, data: { disks, usageSource } };
    } catch (error) {
      return unavailable(error);
    }
  });

  // ---- Processes ------------------------------------------------------
  let previousProcesses: ProcessSampleState | null = null;
  let userCache: { at: number; map: Map<number, string> } | null = null;
  hub.register('processes', async () => {
    try {
      const stat = parseProcStat(readProc(config, 'stat'));
      const raw = readProcesses(config.hostProc);
      if (raw.length === 0) return { available: false, reason: 'No processes visible under the host /proc mount (hidepid?).' };
      if (deps.sshExec && (!userCache || Date.now() - userCache.at > 10 * 60 * 1000)) {
        try {
          userCache = { at: Date.now(), map: parsePasswd(await deps.sshExec('getent passwd')) };
        } catch {
          userCache = { at: Date.now(), map: userCache?.map ?? new Map<number, string>() };
        }
      }
      const resolveUser = (uid: number) => userCache?.map.get(uid) ?? (uid === 0 ? 'root' : uid < 0 ? '?' : String(uid));
      const { processes, state } = processesWithCpu(raw, previousProcesses, totalTime(stat.total), Math.max(1, stat.cores.length), resolveUser);
      previousProcesses = state;
      return { available: true, data: { processes, cpuCount: Math.max(1, stat.cores.length) } };
    } catch (error) {
      return unavailable(error);
    }
  });
}

/** Host IPv4/IPv6 addresses per interface from the host's network namespace. */
function hostAddresses(config: Config): Map<string, string[]> {
  const result = new Map<string, string[]>();
  try {
    const locals = parseFibTrieLocals(readFileSync(path.join(config.hostProc, '1/net/fib_trie'), 'utf8'));
    const routes = parseRoutes(readFileSync(path.join(config.hostProc, '1/net/route'), 'utf8'));
    for (const [iface, addresses] of assignIpv4ToInterfaces(locals, routes)) result.set(iface, addresses);
  } catch {
    // ignore: addresses are a nice-to-have
  }
  try {
    for (const [iface, addresses] of parseIfInet6(readFileSync(path.join(config.hostProc, '1/net/if_inet6'), 'utf8'))) {
      result.set(iface, [...(result.get(iface) ?? []), ...addresses]);
    }
  } catch {
    // ignore
  }
  return result;
}
