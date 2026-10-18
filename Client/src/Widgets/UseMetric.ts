import { useEffect, useState } from 'react';
import type { MetricName } from '@landscape/shared';
import { metricsSocket, type MetricState } from '../Api/MetricsSocket';

/** Subscribes to a server metric at the given interval for the component's lifetime. */
export function useMetric<K extends MetricName>(metric: K, intervalMs: number): MetricState<K> {
  const [state, setState] = useState<MetricState<K>>({ status: 'waiting' });
  useEffect(() => metricsSocket.subscribe(metric, intervalMs, setState), [metric, intervalMs]);
  return state;
}

/** Keeps a rolling history of numbers (for sparklines). */
export function useHistory(value: number | null, length = 40): number[] {
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (value === null) return;
    setHistory((current) => [...current.slice(-(length - 1)), value]);
  }, [value, length]);
  return history;
}
