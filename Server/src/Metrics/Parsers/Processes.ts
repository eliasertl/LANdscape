import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ProcessInfo } from '@landscape/shared';

export interface RawProcess {
  pid: number;
  ppid: number;
  name: string;
  state: string;
  /** utime + stime in jiffies */
  cpuTicks: number;
  rssBytes: number;
  uid: number;
  command: string;
}

/** Parses /proc/<pid>/stat; the comm field may contain spaces and parentheses. */
export function parseProcessStat(text: string): { pid: number; name: string; state: string; ppid: number; utime: number; stime: number; rssPages: number } | null {
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < 0) return null;
  const pid = Number(text.slice(0, open).trim());
  const name = text.slice(open + 1, close);
  const rest = text.slice(close + 2).split(/\s+/);
  // rest[0] = state (field 3), fields are 1-indexed in proc(5): ppid=4, utime=14, stime=15, rss=24
  const field = (n: number) => rest[n - 3] ?? '0';
  return {
    pid,
    name,
    state: field(3),
    ppid: Number(field(4)),
    utime: Number(field(14)),
    stime: Number(field(15)),
    rssPages: Number(field(24)),
  };
}

/** Reads Uid and VmRSS from /proc/<pid>/status. */
export function parseProcessStatus(text: string): { uid: number | null; vmRssBytes: number | null } {
  let uid: number | null = null;
  let vmRssBytes: number | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('Uid:')) uid = Number(line.split(/\s+/)[1]);
    else if (line.startsWith('VmRSS:')) vmRssBytes = Number(line.split(/\s+/)[1]) * 1024;
  }
  return { uid, vmRssBytes };
}

function readSafe(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Snapshot of all processes under a procfs root. */
export function readProcesses(procRoot: string, pageSize = 4096): RawProcess[] {
  let entries: string[];
  try {
    entries = readdirSync(procRoot);
  } catch {
    return [];
  }
  const processes: RawProcess[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const dir = path.join(procRoot, entry);
    const stat = readSafe(path.join(dir, 'stat'));
    if (!stat) continue;
    const parsed = parseProcessStat(stat);
    if (!parsed) continue;
    const status = parseProcessStatus(readSafe(path.join(dir, 'status')) ?? '');
    const cmdline = (readSafe(path.join(dir, 'cmdline')) ?? '').replace(/\0+$/, '').replace(/\0/g, ' ');
    processes.push({
      pid: parsed.pid,
      ppid: parsed.ppid,
      name: parsed.name,
      state: parsed.state,
      cpuTicks: parsed.utime + parsed.stime,
      rssBytes: status.vmRssBytes ?? parsed.rssPages * pageSize,
      uid: status.uid ?? -1,
      command: cmdline || `[${parsed.name}]`,
    });
  }
  return processes;
}

export interface ProcessSampleState {
  at: number;
  ticks: Map<number, number>;
  totalTicks: number;
}

/**
 * Computes per-process CPU% relative to the total CPU time elapsed since the
 * previous sample (100% = one full core; multi-core can exceed 100%).
 */
export function processesWithCpu(
  raw: RawProcess[],
  previous: ProcessSampleState | null,
  totalTicksNow: number,
  cpuCount: number,
  resolveUser: (uid: number) => string,
): { processes: ProcessInfo[]; state: ProcessSampleState } {
  const ticks = new Map<number, number>();
  const deltaTotal = previous ? totalTicksNow - previous.totalTicks : 0;
  const processes: ProcessInfo[] = raw.map((p) => {
    ticks.set(p.pid, p.cpuTicks);
    const before = previous?.ticks.get(p.pid);
    let cpuPercent = 0;
    if (previous && before !== undefined && deltaTotal > 0) {
      cpuPercent = Math.max(0, ((p.cpuTicks - before) / deltaTotal) * 100 * cpuCount);
    }
    return {
      pid: p.pid,
      ppid: p.ppid,
      name: p.name,
      user: resolveUser(p.uid),
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      memoryBytes: p.rssBytes,
      state: p.state,
      command: p.command.slice(0, 512),
    };
  });
  return { processes, state: { at: Date.now(), ticks, totalTicks: totalTicksNow } };
}

/** Parses /etc/passwd (or `getent passwd` output) into a uid → name map. */
export function parsePasswd(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const line of text.split('\n')) {
    const parts = line.split(':');
    if (parts.length < 3) continue;
    const uid = Number(parts[2]);
    if (Number.isFinite(uid) && parts[0]) map.set(uid, parts[0]);
  }
  return map;
}
