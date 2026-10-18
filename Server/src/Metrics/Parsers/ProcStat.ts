export interface CpuTimes {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
}

export interface ProcStat {
  total: CpuTimes;
  cores: CpuTimes[];
}

/** Parses /proc/stat cpu lines (jiffies). */
export function parseProcStat(text: string): ProcStat {
  let total: CpuTimes | null = null;
  const cores: CpuTimes[] = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('cpu')) continue;
    const parts = line.trim().split(/\s+/);
    const name = parts[0] ?? '';
    const n = (i: number) => Number(parts[i] ?? 0);
    const times: CpuTimes = { user: n(1), nice: n(2), system: n(3), idle: n(4), iowait: n(5), irq: n(6), softirq: n(7), steal: n(8) };
    if (name === 'cpu') total = times;
    else cores.push(times);
  }
  if (!total) throw new Error('No cpu line in /proc/stat');
  return { total, cores };
}

export function busyTime(t: CpuTimes): number {
  return t.user + t.nice + t.system + t.irq + t.softirq + t.steal;
}

export function totalTime(t: CpuTimes): number {
  return busyTime(t) + t.idle + t.iowait;
}

/** CPU usage in percent between two samples; 0 when no time has passed. */
export function cpuPercent(previous: CpuTimes, current: CpuTimes): number {
  const total = totalTime(current) - totalTime(previous);
  if (total <= 0) return 0;
  const busy = busyTime(current) - busyTime(previous);
  return Math.max(0, Math.min(100, (busy / total) * 100));
}

/** Parses /proc/loadavg into the three load averages. */
export function parseLoadAvg(text: string): [number, number, number] | null {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const values = parts.slice(0, 3).map(Number);
  if (values.some((v) => !Number.isFinite(v))) return null;
  return values as [number, number, number];
}
