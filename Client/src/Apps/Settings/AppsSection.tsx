import { APPS } from '../Registry';
import { useDesktopStore } from '../../Store/DesktopStore';
import { useWindowStore } from '../../Store/WindowStore';
import { Toggle } from '../../Components/Toggle';
import { AppTile } from '../../Desktop/AppTile';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import styles from './SettingsApp.module.css';

export function AppsSection() {
  const settings = useDesktopStore((s) => s.settings);
  const updateSettings = useDesktopStore((s) => s.updateSettings);

  const setEnabled = (id: (typeof APPS)[number]['id'], enabled: boolean) => {
    void updateSettings({ enabledApps: { [id]: enabled } })
      .then(() => {
        if (!enabled) void useWindowStore.getState().closeAll(`app:${id}`);
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  };

  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>Built-in apps</h3>
      <p className="text-callout text-secondary">Disabled apps disappear from the start menu and cannot be opened. Settings is always available.</p>
      <div className={styles.group}>
        {APPS.map((app) => (
          <div key={app.id} className={styles.row}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <AppTile app={app} size={32} />
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{app.name}</span>
                <span className={styles.rowDetail}>
                  {app.description}
                  {app.requires ? ` · needs ${app.requires === 'ssh' ? 'SSH' : 'Docker socket'}` : ''}
                </span>
              </div>
            </div>
            <Toggle checked={settings?.enabledApps[app.id] !== false} disabled={app.id === 'settings'} onChange={(checked) => setEnabled(app.id, checked)} />
          </div>
        ))}
      </div>
    </section>
  );
}
