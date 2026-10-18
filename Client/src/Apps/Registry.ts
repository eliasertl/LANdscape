import { lazy } from 'react';
import { Cube, FileText, FolderOpen, GearSix, ListMagnifyingGlass, Pulse, TerminalWindow } from '@phosphor-icons/react';
import type { AppId } from '@landscape/shared';
import type { AppDefinition } from './Types';

/**
 * Built-in apps. Each entry points at a self-contained folder; adding or
 * removing an app is a change to this list and that folder only.
 */
export const APPS: AppDefinition[] = [
  {
    id: 'settings',
    name: 'Settings',
    description: 'Appearance, apps and integration status',
    icon: GearSix,
    color: '#8e8e93',
    component: lazy(() => import('./Settings/SettingsApp')),
    defaultSize: { width: 760, height: 560 },
    minSize: { width: 420, height: 360 },
    requires: null,
    single: true,
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'SSH shell on the host',
    icon: TerminalWindow,
    color: '#1c1c1e',
    component: lazy(() => import('./Terminal/TerminalApp')),
    defaultSize: { width: 900, height: 560 },
    minSize: { width: 360, height: 240 },
    requires: 'ssh',
    single: false,
  },
  {
    id: 'files',
    name: 'Files',
    description: 'Browse and manage files over SFTP',
    icon: FolderOpen,
    color: '#0a84ff',
    component: lazy(() => import('./Files/FilesApp')),
    defaultSize: { width: 980, height: 620 },
    minSize: { width: 420, height: 320 },
    requires: 'ssh',
    single: false,
  },
  {
    id: 'text-editor',
    name: 'Text Editor',
    description: 'Edit text files on the host',
    icon: FileText,
    color: '#ff9f0a',
    component: lazy(() => import('./TextEditor/TextEditorApp')),
    defaultSize: { width: 900, height: 620 },
    minSize: { width: 360, height: 240 },
    requires: 'ssh',
    single: false,
  },
  {
    id: 'docker',
    name: 'Docker',
    description: 'Containers, actions and logs',
    icon: Cube,
    color: '#2496ed',
    component: lazy(() => import('./Docker/DockerApp')),
    defaultSize: { width: 980, height: 620 },
    minSize: { width: 420, height: 320 },
    requires: 'docker',
    single: false,
  },
  {
    id: 'task-manager',
    name: 'Task Manager',
    description: 'Host processes',
    icon: Pulse,
    color: '#30d158',
    component: lazy(() => import('./TaskManager/TaskManagerApp')),
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 420, height: 320 },
    requires: null,
    single: true,
  },
  {
    id: 'log-viewer',
    name: 'Log Viewer',
    description: 'Docker, journal and file logs',
    icon: ListMagnifyingGlass,
    color: '#bf5af2',
    component: lazy(() => import('./LogViewer/LogViewerApp')),
    defaultSize: { width: 980, height: 620 },
    minSize: { width: 420, height: 320 },
    requires: null,
    single: false,
  },
];

const byId = new Map(APPS.map((app) => [app.id, app]));

export function getApp(id: string): AppDefinition | undefined {
  return byId.get(id as AppId);
}
