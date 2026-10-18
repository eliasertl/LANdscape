import { Desktop, Moon, Sun } from '@phosphor-icons/react';
import type { Theme } from '@landscape/shared';
import { useDesktopStore } from '../../Store/DesktopStore';
import { Segmented } from '../../Components/Select';
import { WallpaperPicker } from '../../Desktop/WallpaperDialog';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import styles from './SettingsApp.module.css';

export function AppearanceSection() {
  const settings = useDesktopStore((s) => s.settings);
  const updateSettings = useDesktopStore((s) => s.updateSettings);

  const setTheme = (theme: Theme) => {
    void updateSettings({ theme }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

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
        <h3 className={styles.sectionTitle}>Wallpaper</h3>
        <WallpaperPicker />
      </section>
    </>
  );
}
