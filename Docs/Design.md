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

Shortcut icons, folders and widgets share one grid (`Shared/src/Grid.ts`) whose cell is exactly one app icon. With medium icons and normal density the cell is 96 × 112 px (small 88 × 104, large 112 × 128; compact density takes 8 px off each side, roomy adds 16), starting 16 px from the top left. An icon or folder takes one cell. Every widget spans a whole number of cells per size step (`Widgets/Registry.ts`, `sizes: { s, m, l }`) and renders at `cols·unit − 8` so neighbours keep an 8 px gap. Medium sizes: Clock, Memory, Uptime and Docker 2×1; CPU, Disks and Network 3×2; Temperatures 2×2. Small is one cell for most (CPU, Disks and Network 2×1), large one or two cells more in each direction. One-cell widgets drop their header and show the title as a tooltip.

Positions are anchors (edge or center plus a cell offset), so the layout keeps its shape across screen sizes; see Architecture → Desktop layout.

Dragging is free; a faint outline shows the target cell (the nearest free one), and on release the item glides into it and the snapped position is saved. New shortcuts take the first free cell column by column from the top left; new widgets the free cell nearest to where the menu was opened. When the window is smaller than the saved layout, items are clamped into view and step aside on screen if that makes them collide, without changing their saved positions. Layouts saved with genuinely colliding positions are untangled once after load.

## Folders

A folder icon is a translucent rounded square showing up to four of its shortcuts' icons in a 2 × 2 mini grid (an outline folder glyph when empty). A shortcut dragged over it scales the tile up with an accent ring. Opening a folder shows a frosted popover next to it with a four-column grid of its shortcuts, a rename pencil and a close button; it springs in (`quick`) and closes on Escape or an outside click.

## Appearance settings

- **Accent:** nine preset dots plus a rainbow "custom" dot that opens the native color picker. The selected dot gets a two-ring outline. Text on the accent is black or white, whichever has the higher WCAG contrast.
- **Blur:** a range slider (0–40 px) for the frosted materials; reduced transparency wins.
- **Slideshow / time of day:** wallpaper tiles reuse the picker's tile style with a checkmark badge for selected pictures; time-of-day parts are four pop-up buttons.
- **Desktop:** icon size and density are segmented controls; the grid cell follows them live.

## Scale, errors and safe mode

- **UI scale** (per device, 80–150 %) zooms the whole page; the layout keeps working in CSS pixels (see Architecture → Settings).
- Settings that apply only to this browser carry a small accent-tinted **This device** tag after their label.
- A crashed part shows a centered card: a red octagon icon, "<name> stopped working", the error message (two lines at most) and small **Reload** and **Copy details** buttons. In the taskbar it collapses to the red icon alone.
- **Safe mode** shows a frosted pill at the top center with an orange lifebuoy icon, one sentence and a primary **Leave safe mode** button. The lock screen has a quiet "Start in safe mode" text link at the bottom.

## Themes

`data-theme="light|dark"` on `<html>`; `system` follows `prefers-color-scheme`. `Client/public/ThemeInit.js` applies the stored choice before first paint to avoid a flash (an external file, because the CSP forbids inline scripts).

## Phone

Below 768 px the desktop is replaced by `Phone/PhoneShell.tsx`: a launcher grid with search, an "Open" strip for windows, and full-screen windows with a back/close bar. Widgets and dragging are desktop-only.
