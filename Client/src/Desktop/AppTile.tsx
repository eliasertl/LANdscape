import type { AppDefinition } from '../Apps/Types';

/** Rounded colored tile with the app's Phosphor icon, like a macOS app icon. */
export function AppTile({ app, size }: { app: AppDefinition; size: number }) {
  const Icon = app.icon;
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.225),
        background: `linear-gradient(180deg, color-mix(in srgb, ${app.color} 78%, white) 0%, ${app.color} 55%, color-mix(in srgb, ${app.color} 85%, black) 100%)`,
        boxShadow: size >= 32 ? 'inset 0 0 0 0.5px rgba(255,255,255,0.25), 0 1px 2px rgba(0,0,0,0.25)' : 'none',
        color: '#fff',
        flex: 'none',
      }}
    >
      <Icon weight="fill" size={Math.round(size * 0.58)} />
    </span>
  );
}
