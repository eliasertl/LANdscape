import type { WidgetProps } from '../Types';
import { WidgetFrame } from '../WidgetFrame';
import { useMetric } from '../UseMetric';
import { UsageBar, usageColor } from '../../Components/Sparkline';
import { formatBytes, formatPercent } from '../Format';
import styles from '../Widgets.module.css';

export function RamWidget({ widget }: WidgetProps) {
  const state = useMetric('memory', widget.settings.intervalMs);
  const showSwap = widget.settings.showSwap !== false;
  return (
    <WidgetFrame widget={widget} title="Memory" unavailable={state.status === 'unavailable' ? state.reason : null}>
      {state.status === 'ok' ? (
        <div className={styles.stack}>
          {(() => {
            const ratio = state.data.usedBytes / Math.max(1, state.data.totalBytes);
            const swapRatio = state.data.swapTotalBytes > 0 ? state.data.swapUsedBytes / state.data.swapTotalBytes : 0;
            return (
              <>
                <div className={styles.row}>
                  <span className={styles.big}>{formatPercent(ratio * 100)}</span>
                  <span className={styles.muted}>
                    {formatBytes(state.data.usedBytes)} of {formatBytes(state.data.totalBytes)}
                  </span>
                </div>
                <UsageBar ratio={ratio} color={usageColor(ratio)} />
                {showSwap && (
                  <div className={styles.row}>
                    <span className={styles.label}>Swap</span>
                    <span className={styles.value}>
                      {state.data.swapTotalBytes > 0 ? `${formatBytes(state.data.swapUsedBytes)} of ${formatBytes(state.data.swapTotalBytes)} (${formatPercent(swapRatio * 100)})` : 'none'}
                    </span>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <div className={styles.waiting}>Waiting for data…</div>
      )}
    </WidgetFrame>
  );
}
