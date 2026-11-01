import { Cpu } from '@phosphor-icons/react';
import { BootLogPreset, LogoFadePreset, ParticlesPreset, ProgressPreset, ZoomPreset } from '../Startup/Presets';
import { BUILTIN_CURSOR_SETS } from '../Cursor/CursorSets';
import { registerBuiltinApps } from '../Apps/Registry';
import { registerBuiltinWidgets } from '../Widgets/Registry';
import { CpuRamMeter } from '../Taskbar/Tray/CpuRamMeter';
import { NotificationBell } from '../Taskbar/Tray/NotificationBell';
import { ServiceHealth } from '../Taskbar/Tray/ServiceHealth';
import { Bell, Heartbeat } from '@phosphor-icons/react';
import { registerCoreActions } from './CoreActions';
import { registries } from './Registries';

/** Registers everything compiled into LANdscape. Runs once, before the first render. */
export function registerBuiltins(): void {
  registerBuiltinApps();
  registerBuiltinWidgets();
  registries.trayItems.register({ id: 'notifications', title: 'Notifications', icon: Bell, component: NotificationBell, defaultVisible: true, source: { kind: 'builtin' } });
  registries.trayItems.register({ id: 'service-health', title: 'Service health', icon: Heartbeat, component: ServiceHealth, defaultVisible: true, source: { kind: 'builtin' } });
  registries.trayItems.register({ id: 'cpu-ram', title: 'CPU and memory', icon: Cpu, component: CpuRamMeter, defaultVisible: true, source: { kind: 'builtin' } });
  registerCoreActions();
  for (const [id, name, component] of [
    ['logo-fade', 'Logo fade', LogoFadePreset],
    ['boot-log', 'Boot log', BootLogPreset],
    ['particles', 'Particle burst', ParticlesPreset],
    ['zoom', 'Wallpaper zoom', ZoomPreset],
    ['progress', 'Progress line', ProgressPreset],
  ] as const) {
    registries.startupAnimations.register({ id, name, component, source: { kind: 'builtin' } });
  }
  for (const set of BUILTIN_CURSOR_SETS) registries.cursorSets.register(set);
}
