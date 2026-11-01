import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { ZodType } from 'zod';
import type { AppDefinition } from '../Apps/Types';
import type { WidgetDefinition } from '../Widgets/Types';
import { Registry, type RegistryEntry } from './Registry';

/**
 * Every extension point of the desktop. Built-ins register from their own
 * folders (Apps/Registry.ts, Widgets/Registry.ts, …); catalog apps register
 * from their manifest. Consumers read from here, never from a fixed list.
 */

export interface TaskbarItemDefinition extends RegistryEntry {
  title: string;
  component: ComponentType<{ vertical: boolean }>;
}

export interface TrayItemDefinition extends RegistryEntry {
  title: string;
  icon: Icon;
  component: ComponentType<{ vertical: boolean }>;
  /** Shown until the owner hides it in Settings → Taskbar. */
  defaultVisible: boolean;
}

export interface StartupAnimationProps {
  /** Call when the animation has finished (or was skipped). */
  onDone: () => void;
  params: Record<string, unknown>;
  reducedMotion: boolean;
}

export interface StartupAnimationDefinition extends RegistryEntry {
  name: string;
  component: ComponentType<StartupAnimationProps>;
}

export type CursorState = 'default' | 'pointer' | 'text' | 'move' | 'resize' | 'busy';

export interface CursorSetDefinition extends RegistryEntry {
  name: string;
  /** Image URL (data:, blob: or same-origin) and hotspot per state; missing states use the system cursor. */
  cursors: Partial<Record<CursorState, { url: string; hotspotX: number; hotspotY: number }>>;
}

export interface ThemeDefinition extends RegistryEntry {
  name: string;
  /** Design-token overrides (`--color-accent`, …) per color scheme. */
  tokens: { light?: Record<string, string>; dark?: Record<string, string> };
}

export interface WallpaperDefinition extends RegistryEntry {
  name: string;
  url: string;
}

export interface ActionDefinition<P = Record<string, unknown>> extends RegistryEntry {
  title: string;
  icon?: Icon;
  /** Who provides the action (app id or "core"); shown in the command palette. */
  provider: string;
  params?: ZodType<P>;
  run: (params: P) => void | Promise<void>;
}

export const registries = {
  apps: new Registry<AppDefinition>('apps'),
  widgets: new Registry<WidgetDefinition>('widgets'),
  taskbarItems: new Registry<TaskbarItemDefinition>('taskbarItems'),
  trayItems: new Registry<TrayItemDefinition>('trayItems'),
  startupAnimations: new Registry<StartupAnimationDefinition>('startupAnimations'),
  cursorSets: new Registry<CursorSetDefinition>('cursorSets'),
  themes: new Registry<ThemeDefinition>('themes'),
  wallpapers: new Registry<WallpaperDefinition>('wallpapers'),
  actions: new Registry<ActionDefinition>('actions'),
};

export type Registries = typeof registries;
