import type { UptimeMetric } from '@landscape/shared';

/** Parses /proc/uptime ("seconds idle"). */
export function parseUptime(text: string, now = Date.now()): UptimeMetric {
  const seconds = Number(text.trim().split(/\s+/)[0]);
  if (!Number.isFinite(seconds)) throw new Error('Invalid /proc/uptime');
  return { seconds, bootedAt: new Date(now - seconds * 1000).toISOString() };
}
