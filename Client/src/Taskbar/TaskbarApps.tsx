import { createElement, useMemo, useRef } from 'react';
import { PushPin, PushPinSlash, XCircle } from '@phosphor-icons/react';
import type { Settings } from '@landscape/shared';
import { useWindowStore, type DesktopWindow } from '../Store/WindowStore';
import { useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import type { MenuItem } from '../Components/Menu';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import { WindowIcon } from '../Windows/WindowIcon';
import { AppTile } from '../Desktop/AppTile';
import { PlaceholderIcon } from '../Desktop/PlaceholderIcon';
import { shortcutIconUrl } from '../Store/DesktopStore';
import { openApp, openShortcut } from '../Desktop/Launch';
import { registries } from '../Platform/Registries';
import { useRegistry } from '../Platform/Registry';
import { usePointerDrag } from '../Hooks/UsePointerDrag';
import { useDockMagnify } from './UseDockMagnify';
import styles from './TaskbarApps.module.css';

interface Group {
  appKey: string;
  windows: DesktopWindow[];
  top: DesktopWindow;
}

interface Item {
  appKey: string;
  pinned: boolean;
  group: Group | null;
}

interface TaskbarAppsProps {
  settings: Settings['taskbar'];
  vertical: boolean;
  preview: boolean;
}

/** Pins a key or removes it; the order of the rest is kept. */
export function togglePin(appKey: string): void {
  const desktop = useDesktopStore.getState();
  const pinned = desktop.settings?.taskbar.pinned ?? [];
  const next = pinned.includes(appKey) ? pinned.filter((k) => k !== appKey) : [...pinned, appKey];
  void desktop.updateSettings({ taskbar: { pinned: next } }).catch((error: unknown) => toast.error(errorMessage(error)));
}

export function isPinned(appKey: string): boolean {
  return (useDesktopStore.getState().settings?.taskbar.pinned ?? []).includes(appKey);
}

/** Pinned apps and shortcuts, then the other open windows grouped per app; a pinned item shows its running state. */
export function TaskbarApps({ settings, vertical, preview }: TaskbarAppsProps) {
  const windows = useWindowStore((s) => s.windows);
  const focusedId = useWindowStore((s) => s.focusedId);
  const toggleGroup = useWindowStore((s) => s.toggleGroup);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const shortcuts = useDesktopStore((s) => s.shortcuts);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const apps = useRegistry(registries.apps);
  const containerRef = useRef<HTMLDivElement>(null);
  useDockMagnify(containerRef, settings.style === 'dock' && !preview, vertical);

  const items = useMemo(() => {
    const groups = new Map<string, Group>();
    for (const w of windows) {
      if (w.closing) continue;
      const group = groups.get(w.appKey);
      if (!group) groups.set(w.appKey, { appKey: w.appKey, windows: [w], top: w });
      else {
        group.windows.push(w);
        if (w.z > group.top.z) group.top = w;
      }
    }
    const result: Item[] = [];
    for (const appKey of settings.pinned) {
      // Pins of deleted shortcuts or unknown apps are skipped (and cleaned up on the next unpin).
      const [kind, id] = appKey.split(':');
      const exists = kind === 'app' ? apps.some((a) => a.id === id) : shortcuts.some((s) => s.id === id);
      if (!exists) continue;
      result.push({ appKey, pinned: true, group: groups.get(appKey) ?? null });
      groups.delete(appKey);
    }
    const running = [...groups.values()].sort((a, b) => Math.min(...a.windows.map((w) => w.createdAt)) - Math.min(...b.windows.map((w) => w.createdAt)));
    for (const group of running) result.push({ appKey: group.appKey, pinned: false, group });
    return result;
  }, [windows, settings.pinned, apps, shortcuts]);

  if (items.length === 0) {
    return <div className={styles.empty}>{vertical ? '' : 'No open windows'}</div>;
  }

  const launch = (appKey: string) => {
    const [kind, id] = appKey.split(':');
    if (kind === 'app' && id) openApp(id);
    else {
      const shortcut = shortcuts.find((s) => s.id === id);
      if (shortcut) openShortcut(shortcut);
    }
  };

  const menuFor = (item: Item): MenuItem[] => {
    const store = useWindowStore.getState();
    const entries: MenuItem[] = [];
    if (item.group) {
      for (const w of item.group.windows) {
        entries.push({
          label: w.title + (w.minimized ? ' (minimized)' : ''),
          checked: w.id === focusedId && !w.minimized,
          onSelect: () => {
            if (w.minimized) store.restore(w.id);
            else store.focus(w.id);
          },
        });
      }
      entries.push({ type: 'separator' });
    }
    entries.push({ label: item.pinned ? 'Unpin from taskbar' : 'Pin to taskbar', icon: createElement(item.pinned ? PushPinSlash : PushPin), onSelect: () => togglePin(item.appKey) });
    if (item.group) {
      const group = item.group;
      entries.push({ type: 'separator' });
      entries.push({ label: group.windows.length > 1 ? 'Close all' : 'Close', icon: createElement(XCircle), danger: true, onSelect: () => void store.closeAll(group.appKey) });
    }
    return entries;
  };

  const reorder = (from: string, to: string) => {
    const pinned = [...settings.pinned];
    const a = pinned.indexOf(from);
    const b = pinned.indexOf(to);
    if (a < 0 || b < 0 || a === b) return;
    pinned.splice(a, 1);
    pinned.splice(b, 0, from);
    void updateSettings({ taskbar: { pinned } }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const showTitles = settings.showTitles && (settings.style === 'win10' || settings.style === 'win11') && !vertical;

  return (
    <div ref={containerRef} className={`${styles.apps} ${vertical ? styles.vertical : ''} ${settings.style === 'dock' ? styles.dock : ''}`} role="group" aria-label="Open windows">
      {items.map((item) => (
        <TaskbarItem
          key={item.appKey}
          item={item}
          focusedId={focusedId}
          showTitle={showTitles}
          vertical={vertical}
          preview={preview}
          onActivate={() => (item.group ? toggleGroup(item.appKey) : launch(item.appKey))}
          onContextMenu={(x, y) => openContextMenu(menuFor(item), { x, y })}
          onReorder={reorder}
          icon={<ItemIcon item={item} shortcuts={shortcuts} />}
        />
      ))}
    </div>
  );
}

function ItemIcon({ item, shortcuts }: { item: Item; shortcuts: ReturnType<typeof useDesktopStore.getState>['shortcuts'] }) {
  if (item.group) return <WindowIcon win={item.group.top} size={30} />;
  const [kind, id] = item.appKey.split(':');
  if (kind === 'app') {
    const app = registries.apps.get(id ?? '');
    return app ? <AppTile app={app} size={30} /> : null;
  }
  const shortcut = shortcuts.find((s) => s.id === id);
  if (!shortcut) return null;
  const url = shortcutIconUrl(shortcut);
  return url ? <img src={url} width={30} height={30} alt="" style={{ borderRadius: 7, objectFit: 'cover' }} draggable={false} /> : <PlaceholderIcon name={shortcut.name} size={30} />;
}

interface TaskbarItemProps {
  item: Item;
  focusedId: string | null;
  showTitle: boolean;
  vertical: boolean;
  preview: boolean;
  icon: React.ReactNode;
  onActivate: () => void;
  onContextMenu: (x: number, y: number) => void;
  onReorder: (from: string, to: string) => void;
}

function TaskbarItem({ item, focusedId, showTitle, vertical, preview, icon, onActivate, onContextMenu, onReorder }: TaskbarItemProps) {
  const draggedRef = useRef(false);
  const active = Boolean(item.group?.windows.some((w) => w.id === focusedId && !w.minimized));
  const allMinimized = Boolean(item.group && item.group.windows.every((w) => w.minimized));
  const title = item.group?.top.title ?? labelFor(item.appKey);
  const count = item.group?.windows.length ?? 0;

  // Pinned items can be dragged along the bar to reorder them.
  const onPointerDown = usePointerDrag({
    disabled: !item.pinned || preview,
    threshold: 6,
    onStart: () => {
      draggedRef.current = true;
    },
    onMove: ({ clientX, clientY }) => {
      const over = document.elementsFromPoint(clientX, clientY).find((el) => el instanceof HTMLElement && el.dataset.taskbarApp && el.dataset.taskbarApp !== item.appKey && el.dataset.pinned === 'true') as HTMLElement | undefined;
      if (over?.dataset.taskbarApp) onReorder(item.appKey, over.dataset.taskbarApp);
    },
    onEnd: () => {
      window.setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    },
  });

  return (
    <button
      type="button"
      className={[styles.app, active ? styles.active : '', allMinimized ? styles.minimized : '', showTitle ? styles.withTitle : ''].join(' ')}
      data-taskbar-app={item.appKey}
      data-pinned={item.pinned ? 'true' : 'false'}
      data-running={item.group ? 'true' : 'false'}
      title={title}
      aria-label={item.group ? `${title}, ${count} window${count === 1 ? '' : 's'}` : `${title} (pinned)`}
      aria-pressed={item.group ? active : undefined}
      onPointerDown={onPointerDown}
      onClick={() => {
        if (!draggedRef.current) onActivate();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, vertical ? e.clientY : e.clientY - 8);
      }}
    >
      <span className={styles.iconWrap}>{icon}</span>
      {showTitle && item.group && <span className={`${styles.title} text-truncate`}>{title}</span>}
      {count > 1 && <span className={styles.badge}>{count}</span>}
      {item.group && <span className={styles.dot} aria-hidden="true" />}
    </button>
  );
}

function labelFor(appKey: string): string {
  const [kind, id] = appKey.split(':');
  if (kind === 'app') return registries.apps.get(id ?? '')?.name ?? id ?? '';
  return useDesktopStore.getState().shortcuts.find((s) => s.id === id)?.name ?? '';
}
