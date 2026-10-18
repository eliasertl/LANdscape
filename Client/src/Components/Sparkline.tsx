import { useId } from 'react';

interface SparklineProps {
  values: number[];
  max?: number;
  min?: number;
  width?: number;
  height?: number;
  color?: string;
  /** Number of points the line should span; shorter histories are right-aligned. */
  capacity?: number;
}

/** Tiny filled line chart; values map onto [min, max] (auto when omitted). */
export function Sparkline({ values, max, min = 0, width = 180, height = 40, color = 'var(--color-accent)', capacity = 40 }: SparklineProps) {
  const id = useId();
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const top = max ?? Math.max(...values, 1);
  const step = width / Math.max(1, capacity - 1);
  const offset = width - step * (values.length - 1);
  const points = values.map((v, i) => {
    const x = offset + i * step;
    const y = height - ((Math.min(Math.max(v, min), top) - min) / (top - min || 1)) * (height - 2) - 1;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  const area = `${line} L${last[0].toFixed(1)},${height} L${first[0].toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Horizontal usage bar (0..1). */
export function UsageBar({ ratio, color = 'var(--color-accent)', height = 6 }: { ratio: number; color?: string; height?: number }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  return (
    <div style={{ height, borderRadius: height, background: 'var(--color-control-fill)', overflow: 'hidden' }} aria-hidden="true">
      <div style={{ width: `${clamped * 100}%`, height: '100%', borderRadius: height, background: color, transition: 'width 400ms ease' }} />
    </div>
  );
}

export function usageColor(ratio: number): string {
  if (ratio >= 0.9) return 'var(--system-red)';
  if (ratio >= 0.75) return 'var(--system-orange)';
  return 'var(--color-accent)';
}
