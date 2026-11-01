# Architecture

LANdscape is one Node process: a Fastify 5 server that hosts the built React client, a JSON API and three WebSocket endpoints on one origin, plus the embed proxy listeners on their own ports. Everything persistent lives in `DATA_DIR` (SQLite database, uploaded icons and wallpapers, SSH key, session secret, host-key store).

```
Browser ──http──▶ Fastify (Server/src)
                   ├─ Http/        security headers, static client, SPA fallback, errors
                   ├─ Auth/        login, DB sessions (signed cookie), lockout, route guard
                   ├─ Desktop/     shortcuts, widgets, settings, window memory, embed check, favicons, uploads
                   ├─ Metrics/     hub + samplers reading HOST_PROC / HOST_SYS, /ws/metrics
                   ├─ Ssh/         ssh2 pool, terminal (/ws/terminal), SFTP file routes, kill
                   ├─ Docker/      dockerode client, container routes, log demuxer
                   ├─ Logs/        /ws/logs (docker | journal | file)
                   ├─ System/      integration status
                   └─ Proxy/       embed proxy: assignments, per-port listeners, header/cookie rewriting
Browser ──http──▶ :8081…:8100 (Proxy/Listener.ts, plain node:http) ──▶ one shortcut's origin each
Client (Client/src)
   ├─ Design/      tokens, typography, springs, theme, UI scale
   ├─ Platform/    registries (extension points), built-in registration, safe mode, debug handle
   ├─ Store/       zustand: session, desktop data, windows, UI state, per-device settings
   ├─ Desktop/     wallpaper, icons, context menus, dialogs, Overlays
   ├─ Windows/     window manager (frames, drag/resize, iframe content)
   ├─ Taskbar/ StartMenu/ Phone/
   ├─ Apps/<Name>/ built-in apps behind Apps/Registry.ts
   └─ Widgets/<Name>/ widgets behind Widgets/Registry.ts
Shared/src        types, zod schemas, constants, WebSocket message types
```

## Request flow

1. The client loads `index.html` (always uncached) and hashed assets (immutable).
2. `GET /api/auth/session` decides between the lock screen and the desktop. Login sets a signed, httpOnly, `SameSite=Strict` cookie whose value is a random session id stored in SQLite.
3. `GET /api/desktop` returns everything the desktop needs in one call: shortcuts, widgets, settings, window memory, integration flags, version.
4. Layout changes (`PUT /api/shortcuts/positions`, `PATCH /api/widgets/:id`, `PUT /api/window-memory/:appKey`) are debounced client-side and persisted server-side.

## Taskbar

`Client/src/Taskbar/Taskbar.tsx` renders one of four styles from `settings.taskbar` (floating pill, Windows 10 and 11 docked bars, macOS-like dock) on any edge, in three sizes, with auto-hide. Every part (launcher, apps, tray, clock) sits in its own error boundary. The bar writes `data-taskbar-position` / `data-taskbar-style` and `--taskbar-height` onto `<html>`, which the start menu CSS reads to open from the right edge. `TaskbarApps.tsx` merges the pinned keys (`settings.taskbar.pinned`, "app:<id>" or "shortcut:<id>") with the open window groups: a pinned item launches when nothing runs and shows a dot when something does; pinned items reorder by dragging along the bar (`togglePin`/`isPinned` are shared with the context menus of shortcuts and launcher entries). `TaskbarTray.tsx` renders `registries.trayItems` minus `settings.taskbar.trayHidden`; the built-in CPU/memory meter is registered in `Platform/BuiltIns.ts`. `UseDockMagnify.ts` drives the dock style with one spring per icon (off under reduced motion). `UseTaskbarSettings.ts` returns the settings in effect; safe mode falls back to the floating bar.

**Work area:** `Desktop/WorkArea.ts` computes what the taskbar takes from its edge (`taskbarInset` in `Shared/src/Snap.ts`: bar plus a margin for floating styles, the bar alone for docked ones, nothing when auto-hiding). `workArea()` is the viewport minus that inset; maximized and snapped windows fill it, the desktop surface shrinks to it (so the grid never runs under a top or left bar), and `DesktopGrid.surfaceOrigin()` converts pointer positions to grid cells.

**Debugging:** `document.documentElement.dataset` shows the active position and style; `landscapeDebug.stores.desktop.getState().settings.taskbar` the settings. `Settings → Taskbar` renders the real component in a scaled preview (`<Taskbar preview={…}>` never touches `<html>` or the window).

## Windows

The window manager is hand-written. Windows are rendered in creation order with stable React keys so iframes never remount when the z-order changes; stacking uses `z-index`. Minimized windows stay mounted with `visibility: hidden`. Drag and resize use pointer capture; while interacting, a transparent overlay covers every iframe so the frames cannot swallow pointer events. Open/close/minimize animations are driven by `Design/Spring.ts`, a frame-rate-independent spring solver with Carbon's `response`/`dampingFraction` parameters. Each app or shortcut remembers its last geometry (`window_memory` table); new windows cascade when a sibling is already open (Settings → Windows → Cascade) and open maximized when that setting is on. **Snapping:** while a window is dragged, `Shared/src/Snap.ts → snapZoneAt` turns the pointer position into a zone (left/right half, a quarter at a corner, the whole area at the top edge); `Windows/SnapOverlay.tsx` shows the translucent target, and releasing calls `useWindowStore.snapTo`. The keyboard uses the same store (`snapKeyboard`: left/right halves, up maximizes, down restores or minimizes). `Windows/WindowMotion.ts` maps Settings → Windows → Animation (normal, fast, off) onto the spring configs; reduced motion always wins. `TitleBar.tsx` renders traffic lights or Windows-style buttons on the right (`settings.windows.buttons`).

## Embed proxy

Shortcuts that cannot be framed directly are shown through a transparent pass-through proxy on their own port, so the app keeps requesting absolute paths and runs on a separate origin.

- `Proxy/Assignments.ts` — pure planning: which shortcut holds which port. A shortcut wants a port in mode `proxy`, or in `auto` when the embed check says `no`. Valid assignments are kept; free ports go out lowest first, explicit `proxy` before `auto`, oldest first; the rest wait.
- `Proxy/ProxyService.ts` — applies the plan to the `shortcuts.proxy_port`/`proxy_tag` columns (migration 2) and hands the routes to the manager. `reconcile()` runs at startup (which assigns ports to existing blocked shortcuts after an upgrade or a range change) and after every shortcut create/update/recheck/delete. A new target origin releases the assignment first, so it gets a new cookie tag.
- `Proxy/ProxyManager.ts` — one entry per assigned port, **listener on demand**. A port opens on the first lease (`POST /api/proxy/leases`, sent by a proxied window before its iframe loads) and is re-targeted in place when its shortcut changes. A sweep every 5 s expires leases that were not renewed (TTL 150 s, renewed every 20 s) and closes a port once no lease is alive, no request or WebSocket is active, and the idle grace period (`settings.proxy.idleGraceSeconds`, default 60) has passed since the last use. Idle keep-alive sockets do not count and are destroyed on close. A port that cannot be bound reports `error` and is retried by the next lease or renewal.
- `Proxy/Leases.ts` — pure bookkeeping: the lease table (time passed in) and `idleDecision`, which also produces the reason shown in Settings → Proxy ("In use by 1 window", "Idle, closes in 42 s"). Unit-tested in `Tests/Server/ProxyLeases.test.ts`; open and close against real sockets in `ProxyOnDemand.test.ts` (it calls `ctx.proxy.sweep(time)` to skip ahead).
- `Proxy/Listener.ts` — `node:http` server; streams requests to the target with `node:http`/`node:https` (keep-alive agents, self-signed certificates accepted), 60 s until response headers, 15 min idle while streaming; WebSocket upgrades are piped as raw sockets after the handshake. No third-party proxy library: the rewriting needs full control over headers, and Node's primitives cover streaming and upgrades.
- `Proxy/Rewrite.ts` — pure functions for request headers (Host/Origin/Referer, cookie filtering), response headers (framing headers, `Set-Cookie`, `Location`) and CSP stripping.

On the client, `Windows/ShortcutFrame.ts` decides per shortcut between a direct iframe, `http://<location.hostname>:<port><path>` and a "can't embed" panel; `Windows/UseProxyLease.ts` leases the port before the proxied iframe gets its `src`, renews it (and right away when the tab becomes visible again), leases again after a 404, and releases it on close and on `pagehide`; `Windows/ProxyBadge.tsx` marks proxied windows in the title bar and phone header.

**Debugging a proxy port:** Settings → Proxy shows each port's state and reason (refreshing every 5 s). `GET /api/proxy` returns the same with lease and connection counts. The server logs "Embed proxy port opened / closed (idle) / could not be opened" with the port number.

## Desktop layout

Desktop items (shortcuts, folders, widgets) are stored as **anchored positions** (`Shared/src/Layout.ts`): `{ anchorX: left|center|right, anchorY: top|center|bottom, offsetCol, offsetRow }` in grid cells, never in pixels. `cellFromAnchor` resolves a position for the bounds of the screen in use (an item one cell from the right edge is one cell from the right edge on every monitor; a centered item stays centered); `anchorFromCell` stores the anchor for the cell an item was dropped on, choosing the anchor from the third of the screen that holds the item's center. Migration 3 turned the old pixel positions into top-left anchors (`offset = round((px − 16) / unit)`), so an upgrade moves nothing; **Settings → Desktop → Re-anchor layout for this screen** rewrites every anchor from the cells currently shown (`DesktopGrid.reanchorForThisScreen`).

The grid cell follows **Settings → Desktop** (`gridMetrics(iconSize, density)` in `Shared/src/Grid.ts`; medium/normal is the original 96 × 112). `Client/src/Desktop/DesktopGrid.ts` is the one place that resolves anchors on the client: `computeDisplayLayout` (resolve, clamp into the viewport, step aside on collisions), `occupiedCells`, `resolveOverlaps` (one-time untangle of stored collisions) and `folderAtCell` (drop target). `UseGridDrag.ts` drives free dragging with a snap outline; on drop it commits `positionForCell(cell)`; shortcuts dropped on a folder icon move inside instead. Moves go through `useDesktopStore.moveItem(s)` and are batched into `PUT /api/desktop/positions`.

**Widgets** declare cell spans per size step (`WidgetDefinition.sizes: { s?, m, l? }`); the frame's context menu offers the steps a type declares, `widget.size` is stored, and each component adapts to `widget.size`. **Folders** (`folders` table, `shortcuts.folder_id`) are one-cell items; `FolderIcon` shows up to four contained icons, `FolderPopover` lists the contents next to the icon, and dragging a tile out of the popover drops it on the nearest free cell. Deleting a folder moves its shortcuts back onto free cells.

**Debugging the layout:** `landscapeDebug.stores.ui.getState().displayLayout` holds the cell every item is shown at; `landscapeDebug.stores.desktop.getState().shortcuts[0].position` the stored anchor. `Tests/Server/Layout.test.ts` covers the anchor math and the migration formula, `Tests/E2E/DesktopLayout.spec.ts` the 1440 → 3440 behaviour.

## Appearance

`Design/Theme.ts → applyAppearance` maps the appearance settings onto design tokens on `<html>`: the accent (`--color-accent`, hover/pressed shades, a WCAG-contrast-checked `--color-on-accent`, selection and focus ring tints; `Design/Accent.ts` holds the pure color math) and the material blur (`--blur`, skipped under `prefers-reduced-transparency`). The wallpaper shown comes from `Shared/src/WallpaperSchedule.ts → resolveWallpaper` (time of day → slideshow → fixed choice), computed from the clock alone so every device and the lock screen agree; `Desktop/Wallpaper.tsx` re-evaluates when the slideshow slot or the part of the day changes.

## Metrics

Widgets subscribe over `/ws/metrics` with `{ metric, intervalMs }`. `Metrics/Hub.ts` keeps one timer per metric at the fastest requested interval, samples once, and forwards to each subscriber only when that subscriber's own interval has elapsed. Samplers read the host's `/proc` and `/sys` (mounted read-only); network counters come from `/proc/1/net/dev` (the host's network namespace), addresses from `fib_trie`/`route`/`if_inet6`, disks from `/proc/1/mounts` with usage via `statfs` on the optional host-root mount or `df` over SSH. Every sampler returns `{ available: false, reason }` instead of throwing when something is missing.

## SSH

`Ssh/Connection.ts` pools ssh2 clients and spreads channels (shell, exec, sftp) over them so OpenSSH's `MaxSessions` limit is never hit. Host keys are trusted on first use and pinned in `DATA_DIR/ssh/known_host`. Follow commands (`journalctl -f`) run with a pty so closing the channel ends the remote process. SFTP operations run with the SSH user's permissions; path inputs are normalised to absolute POSIX paths before use.

## Lock, sessions, startup, cursor

- **Lock** (`Server/src/Auth/Sessions.ts`, `Guard.ts`, `AuthRoutes.ts`): see Security.md. On the client, `Store/SessionStore.ts` keeps `status` (`locked` for both "no session" and "locked session") and `hasSession`; `LockScreen.tsx` shows username + password or password only. `Api/Http.ts` turns 401/423 into `lockedByServer`. `Lock/IdleWatcher.ts` counts activity across tabs (BroadcastChannel + localStorage), sends `POST /api/auth/activity` about once a minute while active, and calls `POST /api/auth/lock` after `settings.lock.idleMinutes`. The lock screen look (clock, date, message, blur) is public via the session probe.
- **Startup animation** (`Client/src/Startup/`): `StartupAnimation.tsx` is a full-screen overlay that renders the preset from `registries.startupAnimations` (built-ins in `Presets.tsx`: logo fade, boot log, particles, wallpaper zoom, progress line; apps add their own), ends after `durationMs` with a hard ceiling, skips on click/key, becomes a short fade under reduced motion, and is skipped in safe mode. `App.tsx` plays it on page load when the probe returns `startup` (`when` is load/both); `AfterLoginAnimation.tsx` plays it once per login/unlock (`unlockCount`). `Sound.ts` synthesizes the chime with WebAudio or plays the upload; on page load only when the browser already saw a user gesture. Per device: the sound switch (`DeviceStore.startupSound`).
- **Cursor** (`Client/src/Cursor/`): `CursorSets.ts` holds three hand-drawn SVG sets (system = none, soft rounded, large high-contrast); `ApplyCursor.ts` writes one `<style id="landscape-cursor">` with `cursor: url(...) x y, fallback` rules per state (default, pointer, text, move, resize, busy) and scales the SVG data URLs by the per-device `cursorScale`; `UseCursor.ts` re-applies on changes. "custom" uses the uploads in `settings.cursor.custom`. Iframes keep their own cursor (browser rule).
- **Uploads** for these live in `DATA_DIR/startup` and `DATA_DIR/cursors` (`Desktop/MediaStore.ts`, `MediaRoutes.ts`), sniffed by magic bytes (`sniffImageType`, `sniffMediaType`).

**Debugging:** `GET /api/auth/session` shows `locked`; `GET /api/auth/sessions` lists sessions with `lastSeenAt`; the server logs "Session locked" / "Session revoked". `document.getElementById('landscape-cursor')` holds the cursor CSS; `[data-startup-animation]` is the overlay.

## Keyboard shortcuts

`Shared/src/Keyboard.ts` lists every rebindable action (`SHORTCUT_ACTIONS`, with defaults on Ctrl+Alt because the browser reserves the Windows key and plain Ctrl combinations) and the pure helpers: `parseCombo`/`formatCombo` ("Ctrl+Alt+ArrowLeft"), `comboFromEvent`, `effectiveBindings` (overrides from `settings.keyboard.bindings`, "" unbinds), `findConflicts`, `isReservedCombo`, `matchShortcut`. `Client/src/Platform/Keyboard.ts` installs one document-level keydown listener that reads the bindings on every press and calls the handler registered for the action (`registerShortcutHandler`); `Desktop/DesktopShortcuts.ts` registers the desktop's handlers. Settings → Keyboard Shortcuts records a combo from the next key press, shows conflicts on both rows, and resets by writing the default back. Keys inside an iframe never reach the document; that is a browser limit.

## Extension points (registries)

`Client/src/Platform/Registry.ts` is a small observable map; `Platform/Registries.ts` creates one per extension point: `apps`, `widgets`, `taskbarItems`, `trayItems`, `startupAnimations`, `cursorSets`, `themes`, `wallpapers`, `actions`. Built-ins register at start-up (`Platform/BuiltIns.ts` calls `registerBuiltinApps()` from `Apps/Registry.ts` and `registerBuiltinWidgets()` from `Widgets/Registry.ts`). Catalog apps will register the same way from their manifest, tagged with `source: { kind: 'app', appId }`, so `unregisterApp` can remove everything an app contributed. Components read with `useRegistry(registries.apps)` or `useRegistryEntry(…)`, so a later registration shows up without a reload.

The server keeps no app or widget list: ids only have to match `APP_ID_PATTERN` / `WIDGET_TYPE_PATTERN` (`Shared/src/AppIds.ts`). `enabledApps` stores only the apps that are switched off. New widgets carry their default interval from the client (`WidgetDefinition.defaultIntervalMs`).

## Settings

- **Server-wide** (`Shared/src/Settings.ts`): one zod schema per top-level key plus `DEFAULT_SETTINGS`. Each key is one JSON row in the `settings` table (`SettingsRepository`). Reading merges stored values over the defaults field by field and falls back to the default when a value no longer validates, so old databases and new fields need no migration. `PATCH /api/settings` takes a partial patch (`settingsUpdateSchema`, strict) and merges per group (`applySettingsPatch`, which the client also uses for its optimistic update). To add a setting: add the field, its default and its patch field, then the UI.
- **Per device** (`Client/src/Store/DeviceStore.ts`): things that differ per screen (UI scale now; notification mode, cursor size and startup sound later). Stored in `localStorage` under `landscape.device.<deviceId>` (the id is generated once and kept in `landscape.deviceId`), parsed field by field so one bad value does not reset the others, and never synced. Shown with the "This device" tag (`Apps/Settings/SettingRow.tsx`).
- **Settings app** sections are data: `Apps/Settings/Sections.ts` (id, label, icon, lazy component). Each section renders inside its own error boundary. `openApp('settings', { section: 'proxy' })` opens a section directly.

**UI scale** is CSS `zoom` on `<html>` (`Design/Scale.ts`). Under zoom, pointer coordinates, `getBoundingClientRect()` and `window.innerWidth` are screen pixels while CSS lengths are layout pixels. `usePointerDrag`, `useViewportSize`, `workArea()`, the desktop grid, the window minimize target and `Menu` convert with `toLayout()` / `layoutViewport()`. New code that turns a screen measurement into a CSS position must do the same.

## Crash isolation and safe mode

`Components/ErrorBoundary.tsx` wraps every window's content, every widget (inside its frame, so it can still be moved and removed), each taskbar part and each Settings section. A crash shows "<label> stopped working" with **Reload** (mounts the subtree again) and **Copy details** (label, error, stack, component stack, browser and the last ten failures). Taskbar items use the compact variant, an icon that reloads on click.

`Platform/SafeMode.ts`: `?safe=1` (or "Start in safe mode" on the lock screen) turns safe mode on for the tab (kept in `sessionStorage`); `?safe=0` or the banner's **Leave safe mode** turns it off. Every customization checks `isSafeMode()` before it applies. Today that is the UI scale; later milestones add catalog apps, cursor, startup animation and taskbar style.

## Debugging

- `landscapeDebug` in the browser console (`Platform/DebugHandle.ts`): `registries` (for example `landscapeDebug.registries.apps.list()`), `stores` (`desktop`, `windows`, `ui`, `device`; zustand stores, read with `.getState()`) and `isSafeMode()`. The E2E tests use it to register a deliberately failing widget.
- Server logs are JSON (pino) on stdout; `LOG_LEVEL=debug` adds proxy request failures and similar detail. Secrets are never logged.

## Persistence

`Db/Database.ts` wraps `node:sqlite` (WAL mode). Migrations are an ordered list in `Db/Migrations.ts` keyed by `PRAGMA user_version`. Repositories in `Db/Repositories/` map rows to the shared types.
