import { Cube } from '@phosphor-icons/react';
import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useMetric } from '../UseMetric';
import { openApp } from '../../Desktop/Launch';
import styles from '../Widgets.module.css';

export function DockerCountWidget({ widget }: WidgetProps) {
  const state = useMetric('dockerCount', widget.settings.intervalMs);
  return (
    <WidgetFrame widget={widget} title="Docker" unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' ? (
        <div className={styles.stack} style={{ cursor: 'default' }} onDoubleClick={() => openApp('docker')} title="Double-click to open the Docker app">
          <div className={styles.row}>
            <span className={styles.big}>
              {state.data.running}
              <span className={styles.muted} style={{ fontSize: 14, fontWeight: 400 }}>
                {' '}
                / {state.data.total}
              </span>
            </span>
            <Cube weight="duotone" size={26} color="var(--system-blue)" />
          </div>
          <span className={styles.muted}>containers running</span>
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
