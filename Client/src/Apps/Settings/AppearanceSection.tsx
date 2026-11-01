import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import { Select } from '../../Components/Select';
import { UI_SCALES, useDeviceStore } from '../../Store/DeviceStore';
import { SettingRow } from './SettingRow';
import type { Theme } from '@landscape/shared';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Segmented } from '../../Components/Select';
import { WallpaperPicker } from '../../Desktop/WallpaperDialog';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import styles from './SettingsApp.module.css';

export default function AppearanceSection() {
  const settings = useDesktopStore((s) => s.settings);
  const updateSettings = useDesktopStore((s) => s.updateSettings);

  const setTheme = (theme: Theme) => {
    void updateSettings({ theme }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const uiScale = useDeviceStore((s) => s.settings.uiScale);
  const updateDevice = useDeviceStore((s) => s.update);

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Theme</h3>
        <div className={styles.group}>
          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>Appearance</span>
              <span className={styles.rowDetail}>System follows your operating system. Dark is pure black.</span>
            </div>
            <Segmented
              ariaLabel="Theme"
              value={settings?.theme ?? 'system'}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Light', icon: <Sun /> },
                { value: 'dark', label: 'Dark', icon: <Moon /> },
                { value: 'system', label: 'System', icon: <Desktop /> },
              ]}
            />
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Size</h3>
        <div className={styles.group}>
          <SettingRow label="UI scale" detail="Makes everything on the desktop larger or smaller." device>
            <Select
              aria-label="UI scale"
              value={String(uiScale)}
              onChange={(value) => updateDevice({ uiScale: Number(value) })}
              options={UI_SCALES.map((scale) => ({ value: String(scale), label: `${Math.round(scale * 100)} %${scale === 1 ? ' (default)' : ''}` }))}
            />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Wallpaper</h3>
        <WallpaperPicker />
      </section>
    </>
  );
}
