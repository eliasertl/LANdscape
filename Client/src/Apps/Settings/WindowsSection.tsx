import { useDesktopStore } from '../../Store/DesktopStore';
import { Segmented } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

export default function WindowsSection() {
  const windows = useDesktopStore((s) => s.settings?.windows);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const patch = (value: Parameters<typeof updateSettings>[0]['windows']) => {
    void updateSettings({ windows: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };
  if (!windows) return null;

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Look</h3>
        <div className={styles.group}>
          <SettingRow label="Title-bar buttons" detail="Traffic lights on the left, or Windows-style buttons on the right. Applies to open windows right away.">
            <Segmented
              ariaLabel="Title-bar buttons"
              value={windows.buttons}
              onChange={(buttons) => patch({ buttons })}
              options={[
                { value: 'mac', label: 'macOS' },
                { value: 'windows', label: 'Windows' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Animation" detail="Opening, closing and minimizing. Reduced motion in your OS turns animations off regardless.">
            <Segmented
              ariaLabel="Window animation"
              value={windows.animation}
              onChange={(animation) => patch({ animation })}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'fast', label: 'Fast' },
                { value: 'off', label: 'Off' },
              ]}
            />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>New windows</h3>
        <div className={styles.group}>
          <SettingRow label="Open maximized" detail="Windows without a remembered size fill the screen when they open.">
            <Toggle checked={windows.openMaximized} onChange={(openMaximized) => patch({ openMaximized })} />
          </SettingRow>
          <SettingRow label="Cascade" detail="A second window of the same app opens offset from the first instead of on top of it.">
            <Toggle checked={windows.cascade} onChange={(cascade) => patch({ cascade })} />
          </SettingRow>
        </div>
        <p className="text-footnote text-secondary">
          Snapping: drag a window to the left or right edge for a half, to a corner for a quarter, to the top edge to maximize. Keyboard: see Keyboard Shortcuts (Ctrl+Alt+Arrow by default).
        </p>
      </section>
    </>
  );
}
