import { z } from 'zod';
import { ArrowsClockwise, Bell, Cube, FileText, FolderOpen, GearSix, LockKey, Moon, Play, Plus, SquareHalf, Stop } from '@phosphor-icons/react';
import type { ContainerInfo } from '@landscape/shared';
import { api } from '../Api/Http';
import { registerAction } from './Actions';
import { openApp } from '../Desktop/Launch';
import { useDesktopStore } from '../Store/DesktopStore';
import { useWindowStore } from '../Store/WindowStore';
import { useSessionStore } from '../Store/SessionStore';
import { useUiStore } from '../Store/UiStore';
import { useNotificationStore } from '../Store/NotificationStore';
import { shortcutPrefillForContainer } from '../Apps/Docker/ContainerShortcut';
import { toast } from '../Components/Toast';

const containerChoices = async () => {
  const containers = await api.get<ContainerInfo[]>('/api/docker/containers');
  return containers.map((c) => ({ value: c.id, label: c.name, detail: `${c.state} · ${c.image}` }));
};
const containerParam = z.object({ containerId: z.string().min(1) });
const pathParam = z.object({ path: z.string().min(1) });

/** The actions LANdscape itself provides. Apps add theirs through the SDK the same way. */
export function registerCoreActions(): void {
  for (const [verb, icon, label] of [
    ['start', Play, 'Start'],
    ['stop', Stop, 'Stop'],
    ['restart', ArrowsClockwise, 'Restart'],
  ] as const) {
    registerAction({
      id: `docker.${verb}`,
      title: `${label} container`,
      description: `${label}s a Docker container`,
      icon,
      provider: 'core',
      params: containerParam,
      fields: [{ key: 'containerId', label: 'Container', choices: containerChoices }],
      async run({ containerId }) {
        await api.post(`/api/docker/containers/${encodeURIComponent(containerId)}/${verb}`);
        toast.success(`Container ${verb === 'stop' ? 'stopped' : verb === 'start' ? 'started' : 'restarted'}.`);
      },
    });
  }
  registerAction({
    id: 'docker.add-shortcut',
    title: 'Add container as shortcut',
    description: 'Opens the shortcut dialog prefilled from a container with published ports',
    icon: Plus,
    provider: 'core',
    params: containerParam,
    fields: [{ key: 'containerId', label: 'Container', choices: containerChoices }],
    async run({ containerId }) {
      const containers = await api.get<ContainerInfo[]>('/api/docker/containers');
      const container = containers.find((c) => c.id === containerId || c.name === containerId);
      if (!container) throw new Error('Container not found');
      const prefill = shortcutPrefillForContainer(container);
      if (!prefill) throw new Error(`${container.name} publishes no TCP ports`);
      useUiStore.getState().openShortcutDialog({ mode: 'create', prefill });
    },
  });
  registerAction({
    id: 'files.open',
    title: 'Open path in Files',
    icon: FolderOpen,
    provider: 'core',
    params: pathParam,
    fields: [{ key: 'path', label: 'Path', placeholder: '/var/log' }],
    run({ path }) {
      openApp('files', { path });
    },
  });
  registerAction({
    id: 'text-editor.open',
    title: 'Open file in Text Editor',
    icon: FileText,
    provider: 'core',
    params: pathParam,
    fields: [{ key: 'path', label: 'File', placeholder: '/etc/hosts' }],
    run({ path }) {
      openApp('text-editor', { path });
    },
  });
  registerAction({
    id: 'theme.toggle',
    title: 'Toggle light / dark theme',
    icon: Moon,
    provider: 'core',
    run() {
      const desktop = useDesktopStore.getState();
      const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      void desktop.updateSettings({ theme: current === 'dark' ? 'light' : 'dark' });
    },
  });
  registerAction({ id: 'session.lock', title: 'Lock', icon: LockKey, provider: 'core', run: () => void useSessionStore.getState().lock() });
  registerAction({
    id: 'window.snap-left',
    title: 'Snap window to the left half',
    icon: SquareHalf,
    provider: 'core',
    run() {
      const windows = useWindowStore.getState();
      if (windows.focusedId) windows.snapKeyboard(windows.focusedId, 'left');
    },
  });
  registerAction({
    id: 'window.snap-right',
    title: 'Snap window to the right half',
    icon: SquareHalf,
    provider: 'core',
    run() {
      const windows = useWindowStore.getState();
      if (windows.focusedId) windows.snapKeyboard(windows.focusedId, 'right');
    },
  });
  registerAction({ id: 'settings.open', title: 'Open Settings', icon: GearSix, provider: 'core', run: () => void openApp('settings') });
  registerAction({ id: 'docker.open', title: 'Open Docker', icon: Cube, provider: 'core', hidden: true, run: () => void openApp('docker') });
  registerAction({ id: 'notifications.toggle', title: 'Open the notification center', icon: Bell, provider: 'core', run: () => useNotificationStore.getState().toggle() });
}
