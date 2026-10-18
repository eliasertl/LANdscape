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
  return (
    <WidgetFrame widget={widget} title="CPU" unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' ? (
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.big}>{formatPercent(state.data.total)}</span>
            {state.data.loadAverage && (
              <span className={styles.muted} title="Load average (1, 5, 15 min)">
                {state.data.loadAverage.map((v) => v.toFixed(2)).join(' · ')}
              </span>
            )}
          </div>
          <Sparkline values={history} max={100} width={256} height={80} />
          {showCores && (
            <div className={styles.cores} aria-label={`${state.data.cores.length} cores`}>
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
