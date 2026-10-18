import type { MetricName, MetricPayloads } from './Metrics';

// ---- /ws/metrics ----------------------------------------------------------

export type MetricsClientMessage =
  | { type: 'subscribe'; metric: MetricName; intervalMs: number }
  | { type: 'unsubscribe'; metric: MetricName };

export type MetricsServerMessage =
  | { type: 'sample'; metric: MetricName; at: number; data: MetricPayloads[MetricName] }
  | { type: 'unavailable'; metric: MetricName; reason: string }
  | { type: 'error'; message: string };

// ---- /ws/terminal ---------------------------------------------------------

/** Binary frames carry terminal bytes in both directions; JSON frames carry control. */
export type TerminalClientMessage = { type: 'resize'; cols: number; rows: number };

export type TerminalServerMessage =
  | { type: 'ready' }
  | { type: 'exit'; code: number | null; signal: string | null }
  | { type: 'error'; message: string };

// ---- /ws/logs -------------------------------------------------------------

export type LogSource =
  | { source: 'docker'; containerId: string; tail: number; follow: boolean }
  | { source: 'journal'; unit: string | null; lines: number; follow: boolean }
  | { source: 'file'; path: string; follow: boolean };

export type LogsClientMessage = ({ type: 'open' } & LogSource) | { type: 'close' };

export type LogsServerMessage =
  | { type: 'chunk'; text: string }
  | { type: 'end'; reason: string }
  | { type: 'error'; message: string };
