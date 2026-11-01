import { Clock, Cpu, Cube, HardDrives, Memory, Network, Thermometer, Timer } from '@phosphor-icons/react';
import type { WidgetDefinition } from './Types';
import { registries } from '../Platform/Registries';
import { ClockWidget } from './Clock/ClockWidget';
import { CpuWidget } from './Cpu/CpuWidget';
import { RamWidget } from './Ram/RamWidget';
import { DiskWidget } from './Disk/DiskWidget';
import { NetworkWidget, networkInterfaceOptions } from './Network/NetworkWidget';
import { TemperatureWidget } from './Temperature/TemperatureWidget';
import { UptimeWidget } from './Uptime/UptimeWidget';
import { DockerCountWidget } from './DockerCount/DockerCountWidget';

/** Built-in widgets. Each is a self-contained folder; add or remove entries here. Everything else reads `registries.widgets`. */
const BUILTIN_WIDGETS: WidgetDefinition[] = [
  {
    id: 'clock',
    defaultIntervalMs: 1000,
    name: 'Clock',
    description: 'Time and date',
    icon: Clock,
    component: ClockWidget,
    metric: null,
    size: { cols: 2, rows: 1 },
    settingsFields: [{ key: 'showSeconds', label: 'Show seconds', type: 'toggle', defaultValue: false }],
  },
  {
    id: 'cpu',
    defaultIntervalMs: 2000,
    name: 'CPU',
    description: 'Total usage with history and per-core bars',
    icon: Cpu,
    component: CpuWidget,
    metric: 'cpu',
    size: { cols: 3, rows: 2 },
    settingsFields: [{ key: 'showCores', label: 'Show per-core bars', type: 'toggle', defaultValue: true }],
  },
  {
    id: 'ram',
    defaultIntervalMs: 5000,
    name: 'Memory',
    description: 'RAM and swap usage',
    icon: Memory,
    component: RamWidget,
    metric: 'memory',
    size: { cols: 2, rows: 1 },
    settingsFields: [{ key: 'showSwap', label: 'Show swap', type: 'toggle', defaultValue: true }],
  },
  {
    id: 'disk',
    defaultIntervalMs: 30000,
    name: 'Disks',
    description: 'Usage per mounted drive',
    icon: HardDrives,
    component: DiskWidget,
    metric: 'disks',
    size: { cols: 3, rows: 2 },
  },
  {
    id: 'network',
    defaultIntervalMs: 2000,
    name: 'Network',
    description: 'Throughput and IP addresses',
    icon: Network,
    component: NetworkWidget,
    metric: 'network',
    size: { cols: 3, rows: 2 },
    settingsFields: [
      { key: 'interface', label: 'Interface', type: 'select', options: networkInterfaceOptions, defaultValue: 'all' },
      { key: 'showAddresses', label: 'Show IP addresses', type: 'toggle', defaultValue: true },
    ],
  },
  {
    id: 'temperature',
    defaultIntervalMs: 5000,
    name: 'Temperatures',
    description: 'Sensors from hwmon and thermal zones',
    icon: Thermometer,
    component: TemperatureWidget,
    metric: 'temperatures',
    size: { cols: 2, rows: 2 },
  },
  {
    id: 'uptime',
    defaultIntervalMs: 60000,
    name: 'Uptime',
    description: 'Time since boot',
    icon: Timer,
    component: UptimeWidget,
    metric: 'uptime',
    size: { cols: 2, rows: 1 },
  },
  {
    id: 'docker-count',
    defaultIntervalMs: 10000,
    name: 'Docker containers',
    description: 'Running and total containers',
    icon: Cube,
    component: DockerCountWidget,
    metric: 'dockerCount',
    size: { cols: 2, rows: 1 },
  },
];

export function registerBuiltinWidgets(): void {
  for (const widget of BUILTIN_WIDGETS) registries.widgets.register({ ...widget, source: { kind: 'builtin' } });
}

export function getWidget(type: string): WidgetDefinition | undefined {
  return registries.widgets.get(type);
}
