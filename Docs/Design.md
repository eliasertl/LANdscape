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

## Taskbar styles

- **Floating** (default): the frosted pill, 10 px off the edge, launcher · apps · tray · clock.
- **Windows 10**: full width, flush with the edge, square corners; launcher and apps start at the left (top when vertical), tray and clock sit at the right.
- **Windows 11**: full width, launcher and apps centered, tray and clock at the right.
- **Dock**: the floating pill with icons that grow up to 1.45× as the pointer passes (spring-driven; off under reduced motion).

Sizes S/M/L are 44/56/68 px; icons are 12 px smaller than the bar. Vertical bars (left/right) stack everything and shrink the clock. Auto-hide slides the bar out along its edge over 200 ms and keeps a 4 px catcher strip. Pinned items without a window show no dot; running ones show the small dot, the focused one the accent dot and a filled background. Window titles (Windows styles) sit right of the icon in 12 px medium.

## Windows

Title bars have macOS traffic lights on the left by default, or Windows-style minimize / maximize / close buttons (46 px wide, close turns red on hover) on the right with the title left-aligned. Snapping shows a rounded, accent-tinted translucent rectangle with a 2 px accent border where the window will land.

## Notifications and the command palette

- **Toasts** stay as they are (top right, frosted, auto-dismiss). The **bell** in the tray fills when something is unread and carries a red count badge; **do not disturb** shows a crossed bell.
- The **notification center** is a 400 px frosted panel above the tray (it follows the taskbar's edge like the launcher): header with "Mark all read" and "Clear", a list where unread rows have a faint accent tint and an accent dot, and a footer with the do-not-disturb switch. Levels use the accent (info), orange (warning) and red (error) icons.
- **Health dots** sit at the bottom-left of a shortcut icon: green up, red down, grey unknown, with a dark ring so they read on any wallpaper. The tray's **service health** item is one dot (green/red/grey) plus the number of services down.
- **Actions** in the launcher get an accent tile with the action's icon and an "Action" tag. Picking one with parameters swaps the panel for a small form (back arrow, title, one field per parameter, Cancel / Run).

## Lock screen, startup, cursor

- **Lock screen:** the blurred wallpaper (blur from Settings), an optional clock at 10 vh (digital 56 px or large 112 px, with the date), an optional message beneath it, and the frosted card. When a locked session unlocks, the card shows the username, "Locked — enter your password to continue", the password field, **Unlock**, and a quiet "Log out instead".
- **Startup animation:** a full-screen overlay in the chosen background/foreground colors with a "Click or press a key to skip" hint at the bottom. Presets: logo fade (wordmark or uploaded logo scales from 0.96 and fades), boot log (mono lines typed with a blinking block cursor), particle burst (160 dots ease out from the center and fade), wallpaper zoom (the current wallpaper zooms from 1.6× and un-blurs), progress line (wordmark over a 3 px line). Reduced motion: a 600 ms fade of the wordmark/logo.
- **Cursors:** 32 × 32 SVGs. *Soft rounded* is a plump white arrow with a dark 2 px outline and round joins; *large high-contrast* is a black arrow with a 3 px yellow (`#ffd60a`) outline. Both have pointer (hand), I-beam, move (four arrows), resize (two arrows) and busy (ring) forms.

## Keyboard shortcuts

Shortcuts are shown as mono "Ctrl + Alt + ←" chips; clicking one turns it accent-outlined with "Press keys…". A conflicting chip gets an orange border and both rows say "Also used by …".

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
