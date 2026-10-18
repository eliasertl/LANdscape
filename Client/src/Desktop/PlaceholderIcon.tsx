const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af2', '#5e5ce6', '#64d2ff', '#ff453a', '#ffd60a', '#ac8e68', '#40c8e0', '#63e6e2'];

export function placeholderColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? '#0a84ff';
}

/** Letter on a colored squircle, used when no favicon or upload exists. */
export function PlaceholderIcon({ name, size }: { name: string; size: number }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  const color = placeholderColor(name);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`ph-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <path d="M50 2C85 2 98 15 98 50S85 98 50 98 2 85 2 50 15 2 50 2z" fill={color} />
      <path d="M50 2C85 2 98 15 98 50S85 98 50 98 2 85 2 50 15 2 50 2z" fill={`url(#ph-${color.slice(1)})`} />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-ui)" fontWeight="700" fontSize="52" fill="#fff">
        {letter}
      </text>
    </svg>
  );
}
