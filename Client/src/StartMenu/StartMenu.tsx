import { useEffect, useMemo, useRef, useState } from 'react';
import { GearSix, MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import type { Shortcut } from '@landscape/shared';
import { APPS } from '../Apps/Registry';
import type { AppDefinition } from '../Apps/Types';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { AppTile } from '../Desktop/AppTile';
import { PlaceholderIcon } from '../Desktop/PlaceholderIcon';
import { openApp, openShortcut } from '../Desktop/Launch';
import { SPRING } from '../Design/Spring';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import styles from './StartMenu.module.css';

export type LauncherEntry = { kind: 'app'; app: AppDefinition } | { kind: 'shortcut'; shortcut: Shortcut };

export function useLauncherEntries(query: string): LauncherEntry[] {
  const shortcuts = useDesktopStore((s) => s.shortcuts);
  const settings = useDesktopStore((s) => s.settings);
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    const apps: LauncherEntry[] = APPS.filter((app) => settings?.enabledApps[app.id] !== false).map((app) => ({ kind: 'app', app }));
    const links: LauncherEntry[] = shortcuts.map((shortcut) => ({ kind: 'shortcut', shortcut }));
    const all = [...links, ...apps];
    if (!q) return all;
    const score = (entry: LauncherEntry) => {
      const name = (entry.kind === 'app' ? entry.app.name : entry.shortcut.name).toLowerCase();
      const extra = (entry.kind === 'app' ? entry.app.description : entry.shortcut.url).toLowerCase();
      if (name.startsWith(q)) return 3;
      if (name.includes(q)) return 2;
      if (extra.includes(q)) return 1;
      return 0;
    };
    return all
      .map((entry) => ({ entry, score: score(entry) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.entry);
  }, [query, shortcuts, settings]);
}

export function entryKey(entry: LauncherEntry): string {
  return entry.kind === 'app' ? `app:${entry.app.id}` : `shortcut:${entry.shortcut.id}`;
}

export function launchEntry(entry: LauncherEntry): void {
  if (entry.kind === 'app') openApp(entry.app.id);
  else openShortcut(entry.shortcut);
}

export function EntryIcon({ entry, size }: { entry: LauncherEntry; size: number }) {
  if (entry.kind === 'app') return <AppTile app={entry.app} size={size} />;
  const url = shortcutIconUrl(entry.shortcut);
  if (url) return <img src={url} width={size} height={size} alt="" style={{ borderRadius: Math.round(size * 0.22), objectFit: 'cover', background: '#fff' }} draggable={false} />;
  return <PlaceholderIcon name={entry.shortcut.name} size={size} />;
}

/** Search bar + launcher panel that expands from the taskbar's search icon. */
export function StartMenu({ onLogout }: { onLogout: () => void }) {
  const open = useUiStore((s) => s.startMenuOpen);
  const setOpen = useUiStore((s) => s.setStartMenuOpen);
  if (!open) return null;
  return <StartMenuPanel onClose={() => setOpen(false)} onLogout={onLogout} />;
}

function StartMenuPanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const entries = useLauncherEntries(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scale = useSpringValue(0.96, SPRING.quick, 0.001);
  const opacity = useSpringValue(0, SPRING.quick, 0.005);
  const lift = useSpringValue(10, SPRING.quick, 0.3);
  useSpringStyle(panelRef, [scale, opacity, lift], ([s, o, y]) => ({ transform: `translateY(${y ?? 0}px) scale(${s ?? 1})`, opacity: String(o ?? 1) }));

  useEffect(() => {
    void scale.set(1);
    void opacity.set(1);
    void lift.set(0);
    inputRef.current?.focus();
  }, [scale, opacity, lift]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-taskbar-search]')) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [onClose]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const launch = (entry: LauncherEntry) => {
    launchEntry(entry);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = entries[active];
      if (entry) launch(entry);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className={styles.host}>
      <div ref={panelRef} className={`${styles.panel} material`} role="dialog" aria-label="Launcher" onKeyDown={onKeyDown}>
        <div className={styles.searchRow}>
          <MagnifyingGlass weight="bold" className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            type="search"
            placeholder="Search apps and shortcuts"
            aria-label="Search apps and shortcuts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div ref={listRef} className={`${styles.list} scroll`} role="listbox" aria-label="Results">
          {entries.length === 0 && <div className={styles.emptyState}>No matches for “{query}”.</div>}
          {entries.map((entry, index) => (
            <button
              key={entryKey(entry)}
              type="button"
              role="option"
              aria-selected={index === active}
              data-index={index}
              className={`${styles.entry} ${index === active ? styles.entryActive : ''}`}
              onPointerEnter={() => setActive(index)}
              onClick={() => launch(entry)}
              tabIndex={-1}
            >
              <EntryIcon entry={entry} size={32} />
              <span className={styles.entryText}>
                <span className={`${styles.entryName} text-truncate`}>{entry.kind === 'app' ? entry.app.name : entry.shortcut.name}</span>
                <span className={`${styles.entryDetail} text-truncate`}>{entry.kind === 'app' ? entry.app.description : entry.shortcut.url}</span>
              </span>
              {entry.kind === 'app' && <span className={styles.tag}>App</span>}
            </button>
          ))}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.footerButton}
            onClick={() => {
              openApp('settings');
              onClose();
            }}
          >
            <GearSix /> Settings
          </button>
          <button type="button" className={styles.footerButton} onClick={onLogout}>
            <SignOut /> Log out
          </button>
        </div>
      </div>
    </div>
  );
}
