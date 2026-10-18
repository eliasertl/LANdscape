import { Clock, Cpu, Cube, HardDrives, Memory, Network, Thermometer, Timer } from '@phosphor-icons/react';
import type { WidgetType } from '@landscape/shared';
import type { WidgetDefinition } from './Types';
import { ClockWidget } from './Clock/ClockWidget';
import { CpuWidget } from './Cpu/CpuWidget';
import { RamWidget } from './Ram/RamWidget';
import { DiskWidget } from './Disk/DiskWidget';
import { NetworkWidget } from './Network/NetworkWidget';
import { TemperatureWidget } from './Temperature/TemperatureWidget';
import { UptimeWidget } from './Uptime/UptimeWidget';
import { DockerCountWidget } from './DockerCount/DockerCountWidget';

/** Widget catalogue. Each widget is a self-contained folder; add or remove entries here. */
export const WIDGETS: WidgetDefinition[] = [
  {
    type: 'clock',
    name: 'Clock',
    description: 'Time and date',
    icon: Clock,
    component: ClockWidget,
    metric: null,
    size: { width: 220, height: 120 },
    settingsFields: [{ key: 'showSeconds', label: 'Show seconds', type: 'toggle', defaultValue: false }],
  },
  {
    type: 'cpu',
    name: 'CPU',
    description: 'Total usage with history and per-core bars',
    icon: Cpu,
    component: CpuWidget,
    metric: 'cpu',
    size: { width: 240, height: 150 },
    settingsFields: [{ key: 'showCores', label: 'Show per-core bars', type: 'toggle', defaultValue: true }],
  },
  {
    type: 'ram',
    name: 'Memory',
    description: 'RAM and swap usage',
    icon: Memory,
    component: RamWidget,
    metric: 'memory',
    size: { width: 240, height: 136 },
    settingsFields: [{ key: 'showSwap', label: 'Show swap', type: 'toggle', defaultValue: true }],
  },
  {
    type: 'disk',
    name: 'Disks',
    description: 'Usage per mounted drive',
    icon: HardDrives,
    component: DiskWidget,
    metric: 'disks',
    size: { width: 260, height: 160 },
  },
  {
    type: 'network',
    name: 'Network',
    description: 'Throughput and IP addresses',
    icon: Network,
    component: NetworkWidget,
    metric: 'network',
    size: { width: 260, height: 150 },
    settingsFields: [
      { key: 'interface', label: 'Interface', type: 'select', options: [{ value: 'all', label: 'All interfaces' }], defaultValue: 'all' },
      { key: 'showAddresses', label: 'Show IP addresses', type: 'toggle', defaultValue: true },
    ],
  },
  {
    type: 'temperature',
    name: 'Temperatures',
    description: 'Sensors from hwmon and thermal zones',
    icon: Thermometer,
    component: TemperatureWidget,
    metric: 'temperatures',
    size: { width: 240, height: 160 },
  },
  {
    type: 'uptime',
    name: 'Uptime',
    description: 'Time since boot',
    icon: Timer,
    component: UptimeWidget,
    metric: 'uptime',
    size: { width: 220, height: 100 },
  },
  {
    type: 'docker-count',
    name: 'Docker containers',
    description: 'Running and total containers',
    icon: Cube,
    component: DockerCountWidget,
    metric: 'dockerCount',
    size: { width: 200, height: 100 },
  },
];

const byType = new Map(WIDGETS.map((w) => [w.type, w]));

export function getWidget(type: WidgetType): WidgetDefinition | undefined {
  return byType.get(type);
}
