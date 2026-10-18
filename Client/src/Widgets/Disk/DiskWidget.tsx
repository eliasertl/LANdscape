import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useMetric } from '../UseMetric';
import { UsageBar, usageColor } from '../../Components/Sparkline';
import { formatBytes } from '../Format';
import styles from '../Widgets.module.css';

export function DiskWidget({ widget }: WidgetProps) {
  const state = useMetric('disks', widget.settings.intervalMs);
  const disks = state.status === 'ok' ? state.data.disks : [];
  const height = Math.max(96, 44 + disks.length * 40);
  return (
    <WidgetFrame widget={widget} title="Disks" width={260} height={Math.min(height, 320)} unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' ? (
        <div className={`${styles.list} scroll`} style={{ overflowY: 'auto' }}>
          {disks.map((disk) => {
            const ratio = disk.totalBytes && disk.usedBytes !== null ? disk.usedBytes / disk.totalBytes : null;
            return (
              <div key={disk.mountPoint} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div className={styles.row}>
                  <span className={styles.label} title={`${disk.device} (${disk.fsType})`}>
                    {disk.mountPoint}
                  </span>
                  <span className={styles.value}>
                    {ratio !== null && disk.totalBytes ? `${formatBytes(disk.freeBytes ?? 0)} free of ${formatBytes(disk.totalBytes)}` : 'usage n/a'}
                  </span>
                </div>
                <UsageBar ratio={ratio ?? 0} color={ratio !== null ? usageColor(ratio) : 'var(--color-tertiary-label)'} height={5} />
              </div>
            );
          })}
          {state.data.usageSource === 'none' && <span className={styles.muted}>Usage needs the host root mount or SSH — see README.</span>}
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
