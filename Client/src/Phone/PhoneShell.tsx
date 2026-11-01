import { createElement, useEffect, useState } from 'react';
import { DotsThree, GearSix, MagnifyingGlass, Plus, SignOut, X } from '@phosphor-icons/react';
import { useCurrentWallpaperUrl } from '../Desktop/Wallpaper';
import { useSessionStore } from '../Store/SessionStore';
import { useUiStore } from '../Store/UiStore';
import { useWindowStore } from '../Store/WindowStore';
import { EntryIcon, entryKey, entryName, launchEntry, useLauncherEntries } from '../StartMenu/StartMenu';
import { shortcutMenuItems } from '../Desktop/DesktopContextMenu';
import { Overlays } from '../Desktop/Overlays';
import { toast } from '../Components/Toast';
import { SafeModeBanner } from '../Desktop/SafeModeBanner';
import { NotificationCenter } from '../Notifications/NotificationCenter';
import { NotificationBell } from '../Taskbar/Tray/NotificationBell';
import { openApp } from '../Desktop/Launch';
import { PhoneWindow } from './PhoneWindow';
import styles from './PhoneShell.module.css';

/**
 * Simplified layout below the phone breakpoint: a launcher grid with search,
 * full-screen windows with a close bar, no widgets or dragging.
 */
export function PhoneShell() {
  const [query, setQuery] = useState('');
  const entries = useLauncherEntries(query);
  const windows = useWindowStore((s) => s.windows);
  const focusedId = useWindowStore((s) => s.focusedId);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const openShortcutDialog = useUiStore((s) => s.openShortcutDialog);
  const logout = useSessionStore((s) => s.logout);
  const open = windows.filter((w) => !w.closing);
  const active = open.find((w) => w.id === focusedId && !w.minimized) ?? null;
  const background = useCurrentWallpaperUrl();

  // Keep the document from scrolling behind full-screen windows.
  useEffect(() => {
    document.documentElement.classList.add('phone');
    return () => document.documentElement.classList.remove('phone');
  }, []);

  return (
    <div className={styles.shell} style={background ? { backgroundImage: `url("${background}")` } : undefined}>
      <div className={styles.scrim} />
      <div className={`${styles.home} ${active ? styles.homeHidden : ''}`} aria-hidden={active ? true : undefined}>
        <div className={styles.searchRow}>
          <label className={`${styles.search} material`}>
            <MagnifyingGlass weight="bold" />
            <input type="search" placeholder="Search apps and shortcuts" aria-label="Search apps and shortcuts" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </label>
          <span className={`${styles.more} material`} data-phone-bell>
            <NotificationBell />
          </span>
          <button
            type="button"
            className={`${styles.more} material`}
            aria-label="Menu"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              openContextMenu(
                [
                  { label: 'Add new Shortcut', icon: createElement(Plus), onSelect: () => openShortcutDialog({ mode: 'create' }) },
                  { label: 'Settings', icon: createElement(GearSix), onSelect: () => openApp('settings') },
                  { type: 'separator' },
                  { label: 'Log out', icon: createElement(SignOut), onSelect: () => void logout() },
                ],
                { x: rect.right - 200, y: rect.bottom + 6 },
              );
            }}
          >
            <DotsThree weight="bold" />
          </button>
        </div>

        {open.length > 0 && (
          <div className={styles.openStrip}>
            <span className={styles.stripLabel}>Open</span>
            <div className={`${styles.stripList} scroll`}>
              {open.map((w) => (
                <button key={w.id} type="button" className={`${styles.chip} material`} onClick={() => useWindowStore.getState().restore(w.id)}>
                  <span className="text-truncate">{w.title}</span>
                  <span
                    role="button"
                    aria-label={`Close ${w.title}`}
                    className={styles.chipClose}
                    onClick={(e) => {
                      e.stopPropagation();
                      void useWindowStore.getState().requestClose(w.id);
                    }}
                  >
                    <X weight="bold" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`${styles.grid} scroll`} aria-label="Apps and shortcuts">
          {entries.length === 0 && <div className={styles.empty}>No matches for “{query}”.</div>}
          {entries.map((entry) => (
            <button
              key={entryKey(entry)}
              type="button"
              className={styles.tile}
              data-launcher-entry={entryKey(entry)}
              onClick={() => {
                if (!launchEntry(entry)) toast.info('This action asks for details; run it from the desktop launcher.');
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (entry.kind === 'shortcut') openContextMenu(shortcutMenuItems(entry.shortcut), { x: e.clientX, y: e.clientY });
              }}
            >
              <span className={styles.tileIcon}>
                <EntryIcon entry={entry} size={56} />
              </span>
              <span className={styles.tileLabel}>{entryName(entry)}</span>
            </button>
          ))}
        </div>
      </div>

      {open.map((w) => (
        <PhoneWindow key={w.id} win={w} active={w.id === active?.id} />
      ))}
      <Overlays />
      <NotificationCenter />
      <SafeModeBanner />
    </div>
  );
}
