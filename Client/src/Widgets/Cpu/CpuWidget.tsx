import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useHistory, useMetric } from '../UseMetric';
import { Sparkline } from '../../Components/Sparkline';
import { formatPercent } from '../Format';
import styles from '../Widgets.module.css';

export function CpuWidget({ widget }: WidgetProps) {
  const state = useMetric('cpu', widget.settings.intervalMs);
  const total = state.status === 'ok' ? state.data.total : null;
  const history = useHistory(total, 40);
  const showCores = widget.settings.showCores !== false;
  const size = widget.size;
  return (
    <WidgetFrame widget={widget} title="CPU" unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' && size === 's' ? (
        <div className={styles.row} style={{ alignItems: 'center', flex: 1 }}>
          <span className={styles.big}>{formatPercent(state.data.total)}</span>
          <div style={{ flex: 1, height: 36 }}>
            <Sparkline values={history} max={100} width={120} height={36} />
          </div>
        </div>
      ) : state.status === 'ok' ? (
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.big}>{formatPercent(state.data.total)}</span>
            {state.data.loadAverage && (
              <span className={styles.muted} title="Load average (1, 5, 15 min)">
                {state.data.loadAverage.map((v) => v.toFixed(2)).join(' · ')}
              </span>
            )}
          </div>
          <div className={styles.chart}>
            <Sparkline values={history} max={100} width={256} height={size === 'l' ? 160 : 80} />
          </div>
          {showCores && (
            <div className={styles.cores} style={size === 'l' ? { height: 28 } : undefined} aria-label={`${state.data.cores.length} cores`}>
              {state.data.cores.map((core, i) => (
                <span key={i} className={styles.core} style={{ height: `${Math.max(10, core)}%` }} title={`Core ${i}: ${formatPercent(core)}`} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
