# Design notes

The look follows the owner's Carbon UI library (macOS-style, calm, minimal, precise) adapted to the web with frosted-glass translucency.

## Tokens

All colors, radii and metrics are CSS custom properties in `Client/src/Design/Tokens.css`.

| Token | Light | Dark |
|---|---|---|
| `--color-background` | `#FFFFFF` | `#000000` |
| `--color-secondary-background` | `#F2F2F7` | `#1C1C1E` |
| `--color-label` / `--color-secondary-label` / `--color-tertiary-label` | `#000000` / `#6E6E73` / `#AEAEB2` | `#FFFFFF` / `#98989F` / `#636366` |
| `--color-separator` | `#DCDCE0` | `#38383A` |
| `--color-control-fill` | `#787880` @ 16 % | `#787880` @ 32 % |
| `--color-accent` | `#007AFF` | `#0A84FF` |
| `--color-destructive` | `#FF3B30` | `#FF453A` |

Metrics: `--radius: 6px`, `--radius-group: 10px`, `--radius-overlay: 10px`, `--radius-window: 12px`, `--spacing: 8px`, `--control-height: 24px` (36 px on phones), focus ring 3 px at 1 px offset, disabled opacity 0.4. Materials (`--material-bar`, `--material-menu`, `--material-titlebar`, `--material-widget`) are translucent and combined with `backdrop-filter: blur(24px) saturate(1.8)`; `prefers-reduced-transparency` turns them opaque.

Corners use `corner-shape: superellipse(1.6)` where supported (Chrome 139+) and fall back to `border-radius`.

## Typography

Public Sans (variable) for UI, JetBrains Mono for terminal and editor; the macOS type ramp is in `Typography.css` (`.text-large-title` 26/32 … `.text-body` 13/16 … `.text-caption2` 10/13). Phosphor icons at 1.2× text size, bold next to semibold text.

## Motion

`Design/Spring.ts` implements Carbon's spring model: `response` (seconds) and `dampingFraction` (1 = critical). Presets: `standard` (0.3, 1), `quick` (0.18, 1), `bounce` (0.35, 0.8), `window` (0.26, 0.92). Springs are solved analytically per frame, so they are frame-rate independent and retargeting mid-flight keeps velocity. Used for window open/close, minimize-to-taskbar, menus, the start menu and dialogs. `prefers-reduced-motion` makes springs jump to their target; theme switches animate over 350 ms (150 ms reduced).

## Desktop grid

Shortcut icons and widgets share one grid (`Shared/src/Grid.ts`) whose cell is exactly one app icon: 96 × 112 px, starting 16 px from the top left. An icon takes one cell. Every widget spans a whole number of icon cells, declared in `Widgets/Registry.ts` (`size: { cols, rows }`), and renders at `cols·96 − 8` by `rows·112 − 8` so neighbours keep an 8 px gap. Current sizes: Clock, Memory, Uptime and Docker 2×1; CPU, Disks and Network 3×2; Temperatures 2×2.

Dragging is free; a faint outline shows the target cell (the nearest free one), and on release the item glides into it and the snapped position is saved. New shortcuts take the first free cell column by column from the top left; new widgets the free cell nearest to where the menu was opened. When the window is smaller than the saved layout, items are clamped into view and step aside on screen if that makes them collide, without changing their saved positions. Layouts saved with genuinely colliding positions are untangled once after load.

## Themes

`data-theme="light|dark"` on `<html>`; `system` follows `prefers-color-scheme`. `Client/public/ThemeInit.js` applies the stored choice before first paint to avoid a flash (an external file, because the CSP forbids inline scripts).

## Phone

Below 768 px the desktop is replaced by `Phone/PhoneShell.tsx`: a launcher grid with search, an "Open" strip for windows, and full-screen windows with a back/close bar. Widgets and dragging are desktop-only.
