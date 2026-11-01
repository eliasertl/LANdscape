import { Cpu } from '@phosphor-icons/react';
import { registerBuiltinApps } from '../Apps/Registry';
import { registerBuiltinWidgets } from '../Widgets/Registry';
import { CpuRamMeter } from '../Taskbar/Tray/CpuRamMeter';
import { registries } from './Registries';

/** Registers everything compiled into LANdscape. Runs once, before the first render. */
export function registerBuiltins(): void {
  registerBuiltinApps();
  registerBuiltinWidgets();
  registries.trayItems.register({ id: 'cpu-ram', title: 'CPU and memory', icon: Cpu, component: CpuRamMeter, defaultVisible: true, source: { kind: 'builtin' } });
}
