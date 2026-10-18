import { createElement, useMemo } from 'react';
import { XCircle } from '@phosphor-icons/react';
import { useWindowStore, type DesktopWindow } from '../Store/WindowStore';
import { useUiStore } from '../Store/UiStore';
import type { MenuItem } from '../Components/Menu';
import { WindowIcon } from '../Windows/WindowIcon';
import styles from './TaskbarApps.module.css';

interface Group {
  appKey: string;
  windows: DesktopWindow[];
  top: DesktopWindow;
}

/** Open windows grouped per app, with a count badge and a per-group menu. */
export function TaskbarApps() {
  const windows = useWindowStore((s) => s.windows);
  const focusedId = useWindowStore((s) => s.focusedId);
  const toggleGroup = useWindowStore((s) => s.toggleGroup);
  const openContextMenu = useUiStore((s) => s.openContextMenu);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const w of windows) {
      if (w.closing) continue;
      const group = map.get(w.appKey);
      if (!group) map.set(w.appKey, { appKey: w.appKey, windows: [w], top: w });
      else {
        group.windows.push(w);
        if (w.z > group.top.z) group.top = w;
      }
    }
    return [...map.values()].sort((a, b) => Math.min(...a.windows.map((w) => w.createdAt)) - Math.min(...b.windows.map((w) => w.createdAt)));
  }, [windows]);

  if (groups.length === 0) {
    return <div className={styles.empty}>No open windows</div>;
  }

  const menuFor = (group: Group): MenuItem[] => {
    const store = useWindowStore.getState();
    const items: MenuItem[] = group.windows.map((w) => ({
      label: w.title + (w.minimized ? ' (minimized)' : ''),
      checked: w.id === focusedId && !w.minimized,
      onSelect: () => {
        if (w.minimized) store.restore(w.id);
        else store.focus(w.id);
      },
    }));
    items.push({ type: 'separator' });
    items.push({ label: group.windows.length > 1 ? 'Close all' : 'Close', icon: createElement(XCircle), danger: true, onSelect: () => void store.closeAll(group.appKey) });
    return items;
  };

  return (
    <div className={styles.apps} role="group" aria-label="Open windows">
      {groups.map((group) => {
        const active = group.windows.some((w) => w.id === focusedId && !w.minimized);
        const allMinimized = group.windows.every((w) => w.minimized);
        return (
          <button
            key={group.appKey}
            type="button"
            className={[styles.app, active ? styles.active : '', allMinimized ? styles.minimized : ''].join(' ')}
            data-taskbar-app={group.appKey}
            title={group.top.title}
            aria-label={`${group.top.title}, ${group.windows.length} window${group.windows.length === 1 ? '' : 's'}`}
            aria-pressed={active}
            onClick={() => toggleGroup(group.appKey)}
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(menuFor(group), { x: e.clientX, y: e.clientY - 8 });
            }}
          >
            <WindowIcon win={group.top} size={30} />
            {group.windows.length > 1 && <span className={styles.badge}>{group.windows.length}</span>}
            <span className={styles.dot} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
