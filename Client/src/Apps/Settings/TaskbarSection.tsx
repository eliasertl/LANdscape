import { X } from '@phosphor-icons/react';
import type { Settings } from '@landscape/shared';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Segmented, Select } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { Button } from '../../Components/Button';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import { Taskbar } from '../../Taskbar/Taskbar';
import { registries } from '../../Platform/Registries';
import { useRegistry } from '../../Platform/Registry';
import { isSafeMode } from '../../Platform/SafeMode';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

type TaskbarSettings = Settings['taskbar'];

const STYLES: { value: TaskbarSettings['style']; label: string; detail: string }[] = [
  { value: 'floating', label: 'Floating', detail: 'A centered pill above the edge.' },
  { value: 'win10', label: 'Windows 10', detail: 'Full width, launcher and apps on the left, tray and clock on the right.' },
  { value: 'win11', label: 'Windows 11', detail: 'Full width, launcher and apps centered.' },
  { value: 'dock', label: 'Dock', detail: 'Floating, icons grow as the pointer passes over them.' },
];

export default function TaskbarSection() {
  const taskbar = useDesktopStore((s) => s.settings?.taskbar);
  const shortcuts = useDesktopStore((s) => s.shortcuts);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const trayItems = useRegistry(registries.trayItems);
  const apps = useRegistry(registries.apps);

  const patch = (value: Parameters<typeof updateSettings>[0]['taskbar']) => {
    void updateSettings({ taskbar: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };
  if (!taskbar) return null;

  const pinnedLabel = (key: string) => {
    const [kind, id] = key.split(':');
    return kind === 'app' ? (apps.find((a) => a.id === id)?.name ?? key) : (shortcuts.find((s) => s.id === id)?.name ?? key);
  };

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Style</h3>
        {isSafeMode() && <p className="text-callout" style={{ color: 'var(--system-orange)' }}>Safe mode shows the default floating bar; your choice applies after leaving safe mode.</p>}
        <div className={styles.previewBox} aria-label="Taskbar preview">
          <div className={styles.previewScale}>
            <Taskbar preview={taskbar} />
          </div>
        </div>
        <div className={styles.group}>
          {STYLES.map((s) => (
            <label key={s.value} className={`${styles.row} ${styles.choice}`}>
              <input type="radio" name="taskbar-style" value={s.value} checked={taskbar.style === s.value} onChange={() => patch({ style: s.value })} />
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{s.label}</span>
                <span className={styles.rowDetail}>{s.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Placement</h3>
        <div className={styles.group}>
          <SettingRow label="Position">
            <Segmented
              ariaLabel="Taskbar position"
              value={taskbar.position}
              onChange={(position) => patch({ position })}
              options={[
                { value: 'bottom', label: 'Bottom' },
                { value: 'top', label: 'Top' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Size">
            <Segmented
              ariaLabel="Taskbar size"
              value={taskbar.size}
              onChange={(size) => patch({ size })}
              options={[
                { value: 's', label: 'Small' },
                { value: 'm', label: 'Medium' },
                { value: 'l', label: 'Large' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Auto-hide" detail="Slides away and comes back when the pointer touches the edge. Windows then use the whole screen.">
            <Toggle checked={taskbar.autoHide} onChange={(autoHide) => patch({ autoHide })} />
          </SettingRow>
          <SettingRow label="Window titles" detail="Shows the title next to the icon (Windows styles, horizontal bar).">
            <Toggle checked={taskbar.showTitles} onChange={(showTitles) => patch({ showTitles })} />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Clock</h3>
        <div className={styles.group}>
          <SettingRow label="Show seconds">
            <Toggle checked={taskbar.clock.seconds} onChange={(seconds) => patch({ clock: { seconds } })} />
          </SettingRow>
          <SettingRow label="Hours">
            <Segmented
              ariaLabel="Clock hours"
              value={taskbar.clock.hours}
              onChange={(hours) => patch({ clock: { hours } })}
              options={[
                { value: 'auto', label: 'System' },
                { value: '12', label: '12 h' },
                { value: '24', label: '24 h' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Show date">
            <Toggle checked={taskbar.clock.showDate} onChange={(showDate) => patch({ clock: { showDate } })} />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Pinned</h3>
        <p className="text-callout text-secondary">Pin apps and shortcuts from their context menu (taskbar, launcher or desktop icon); drag pinned items along the bar to reorder them.</p>
        <div className={styles.group}>
          {taskbar.pinned.length === 0 ? (
            <div className={styles.row}>
              <span className={styles.rowDetail}>Nothing pinned yet.</span>
            </div>
          ) : (
            taskbar.pinned.map((key) => (
              <SettingRow key={key} label={pinnedLabel(key)} detail={key}>
                <Button size="small" variant="plain" icon={<X />} aria-label={`Unpin ${pinnedLabel(key)}`} onClick={() => patch({ pinned: taskbar.pinned.filter((k) => k !== key) })} />
              </SettingRow>
            ))
          )}
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Tray</h3>
        <div className={styles.group}>
          {trayItems.length === 0 && (
            <div className={styles.row}>
              <span className={styles.rowDetail}>No tray items are registered.</span>
            </div>
          )}
          {trayItems.map((item) => (
            <SettingRow key={item.id} label={item.title} detail={item.source?.kind === 'app' ? `From ${item.source.appId}` : 'Built in'}>
              <Toggle
                checked={!taskbar.trayHidden.includes(item.id)}
                onChange={(on) => patch({ trayHidden: on ? taskbar.trayHidden.filter((id) => id !== item.id) : [...taskbar.trayHidden, item.id] })}
              />
            </SettingRow>
          ))}
          <SettingRow label="More tray items" detail="The notification bell and the service-health summary arrive with the notification center.">
            <Select aria-label="Tray placeholder" value="" onChange={() => undefined} options={[{ value: '', label: 'Coming soon' }]} disabled />
          </SettingRow>
        </div>
      </section>
    </>
  );
}
