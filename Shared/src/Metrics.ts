import type { ProcessInfo } from './Types';

export const METRIC_NAMES = [
  'cpu',
  'memory',
  'disks',
  'network',
  'temperatures',
  'uptime',
  'dockerCount',
  'processes',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export function isMetricName(value: string): value is MetricName {
  return (METRIC_NAMES as readonly string[]).includes(value);
}

export interface CpuMetric {
  /** Total CPU usage in percent (0..100). */
  total: number;
  /** Per-core usage in percent. */
  cores: number[];
  loadAverage: [number, number, number] | null;
}

export interface MemoryMetric {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  swapTotalBytes: number;
  swapUsedBytes: number;
}

export interface DiskMetric {
  device: string;
  mountPoint: string;
  fsType: string;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
}

export interface DisksMetric {
  disks: DiskMetric[];
  /** Which path produced the usage numbers. */
  usageSource: 'hostRoot' | 'ssh' | 'none';
}

export interface NetworkInterfaceMetric {
  name: string;
  rxBytesPerSecond: number;
  txBytesPerSecond: number;
  rxBytesTotal: number;
  txBytesTotal: number;
  addresses: string[];
}

export interface NetworkMetric {
  interfaces: NetworkInterfaceMetric[];
}

export interface TemperatureMetric {
  sensor: string;
  label: string;
  celsius: number;
  max: number | null;
  critical: number | null;
}

export interface TemperaturesMetric {
  sensors: TemperatureMetric[];
}

export interface UptimeMetric {
  seconds: number;
  bootedAt: string;
}

export interface DockerCountMetric {
  running: number;
  total: number;
}

export interface ProcessesMetric {
  processes: ProcessInfo[];
  cpuCount: number;
}

export interface MetricPayloads {
  cpu: CpuMetric;
  memory: MemoryMetric;
  disks: DisksMetric;
  network: NetworkMetric;
  temperatures: TemperaturesMetric;
  uptime: UptimeMetric;
  dockerCount: DockerCountMetric;
  processes: ProcessesMetric;
}
