import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useMetric } from '../UseMetric';
import { formatTemperature } from '../Format';
import styles from '../Widgets.module.css';

function tempColor(celsius: number, max: number | null, critical: number | null): string {
  const limit = critical ?? max ?? 90;
  if (celsius >= limit - 5) return 'var(--system-red)';
  if (celsius >= limit * 0.8) return 'var(--system-orange)';
  return 'var(--color-label)';
}

export function TemperatureWidget({ widget }: WidgetProps) {
  const state = useMetric('temperatures', widget.settings.intervalMs);
  const sensors = state.status === 'ok' ? state.data.sensors : [];
  const hottest = sensors.reduce<(typeof sensors)[number] | null>((best, s) => (!best || s.celsius > best.celsius ? s : best), null);
  const rows = sensors.slice(0, 6);
  return (
    <WidgetFrame widget={widget} title="Temperatures" unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' && hottest ? (
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.big} style={{ color: tempColor(hottest.celsius, hottest.max, hottest.critical) }}>
              {formatTemperature(hottest.celsius)}
            </span>
            <span className={styles.muted}>{hottest.label}</span>
          </div>
          <div className={styles.list}>
            {rows.map((s) => (
              <div key={s.sensor} className={styles.row}>
                <span className={styles.label} title={s.sensor}>
                  {s.label}
                </span>
                <span className={styles.value} style={{ color: tempColor(s.celsius, s.max, s.critical) }}>
                  {formatTemperature(s.celsius)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
