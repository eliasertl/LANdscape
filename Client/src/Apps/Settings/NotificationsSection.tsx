import { useEffect, useState } from 'react';
import { ArrowsClockwise, BellRinging, CheckCircle, Circle, WarningCircle } from '@phosphor-icons/react';
import { useDesktopStore } from '../../Store/DesktopStore';
import { useDeviceStore } from '../../Store/DeviceStore';
import { nativeNotificationSupport, useNotificationStore } from '../../Store/NotificationStore';
import { useMonitorStore } from '../../Store/MonitorStore';
import { Segmented, Select } from '../../Components/Select';
import { Toggle } from '../../Components/Toggle';
import { Button } from '../../Components/Button';
import { toast } from '../../Components/Toast';
import { errorMessage } from '../../Api/Http';
import { SettingRow } from './SettingRow';
import styles from './SettingsApp.module.css';

export default function NotificationsSection() {
  const notifications = useDesktopStore((s) => s.settings?.notifications);
  const monitor = useDesktopStore((s) => s.settings?.monitor);
  const updateSettings = useDesktopStore((s) => s.updateSettings);
  const mode = useDeviceStore((s) => s.settings.notificationMode);
  const updateDevice = useDeviceStore((s) => s.update);
  const sendTest = useNotificationStore((s) => s.sendTest);
  const statuses = useMonitorStore((s) => s.statuses);
  const checkNow = useMonitorStore((s) => s.checkNow);
  const [support, setSupport] = useState(nativeNotificationSupport);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setSupport(nativeNotificationSupport());
  }, [mode]);

  const patch = (value: Parameters<typeof updateSettings>[0]['notifications']) => {
    void updateSettings({ notifications: value }).catch((error: unknown) => toast.error(errorMessage(error)));
  };

  const chooseMode = async (next: 'html' | 'native') => {
    if (next === 'native') {
      const current = nativeNotificationSupport();
      if (!current.available) {
        setSupport(current);
        toast.error(current.reason ?? 'Native notifications are not available here.');
        return;
      }
      if (current.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        setSupport(nativeNotificationSupport());
        if (permission !== 'granted') {
          toast.error('The browser did not allow notifications; in-app toasts stay on.');
          return;
        }
      }
    }
    updateDevice({ notificationMode: next });
  };

  if (!notifications || !monitor) return null;
  const effectiveMode = mode === 'native' && support.available && support.permission === 'granted' ? 'native' : 'html';

  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Delivery</h3>
        <div className={styles.group}>
          <SettingRow
            label="Show notifications as"
            detail={effectiveMode === 'native' ? 'Native browser notifications also show while LANdscape is in another tab.' : (support.reason ?? 'In-app toasts at the top right; the bell in the tray keeps the history.')}
            device
          >
            <Segmented
              ariaLabel="Notification mode"
              value={effectiveMode}
              onChange={(value) => void chooseMode(value)}
              options={[
                { value: 'html', label: 'Toasts' },
                { value: 'native', label: 'Browser' },
              ]}
            />
          </SettingRow>
          <SettingRow label="Do not disturb" detail="Nothing pops up; the history still fills.">
            <Toggle checked={notifications.dnd} onChange={(dnd) => patch({ dnd })} />
          </SettingRow>
          <SettingRow label="Test" detail="Sends a notification to every open desktop.">
            <Button size="small" icon={<BellRinging />} onClick={() => void sendTest().catch((error: unknown) => toast.error(errorMessage(error)))} data-send-test-notification>
              Send test notification
            </Button>
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Watchers</h3>
        <p className="text-callout text-secondary">These run on the server, also while no browser is open.</p>
        <div className={styles.group}>
          <SettingRow label="Containers" detail="A container stopped, died with an error, or ran out of memory.">
            <Toggle checked={notifications.watchers.docker} onChange={(docker) => patch({ watchers: { docker } })} />
          </SettingRow>
          <SettingRow label="Disk usage" detail={`A mounted disk is more than ${notifications.watchers.disk.percent} % full.`}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                aria-label="Disk threshold"
                value={String(notifications.watchers.disk.percent)}
                onChange={(value) => patch({ watchers: { disk: { percent: Number(value) } } })}
                options={[70, 80, 85, 90, 95, 98].map((p) => ({ value: String(p), label: `${p} %` }))}
              />
              <Toggle checked={notifications.watchers.disk.enabled} onChange={(enabled) => patch({ watchers: { disk: { enabled } } })} />
            </div>
          </SettingRow>
          <SettingRow label="Temperature" detail={`A sensor reads more than ${notifications.watchers.temperature.celsius} °C.`}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select
                aria-label="Temperature threshold"
                value={String(notifications.watchers.temperature.celsius)}
                onChange={(value) => patch({ watchers: { temperature: { celsius: Number(value) } } })}
                options={[60, 70, 75, 80, 85, 90, 95].map((c) => ({ value: String(c), label: `${c} °C` }))}
              />
              <Toggle checked={notifications.watchers.temperature.enabled} onChange={(enabled) => patch({ watchers: { temperature: { enabled } } })} />
            </div>
          </SettingRow>
          <SettingRow label="Services" detail="A monitored service went down or came back.">
            <Toggle checked={notifications.watchers.monitors} onChange={(monitors) => patch({ watchers: { monitors } })} />
          </SettingRow>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Service health</h3>
          <Button
            size="small"
            icon={<ArrowsClockwise />}
            loading={checking}
            onClick={() => {
              setChecking(true);
              void checkNow()
                .catch((error: unknown) => toast.error(errorMessage(error)))
                .finally(() => setChecking(false));
            }}
          >
            Check now
          </Button>
        </div>
        <p className="text-callout text-secondary">Every shortcut with the health check on (shortcut dialog) is fetched periodically; the icon shows a green, red or grey dot. Apps can register their own targets.</p>
        <div className={styles.group}>
          <SettingRow label="Check every">
            <Select
              aria-label="Check interval"
              value={String(monitor.intervalSeconds)}
              onChange={(value) => void updateSettings({ monitor: { intervalSeconds: Number(value) } }).catch((error: unknown) => toast.error(errorMessage(error)))}
              options={[15, 30, 60, 120, 300, 900, 1800].map((s) => ({ value: String(s), label: s < 60 ? `${s} s` : `${s / 60} min` }))}
            />
          </SettingRow>
          {Object.values(statuses).length === 0 && (
            <div className={styles.row}>
              <span className={styles.rowDetail}>No targets yet. Add a shortcut, or leave its health check on.</span>
            </div>
          )}
          {Object.values(statuses).map((status) => (
            <div key={status.target.id} className={styles.row} data-monitor-row={status.target.id}>
              <div className={styles.rowText}>
                <span className={styles.rowLabel}>{status.target.label}</span>
                <span className={styles.rowDetail}>
                  {status.target.address}
                  {status.reason ? ` · ${status.reason}` : status.latencyMs !== null ? ` · ${status.latencyMs} ms` : ''}
                </span>
              </div>
              {status.state === 'up' ? (
                <span className={`${styles.status} ${styles.statusOk}`}>
                  <CheckCircle weight="fill" /> Up
                </span>
              ) : status.state === 'down' ? (
                <span className={`${styles.status} ${styles.statusBad}`} style={{ color: 'var(--system-red)' }}>
                  <WarningCircle weight="fill" /> Down
                </span>
              ) : (
                <span className={`${styles.status} text-secondary`}>
                  <Circle /> Not checked
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
