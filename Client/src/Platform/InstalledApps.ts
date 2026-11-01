import { createElement, lazy, type ComponentType } from 'react';
import { Lightning, Package } from '@phosphor-icons/react';
import { z } from 'zod';
import type { InstalledApp } from '@landscape/shared';
import { api } from '../Api/Http';
import { registries } from './Registries';
import { registerAction } from './Actions';
import { isSafeMode } from './SafeMode';
import { useWindowStore } from '../Store/WindowStore';
import { eventsSocket } from '../Api/EventsSocket';
import type { AppDefinition } from '../Apps/Types';
import type { WidgetDefinition } from '../Widgets/Types';
import { runFrameAction } from './AppBroker';
import { backgroundFrames } from '../Apps/AppBackgrounds';

/**
 * Registers every installed catalog app into the registries, exactly like
 * built-ins: windows become apps, widgets, tray/taskbar items, startup
 * animations, cursor sets, themes, wallpapers and actions. Skipped in safe
 * mode. Re-run on `apps-changed` events (install, update, uninstall).
 */
const installed = new Map<string, InstalledApp>();

export function installedApps(): InstalledApp[] {
  return [...installed.values()];
}

export function installedApp(id: string): InstalledApp | undefined {
  return installed.get(id);
}

const AppWindow = lazy(() => import('../Apps/AppWindow'));
const AppWidget = lazy(() => import('../Widgets/AppWidget'));

function iconComponent(app: InstalledApp): ComponentType<{ size?: number; weight?: string }> {
  if (!app.manifest.icon) return Package as unknown as ComponentType<{ size?: number }>;
  const url = `/apps/files/${app.id}/${app.manifest.icon}`;
  const Icon = ({ size = 24 }: { size?: number }) => createElement('img', { src: url, width: size, height: size, alt: '', style: { borderRadius: Math.round(size * 0.22), objectFit: 'cover' } });
  return Icon;
}

function unregisterApp(id: string): void {
  for (const registry of Object.values(registries)) registry.unregisterApp(id);
  backgroundFrames.stop(id);
}

function registerApp(app: InstalledApp): void {
  unregisterApp(app.id);
  const source = { kind: 'app' as const, appId: app.id };
  const c = app.manifest.contributes;
  const Icon = iconComponent(app);
  // The first window is "the app" in the launcher; further windows open through actions or the SDK.
  const main = c.windows[0];
  if (main) {
    const definition: AppDefinition = {
      id: app.id,
      source,
      name: app.manifest.name,
      description: app.manifest.description || `${app.manifest.author} · v${app.version}`,
      icon: Icon as AppDefinition['icon'],
      iconUrl: app.manifest.icon ? `/apps/files/${app.id}/${app.manifest.icon}` : null,
      color: '#5e5ce6',
      component: AppWindow as unknown as AppDefinition['component'],
      defaultSize: main.defaultSize,
      minSize: main.minSize ?? { width: 320, height: 200 },
      requires: null,
      single: main.single,
    };
    registries.apps.register(definition);
  }
  for (const widget of c.widgets) {
    const definition: WidgetDefinition = {
      id: `${app.id}/${widget.id}`,
      source,
      name: widget.name,
      description: widget.description || app.manifest.name,
      icon: Icon as WidgetDefinition['icon'],
      component: AppWidget as unknown as WidgetDefinition['component'],
      metric: null,
      sizes: widget.sizes,
      defaultIntervalMs: widget.defaultIntervalMs,
      settingsFields: widget.settingsFields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options, defaultValue: f.defaultValue })),
    };
    registries.widgets.register(definition);
  }
  for (const item of c.trayItems) {
    registries.trayItems.register({
      id: `${app.id}/${item.id}`,
      source,
      title: `${item.title} (${app.manifest.name})`,
      icon: Icon as never,
      defaultVisible: item.defaultVisible,
      component: ({ vertical }: { vertical: boolean }) => createElement(lazyTray, { app, surfaceId: item.id, vertical }),
    });
  }
  for (const animation of c.startupAnimations) {
    registries.startupAnimations.register({
      id: `${app.id}/${animation.id}`,
      source,
      name: `${animation.name} (${app.manifest.name})`,
      component: (props) => createElement(lazyStartup, { app, surfaceId: animation.id, ...props }),
    });
  }
  for (const set of c.cursorSets) {
    const cursors: Record<string, { url: string; hotspotX: number; hotspotY: number }> = {};
    for (const [state, cursor] of Object.entries(set.cursors)) if (cursor) cursors[state] = { url: `/apps/files/${app.id}/${cursor.file}`, hotspotX: cursor.hotspotX, hotspotY: cursor.hotspotY };
    registries.cursorSets.register({ id: `${app.id}/${set.id}`, source, name: `${set.name} (${app.manifest.name})`, cursors });
  }
  for (const theme of c.themes) {
    registries.themes.register({ id: `${app.id}/${theme.id}`, source, name: `${theme.name} (${app.manifest.name})`, tokens: theme.tokens, accent: theme.accent });
  }
  for (const wallpaper of c.wallpapers) {
    registries.wallpapers.register({ id: `${app.id}/${wallpaper.id}`, source, name: `${wallpaper.name} (${app.manifest.name})`, url: `/apps/files/${app.id}/${wallpaper.file}` });
  }
  for (const action of c.actions) {
    const shape: Record<string, z.ZodString> = {};
    for (const param of action.params) shape[param.key] = z.string().max(4096);
    registerAction({
      id: `${app.id}.${action.id}`,
      source,
      title: action.title,
      description: action.description ?? app.manifest.name,
      icon: Lightning,
      provider: app.id,
      params: action.params.length > 0 ? z.object(shape) : undefined,
      fields: action.params.map((param) => ({ key: param.key, label: param.label, placeholder: param.placeholder })),
      async run(params) {
        // Delivered to the background page when the app has one, else to its open window, else a window is opened with the params.
        const background = c.background ? await backgroundFrames.ensure(app) : null;
        if (background) {
          await runFrameAction(background, action.id, params);
          return;
        }
        const openWindow = useWindowStore.getState().windows.find((w) => w.appKey === `app:${app.id}` && !w.closing);
        const target = openWindow ? windowFrames.get(openWindow.id) : null;
        if (target) {
          await runFrameAction(target, action.id, params);
          return;
        }
        if (!main) throw new Error(`${app.manifest.name} has no window to run "${action.title}"`);
        useWindowStore.getState().open({ kind: 'app', appId: app.id, title: app.manifest.name, params: { action: action.id, ...params }, defaultSize: main.defaultSize, single: main.single });
      },
    });
  }
}

/** Frame windows of open app windows (AppWindow registers them), for delivering actions. */
export const windowFrames = new Map<string, Window>();

const lazyTray = lazy(() => import('../Taskbar/Tray/AppTrayItem'));
const lazyStartup = lazy(() => import('../Startup/AppStartupAnimation'));

/** Fetches the installed apps and registers them; subscribes to changes. Returns the stop function. */
export async function loadInstalledApps(): Promise<void> {
  if (isSafeMode()) return;
  const result = await api.get<{ apps: InstalledApp[] }>('/api/apps').catch(() => ({ apps: [] as InstalledApp[] }));
  const seen = new Set<string>();
  for (const app of result.apps) {
    installed.set(app.id, app);
    seen.add(app.id);
    registerApp(app);
  }
  for (const id of [...installed.keys()]) {
    if (!seen.has(id)) {
      installed.delete(id);
      unregisterApp(id);
    }
  }
}

export function watchInstalledApps(): () => void {
  if (isSafeMode()) return () => undefined;
  return eventsSocket.subscribe((message) => {
    if (message.type === 'apps-changed') void loadInstalledApps();
  });
}
