import { useCallback, useEffect, useState } from 'react';
import { ArrowCounterClockwise, Keyboard as KeyboardIcon } from '@phosphor-icons/react';
import { SHORTCUT_ACTIONS, comboFromEvent, effectiveBindings, findConflicts, formatCombo, isReservedCombo, parseCombo } from '@landscape/shared';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Button } from '../../Components/Button';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import styles from './SettingsApp.module.css';

const GROUPS: { id: (typeof SHORTCUT_ACTIONS)[number]['group']; label: string }[] = [
  { id: 'launcher', label: 'Launcher' },
  { id: 'windows', label: 'Windows' },
  { id: 'system', label: 'System' },
];

/** Pretty keys for display: "Ctrl+Alt+ArrowLeft" → "Ctrl + Alt + ←". */
function pretty(text: string | null): string {
  if (!text) return 'Not bound';
  const combo = parseCombo(text);
  if (!combo) return text;
  const key = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: '⏎', Escape: 'Esc', ',': ',' }[combo.key] ?? combo.key;
  return formatCombo({ ...combo, key }).replace(/\+/g, ' + ');
}

export default function KeyboardSection() {
  const overrides = useDesktopStore((s) => s.settings?.keyboard.bindings ?? {});
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const [recording, setRecording] = useState<string | null>(null);
  const [reserved, setReserved] = useState<string | null>(null);
  const bindings = effectiveBindings(overrides);
  const conflicts = findConflicts(bindings);

  const save = useCallback(
    (patch: Record<string, string>) => {
      void updateSettings({ keyboard: { bindings: patch } }).catch((error: unknown) => toast.error(errorMessage(error)));
    },
    [updateSettings],
  );

  // While recording, the next key press becomes the combo; Escape cancels, Backspace unbinds.
  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        return;
      }
      if (event.key === 'Backspace' && !event.ctrlKey && !event.altKey) {
        save({ [recording]: '' });
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      const problem = isReservedCombo(combo);
      if (problem) {
        setReserved(problem);
        return;
      }
      save({ [recording]: formatCombo(combo) });
      setRecording(null);
      setReserved(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [recording, save]);

  const resetAll = () => save(Object.fromEntries(SHORTCUT_ACTIONS.map((a) => [a.id, a.defaultCombo ?? ''])));
  const title = (id: string) => SHORTCUT_ACTIONS.find((a) => a.id === id)?.title ?? id;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Shortcuts</h3>
          <Button size="small" icon={<ArrowCounterClockwise />} onClick={resetAll}>
            Reset all to defaults
          </Button>
        </div>
        <p className="text-callout text-secondary">
          Click a shortcut to record a new one, then press the keys. Escape cancels, Backspace unbinds. The browser keeps the Windows key and some Ctrl combinations for itself, so the
          defaults use Ctrl+Alt. Shortcuts do not reach LANdscape while an embedded site has keyboard focus.
        </p>
        {reserved && <p className="text-callout" style={{ color: 'var(--system-orange)' }}>{reserved}</p>}
      </section>
      {GROUPS.map((group) => (
        <section key={group.id} className={styles.section}>
          <h3 className={styles.sectionTitle}>{group.label}</h3>
          <div className={styles.group}>
            {SHORTCUT_ACTIONS.filter((a) => a.group === group.id).map((action) => {
              const current = bindings[action.id] ?? null;
              const customized = overrides[action.id] !== undefined && overrides[action.id] !== (action.defaultCombo ?? '');
              const clash = conflicts[action.id];
              return (
                <div key={action.id} className={styles.row} data-shortcut-row={action.id}>
                  <div className={styles.rowText}>
                    <span className={styles.rowLabel}>{action.title}</span>
                    {clash && <span className={styles.rowHint}>Also used by {clash.map(title).join(', ')}</span>}
                    {action.id === 'notifications.toggle' && <span className={styles.rowDetail}>Arrives with the notification center.</span>}
                  </div>
                  <div className={styles.shortcutControls}>
                    {customized && (
                      <Button size="small" variant="plain" icon={<ArrowCounterClockwise />} aria-label={`Reset ${action.title}`} title="Reset to default" onClick={() => save({ [action.id]: action.defaultCombo ?? '' })} />
                    )}
                    <button
                      type="button"
                      className={`${styles.kbd} ${recording === action.id ? styles.kbdRecording : ''} ${clash ? styles.kbdConflict : ''}`}
                      aria-label={`${action.title}: ${pretty(current)}. Click to change.`}
                      onClick={() => {
                        setReserved(null);
                        setRecording(recording === action.id ? null : action.id);
                      }}
                    >
                      {recording === action.id ? (
                        <>
                          <KeyboardIcon /> Press keys…
                        </>
                      ) : (
                        pretty(current)
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
