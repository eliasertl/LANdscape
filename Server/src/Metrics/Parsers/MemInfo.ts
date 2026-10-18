import type { MemoryMetric } from '@landscape/shared';

/** Parses /proc/meminfo (values in kB) into bytes. */
export function parseMemInfo(text: string): MemoryMetric {
  const values = new Map<string, number>();
  for (const line of text.split('\n')) {
    const match = /^(\w+):\s+(\d+)(?:\s+kB)?/.exec(line);
    if (match) values.set(match[1] as string, Number(match[2]) * 1024);
  }
  const total = values.get('MemTotal') ?? 0;
  const free = values.get('MemFree') ?? 0;
  const buffers = values.get('Buffers') ?? 0;
  const cached = (values.get('Cached') ?? 0) + (values.get('SReclaimable') ?? 0);
  // MemAvailable is what the kernel considers usable without swapping; older kernels lack it.
  const available = values.get('MemAvailable') ?? free + buffers + cached;
  const swapTotal = values.get('SwapTotal') ?? 0;
  const swapFree = values.get('SwapFree') ?? 0;
  if (total === 0) throw new Error('MemTotal missing in /proc/meminfo');
  return {
    totalBytes: total,
    usedBytes: Math.max(0, total - available),
    availableBytes: available,
    swapTotalBytes: swapTotal,
    swapUsedBytes: Math.max(0, swapTotal - swapFree),
  };
}
