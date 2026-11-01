import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, GearSix, Lightning, MagnifyingGlass, PushPin, PushPinSlash, SignOut } from '@phosphor-icons/react';
import type { Shortcut } from '@landscape/shared';
import { registries } from '../Platform/Registries';
import { useRegistry } from '../Platform/Registry';
import { actionParamKeys, runAction, type AnyAction } from '../Platform/Actions';
import type { AppDefinition } from '../Apps/Types';
import { shortcutIconUrl, useDesktopStore } from '../Store/DesktopStore';
import { useUiStore } from '../Store/UiStore';
import { AppTile } from '../Desktop/AppTile';
import { PlaceholderIcon } from '../Desktop/PlaceholderIcon';
import { openApp, openShortcut } from '../Desktop/Launch';
import { isPinned, togglePin } from '../Taskbar/TaskbarApps';
import { SPRING } from '../Design/Spring';
import { useSpringStyle, useSpringValue } from '../Design/UseSpring';
import { Button } from '../Components/Button';
import { TextField } from '../Components/TextField';
import { Select } from '../Components/Select';
import { toast } from '../Components/Toast';
import { errorMessage } from '../Api/Http';
import styles from './StartMenu.module.css';

export type LauncherEntry = { kind: 'app'; app: AppDefinition } | { kind: 'shortcut'; shortcut: Shortcut } | { kind: 'action'; action: AnyAction };

/**
 * Apps, shortcuts and actions matching a query. Without a query, actions
 * stay out of the way; they show up when searched for, or alone when the
 * query starts with ">".
 */
export function useLauncherEntries(query: string): LauncherEntry[] {
  const shortcuts = useDesktopStore((s) => s.shortcuts);
  const settings = useDesktopStore((s) => s.settings);
  const allApps = useRegistry(registries.apps);
  const allActions = useRegistry(registries.actions);
  return useMemo(() => {
    const raw = query.trim();
    const actionsOnly = raw.startsWith('>');
    const q = (actionsOnly ? raw.slice(1) : raw).trim().toLowerCase();
    const apps: LauncherEntry[] = allApps.filter((app) => settings?.enabledApps[app.id] !== false).map((app) => ({ kind: 'app', app }));
    const links: LauncherEntry[] = shortcuts.map((shortcut) => ({ kind: 'shortcut', shortcut }));
    const actions: LauncherEntry[] = allActions.filter((a) => !a.hidden).map((action) => ({ kind: 'action', action }));
    if (actionsOnly) return q ? actions.filter((e) => e.kind === 'action' && (e.action.title.toLowerCase().includes(q) || e.action.id.includes(q))) : actions;
    if (!q) return [...links, ...apps];
    const score = (entry: LauncherEntry) => {
      const name = entryName(entry).toLowerCase();
      const extra = entryDetail(entry).toLowerCase();
      if (name.startsWith(q)) return 3;
      if (name.includes(q)) return 2;
      if (extra.includes(q)) return 1;
      return 0;
    };
    return [...links, ...apps, ...actions]
      .map((entry) => ({ entry, score: score(entry) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.entry);
  }, [query, shortcuts, settings, allApps, allActions]);
}

export function entryKey(entry: LauncherEntry): string {
  return entry.kind === 'app' ? `app:${entry.app.id}` : entry.kind === 'shortcut' ? `shortcut:${entry.shortcut.id}` : `action:${entry.action.id}`;
}

export function entryName(entry: LauncherEntry): string {
  return entry.kind === 'app' ? entry.app.name : entry.kind === 'shortcut' ? entry.shortcut.name : entry.action.title;
}

export function entryDetail(entry: LauncherEntry): string {
  return entry.kind === 'app' ? entry.app.description : entry.kind === 'shortcut' ? entry.shortcut.url : (entry.action.description ?? `Action · ${entry.action.provider}`);
}

/** Launches an entry; returns false when the action needs parameters first. */
export function launchEntry(entry: LauncherEntry): boolean {
  if (entry.kind === 'app') openApp(entry.app.id);
  else if (entry.kind === 'shortcut') openShortcut(entry.shortcut);
  else {
    if (actionParamKeys(entry.action).length > 0) return false;
    void runAction(entry.action.id).catch((error: unknown) => toast.error(errorMessage(error)));
  }
  return true;
}

export function EntryIcon({ entry, size }: { entry: LauncherEntry; size: number }) {
  if (entry.kind === 'app') return <AppTile app={entry.app} size={size} />;
  if (entry.kind === 'action') {
    const Icon = entry.action.icon ?? Lightning;
    return (
      <span className={styles.actionIcon} style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }} aria-hidden="true">
        <Icon weight="fill" size={Math.round(size * 0.55)} />
      </span>
    );
  }
  const url = shortcutIconUrl(entry.shortcut);
  if (url) return <img src={url} width={size} height={size} alt="" style={{ borderRadius: Math.round(size * 0.22), objectFit: 'cover', background: '#fff' }} draggable={false} />;
  return <PlaceholderIcon name={entry.shortcut.name} size={size} />;
}

/** Search bar + launcher panel (apps, shortcuts, actions) that expands from the taskbar's search icon. */
export function StartMenu({ onLogout }: { onLogout: () => void }) {
  const open = useUiStore((s) => s.startMenuOpen);
  const setOpen = useUiStore((s) => s.setStartMenuOpen);
  if (!open) return null;
  return <StartMenuPanel onClose={() => setOpen(false)} onLogout={onLogout} />;
}

function StartMenuPanel({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState<AnyAction | null>(null);
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
    if (launchEntry(entry)) onClose();
    else if (entry.kind === 'action') setPending(entry.action);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (pending) return;
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
        {pending ? (
          <ActionParams action={pending} onBack={() => setPending(null)} onDone={onClose} />
        ) : (
          <>
            <div className={styles.searchRow}>
              <MagnifyingGlass weight="bold" className={styles.searchIcon} />
              <input
                ref={inputRef}
                className={styles.input}
                type="search"
                placeholder="Search apps, shortcuts and actions"
                aria-label="Search apps and shortcuts"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div ref={listRef} className={`${styles.list} scroll`} role="listbox" aria-label="Results">
              {entries.length === 0 && <div className={styles.emptyState}>No matches for “{query}”. Type “&gt;” to list every action.</div>}
              {entries.map((entry, index) => (
                <button
                  key={entryKey(entry)}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  data-entry={entryKey(entry)}
                  className={`${styles.entry} ${index === active ? styles.entryActive : ''}`}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => launch(entry)}
                  onContextMenu={(e) => {
                    if (entry.kind === 'action') return;
                    e.preventDefault();
                    const key = entryKey(entry);
                    useUiStore.getState().openContextMenu(
                      [{ label: isPinned(key) ? 'Unpin from taskbar' : 'Pin to taskbar', icon: createElement(isPinned(key) ? PushPinSlash : PushPin), onSelect: () => togglePin(key) }],
                      { x: e.clientX, y: e.clientY },
                    );
                  }}
                  tabIndex={-1}
                >
                  <EntryIcon entry={entry} size={32} />
                  <span className={styles.entryText}>
                    <span className={`${styles.entryName} text-truncate`}>{entryName(entry)}</span>
                    <span className={`${styles.entryDetail} text-truncate`}>{entryDetail(entry)}</span>
                  </span>
                  {entry.kind === 'app' && <span className={styles.tag}>App</span>}
                  {entry.kind === 'action' && <span className={styles.tag}>Action</span>}
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
          </>
        )}
      </div>
    </div>
  );
}

/** Inline prompt for an action's parameters: a text field or a pick list per field, then Run. */
function ActionParams({ action, onBack, onDone }: { action: AnyAction; onBack: () => void; onDone: () => void }) {
  const keys = actionParamKeys(action);
  const fields = keys.map((key) => action.fields?.find((f) => f.key === key) ?? { key, label: key });
  const [values, setValues] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, { value: string; label: string; detail?: string }[]>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    for (const field of fields) {
      if (!field.choices) continue;
      field
        .choices()
        .then((list) => {
          setChoices((c) => ({ ...c, [field.key]: list }));
          setValues((v) => (v[field.key] || !list[0] ? v : { ...v, [field.key]: list[0].value }));
        })
        .catch((err: unknown) => setError(errorMessage(err)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action.id]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      await runAction(action.id, values);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <form
      className={styles.params}
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
      data-action-params={action.id}
    >
      <div className={styles.paramsHeader}>
        <button type="button" className={styles.footerButton} onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </button>
        <EntryIcon entry={{ kind: 'action', action }} size={28} />
        <span className="text-headline text-truncate">{action.title}</span>
      </div>
      {fields.map((field) =>
        choices[field.key] ? (
          <Select key={field.key} label={field.label} value={values[field.key] ?? ''} onChange={(value) => setValues((v) => ({ ...v, [field.key]: value }))} options={choices[field.key] ?? []} />
        ) : (
          <TextField key={field.key} label={field.label} placeholder={field.placeholder} value={values[field.key] ?? ''} autoFocus onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))} spellCheck={false} />
        ),
      )}
      {error && (
        <span className="text-footnote" style={{ color: 'var(--color-destructive)' }} role="alert">
          {error}
        </span>
      )}
      <div className={styles.paramsActions}>
        <Button onClick={onBack} disabled={running}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={running} disabled={fields.some((f) => !values[f.key])}>
          Run
        </Button>
      </div>
    </form>
  );
}
