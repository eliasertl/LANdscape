# Roadmap: customizable, extensible desktop

This is the plan for turning LANdscape into a customizable desktop platform with an App Store. It is split into eight milestones, one branch and one pull request each. The house rules in `AGENTS.md` apply to every milestone. Each milestone also updates the docs it touches (`README.md`, `Docs/*.md`).

Status legend: ☐ planned · ◐ in progress · ☑ merged

| # | Branch | Scope | Status |
|---|---|---|---|
| 1 | `feature/foundations` | A1 settings model, A2 crash isolation and safe mode, A3 registries, A4 on-demand proxy ports | PR #2 |
| 2 | `feature/desktop-and-look` | B1 anchored layout, B2 resizable widgets, B3 folders, B4 desktop settings, B5 appearance extras | PR #3 |
| 3 | `feature/taskbar-windows-keyboard` | C1–C5 taskbar styles and options, snapping, window settings, rebindable shortcuts | PR #4 |
| 4 | `feature/startup-cursor-lock` | D1–D4 startup animation, cursors, server-side lock, sessions | PR #5 |
| 5 | `feature/notifications-actions` | E1–E4 notification center, monitor service and health dots, actions and command palette, Docker → shortcut | PR #6 |
| 6 | `feature/app-platform` | F1–F7 manifest, sandbox and broker, permissions, install/update/uninstall, catalog, App Store, SDK and docs (+ G3 demo packs) | ◐ |
| 7 | `feature/catalog-apps` | G1 four converted apps, G2 five new catalog apps | ☐ |
| 8 | `feature/in-app-update` | H in-app update with rollback | ☐ |

When a milestone's PR is not merged yet, the next branch starts from it and the PR description says so. Milestone 1 starts from `fix/proxy-frame-busting` (two unmerged proxy fixes that touch the same files as A4).

## Guiding decisions

- **Server-side settings stay a key/value table.** Every settings group (`desktop`, `taskbar`, …) is one JSON value under its own key. A single zod schema in `Shared/src/Settings.ts` defines the shape *and* the defaults, so reading an old database returns a complete object, and an upgrade changes nothing visible (defaults equal today's behaviour). `PATCH /api/settings` takes a deep-partial patch, validates it against the same schema and merges per group.
- **Per-device settings live in `localStorage`** under `landscape.device.<deviceId>` (the id is generated once and also stored in `localStorage`), are validated with zod on read and never sync. Every access is wrapped in `try/catch`; a broken or missing store falls back to the defaults. These settings are labelled **This device** in the UI.
- **One registry primitive.** `Client/src/Platform/Registry.ts` is a small observable map (`register`, `unregister`, `get`, `list`, `subscribe`, React hook `useRegistry`). Built-ins register at start-up from their own folders. Catalog apps register the same way from their manifest in milestone 6. Shared id lists (`APP_IDS`, `WIDGET_TYPES`) shrink to the *built-in* ids. The schemas accept any well-formed id (`^[a-z0-9][a-z0-9-]{0,47}$`, widgets optionally `<appId>/<name>`).
- **Isolation by boundary.** Every surface that renders third-party or user-configured code (window, widget, taskbar or tray item, startup animation, app frame) sits inside `Components/ErrorBoundary.tsx`. Safe mode (`?safe=1`) is one flag (`Platform/SafeMode.ts`) that every customization checks before it applies.
- **Pure logic is separated from I/O** so it can be unit-tested with fixtures: proxy leases, anchor math, the permission broker, manifest parsing, catalog parsing, update rollback decisions.

## Milestone 1 — Foundations

**A1 Settings.** `Shared/src/Settings.ts`: `settingsSchema` (full, with defaults) and `settingsPatchSchema` (deep partial). New in this milestone: `proxy.idleGraceSeconds` (default 60, 10–3600). Later milestones add their groups to the same schema. Per-device layer: `Client/src/Store/DeviceStore.ts` (zustand + localStorage) with `deviceSettingsSchema`. The first per-device setting is UI scale, so the layer is used from the start. The other per-device settings arrive with their features (notification mode in M5, cursor size and startup sound in M4). The Settings app gets a data-driven section list (`Apps/Settings/Sections.ts`: id, label, icon, component, optional `phone`/`available` predicate). A section appears once it has content, so the twelve target sections fill in milestone by milestone.

**A2 Crash isolation.** `ErrorBoundary` with a compact card (what failed, "Reload" re-mounts the subtree, "Copy details" copies name, message, stack and version). Wrapped: each window's content, each widget, the taskbar (per item from M3), and app frames and startup animations once they exist. Safe mode: `?safe=1` or the lock-screen link "Start in safe mode". It is kept for the tab in `sessionStorage`, so reloads stay safe. A banner has a "Leave safe mode" button. In safe mode, catalog apps, custom cursor, startup animation and custom taskbar style are skipped (each feature checks `isSafeMode()`).

**A3 Registries.** `Platform/Registries.ts` creates: `apps`, `widgets`, `taskbarItems`, `trayItems`, `startupAnimations`, `cursorSets`, `themes`, `wallpapers`, `actions`. `Apps/Registry.ts` and `Widgets/Registry.ts` keep their built-in lists but register them into the registries. Everything that used to read `APPS`/`WIDGETS` or `getApp` now reads the registry. Server: `enabledApps` becomes `Record<string, boolean>`, the widget type is any valid id, and default intervals fall back to a generic value for unknown types.

**A4 On-demand proxy ports.** The assignment (port + cookie tag) stays in `shortcuts.proxy_port/proxy_tag`. The listener opens only on demand:

- `Proxy/Leases.ts` (pure): a lease table with an injected clock. `acquire(port) → leaseId`, `renew(id)`, `release(id)`, `alive(port)`, `expire(now)`. A lease dies 45 s after its last heartbeat.
- `Proxy/ProxyManager.ts`: an entry per assigned port in state `closed | opening | open | error`. It opens on the first lease. A 5 s sweep closes the listener once there is no live lease, no in-flight request, no upgraded (WebSocket) socket, and the last activity is older than the grace period. Idle keep-alive sockets are not counted and are destroyed on close.
- Routes: `POST /api/proxy/leases { shortcutId }` → `{ leaseId, port, ttlMs }` (waits until the port listens; 409 when the shortcut has no port; 503 with the bind error), `POST /api/proxy/leases/:id/renew`, `DELETE /api/proxy/leases/:id`.
- Client: `Windows/UseProxyLease.ts` acquires the lease before the proxied iframe gets its `src`, renews every 15 s and releases on unmount. A lost lease is re-acquired transparently.
- `GET /api/proxy` reports per port `state` and `reason` (for example "Open — 1 window", "Open — 2 active connections", "Closing in 42 s", "Closed — no window uses it"). Settings → Proxy shows them and the grace-period setting.

Tests: `ProxyLeases.test.ts` (pure lease and idle decisions), `ProxyOnDemand.test.ts` (connection refused before a lease and after the grace period, reopened with the same cookie prefix), and the existing proxy E2E test still logs in after a reopen.

## Milestone 2 — Desktop and look

**B1 Anchored layout.** Migration adds `anchor_x`, `anchor_y`, `offset_col`, `offset_row` to `shortcuts` and `widgets` and fills them from `x`/`y` as top-left anchors (`offset = round((px − origin) / unit)`), so nothing moves. Pure functions in `Shared/src/Layout.ts`:

- `cellFromAnchor(pos, size, bounds)`: left → `offset`; right → `bounds.cols − size − offset`; center → `floor((bounds.cols − size) / 2) + offset`. Rows work the same way.
- `anchorFromCell(cell, size, bounds)`: the anchor comes from the third of the screen that holds the item's center.

Display layout, collision stepping and clamping run on resolved cells. `PUT /api/desktop/positions` takes `{ items: [{ kind, id, anchorX, anchorY, offsetCol, offsetRow }] }`. The work area comes from `Desktop/WorkArea.ts` (taskbar edge, size, auto-hide; constant until M3). Settings → Desktop → "Re-anchor layout for this screen" recomputes every anchor from the currently shown cells. Tests: anchor math round-trips, edge and center stability from 1440 to 3440 px, migration.

**B2 Resizable widgets.** `WidgetDefinition.sizes: { s?, m?, l? }` as cell spans plus `defaultSize`. `widgets.size` column. A size picker in the context menu. Placement goes through `findNearestFree`.

**B3 Folders.** `folders` table (`id, name, anchor…, created_at`), `shortcuts.folder_id` (nullable, `ON DELETE SET NULL`). Routes `POST/PATCH/DELETE /api/folders[/:id]`. Deleting a folder moves its shortcuts to the nearest free cells. A one-cell icon opens a popover grid. Shortcuts are dragged in (drop on the folder) and out (drag out of the popover).

**B4 Desktop settings.** `desktop.iconSize` (s/m/l), `desktop.labels` (show/hide/shadow), `desktop.openWith` (single/double), `desktop.showIcons`, `desktop.density` (compact/normal/roomy). The grid unit is derived from icon size × density (`Shared/src/Grid.ts` takes a `GridMetrics` argument). Anchors keep the layout coherent when the unit changes.

**B5 Appearance extras.** `appearance.accent` (preset id or hex) with a contrast-checked label color (WCAG luminance, white or black text), `appearance.slideshow` (`{ enabled, intervalMinutes, order, wallpapers[] }`), `appearance.timeOfDay` (`{ enabled, morning, day, evening, night }`), `appearance.blur` (0–40 px). UI scale is per device (from M1). All of them map to tokens (`--color-accent`, `--color-on-accent`, `--material-blur`).

Verification at 1440×900 and 3440×1440.

## Milestone 3 — Taskbar, windows, keyboard

- **C1 Styles** `taskbar.style`: `floating | win10 | win11 | dock`. One `Taskbar.tsx` that composes the slots (launcher, pinned and running apps, tray, clock) from the style's layout description. Dock magnification is spring-driven (`Design/Spring.ts`) and off under reduced motion. Settings → Taskbar has a live preview (a scaled-down render of the real component).
- **C2 Options** `taskbar.position` (bottom/top/left/right), `autoHide`, `size` (s/m/l), `showTitles`, `clock { seconds, hour12, showDate }`, `pinned: string[]` (app keys), `tray { hidden: string[] }`. Tray items are registry entries: notification bell (M5), CPU/RAM mini meter, service-health summary (M5). `Desktop/WorkArea.ts` returns the reserved inset per edge. Maximize and snap use it.
- **C3 Snapping** `Windows/Snap.ts` (pure: pointer + work area → snap zone rect) with a translucent preview overlay. The keyboard snap default is `Ctrl+Alt+Arrow`.
- **C4 Windows** `windows.animation` (normal/fast/off), `buttons` (mac/windows), `openMaximized`, `cascade`.
- **C5 Keyboard** `keyboard.bindings: Record<actionId, string>`. `Platform/Keyboard.ts` handles parsing, matching, conflict detection and defaults. Settings → Keyboard Shortcuts lets you rebind and reset.

## Milestone 4 — Startup, cursor, lock

- **D1 Startup animation** `startup { when: never|load|login|both, preset, params per preset, skip, sound { kind, file, volume } }`. Built-in presets: logo fade, boot log, particle burst, wallpaper zoom, progress line. Uploads (`POST /api/uploads/startup` for PNG/JPEG/WebP/SVG/GIF ≤ 5 MB, WebM/MP4 ≤ 15 MB, sound MP3/OGG/WAV ≤ 2 MB) are stored in `DATA_DIR/startup/` and served behind the guard. Sound on page load plays only when `AudioContext` is allowed and is otherwise silently skipped. Sound on/off is per device. Reduced motion turns the animation into a short fade. Settings has a "Preview" button.
- **D2 Cursors** `cursor { set, custom: { state: { file, hotspotX, hotspotY } } }`. Three original SVG sets (system, soft rounded, large high-contrast), drawn by hand. Applied through CSS `cursor: url(…) x y, fallback` on `:root` per state. Size is per device (the SVG is rendered at that size into a data URL). Uploads use `POST /api/uploads/cursor` (PNG/SVG ≤ 256 KB, SVG sanitized).
- **D3 Auto-lock** `lock { idleMinutes, clockStyle, showDate, message, blur }`. Migration adds `sessions.locked_at`. `POST /api/auth/lock` locks, `POST /api/auth/unlock { password }` unlocks. While a session is locked, the guard answers `423 locked` on every route except unlock, logout, the session probe and health, and the proxy ports treat it as logged out. Activity is shared across tabs with a `BroadcastChannel` and `localStorage` heartbeats. The idle timer runs client-side, and the server enforces `idleMinutes` as well, from the session's last activity.
- **D4 Sessions** `security.sessionDays` (1–365). `GET /api/auth/sessions` returns device, user agent, last seen and a current marker. `DELETE /api/auth/sessions/:id` and `DELETE /api/auth/sessions?others=1` revoke sessions.

## Milestone 5 — Notifications, health, actions, Docker

- **E1 Notifications** table `notifications (id, source, level, title, body, created_at, read_at, data)`. Routes: `GET /api/notifications`, `POST /api/notifications/read`, `DELETE /api/notifications`, `POST /api/notifications/test`. A new `/ws/events` pushes `notification`, `notification-read`, `monitor-status` and `settings` events. Watchers (`Server/src/Notify/Watchers/`) cover Docker events (`die`/`stop`/`oom`), disk usage and temperature thresholds (metrics hub), and monitor state changes. Settings: `notifications { dnd, watchers { docker, disk { enabled, percent }, temperature { enabled, celsius }, monitors } }`. Mode per device: `html | native`. Native needs `window.isSecureContext` and permission. Otherwise the UI explains it in one line and falls back to HTML.
- **E2 Monitor service** `Server/src/Monitor/`: targets (`shortcut:<id>` or `app:<appId>:<key>`), HTTP via SafeFetch rules (self-signed tolerated, 8 s timeout) or TCP "ping". Interval setting, a ring buffer of the last 288 results per target, and status-change events. `shortcuts.health_check` (default on). Routes: `GET /api/monitor`, `GET /api/monitor/:target/history`.
- **E3 Actions** `Platform/Actions.ts`: `{ id, title, icon, params: zod, provider, run }` in the `actions` registry. The command palette replaces the start-menu search (`Ctrl+Space`): it searches apps, shortcuts and actions and prompts for parameters inline. Actions call the REST API; they never duplicate server logic.
- **E4 Docker → shortcut** "Add as shortcut" per container with published TCP ports. It prefills the shortcut dialog (prettified compose service name, `http://<location.hostname>:<port>`, an icon from the CasaOS `icon` label or common icon labels). A "Shortcut exists" marker and the action `docker.add-shortcut` are included.

## Milestone 6 — App platform and App Store

- **F1 Manifest** `Shared/src/AppManifest.ts` (zod): id, name, version (semver), author, description, icon, categories, permissions, `net.hosts`, and `contributes { windows, widgets, taskbarItems, trayItems, startupAnimations, cursorSets, themes, wallpapers, actions }`. Data-only contributions need no code. SVGs are sanitized with the existing upload checks.
- **F2 Isolation** Every surface is an `<iframe sandbox="allow-scripts">` (opaque origin, no `allow-same-origin`). **Asset delivery: the host injects the bundle, server-side.** The frame's document is a navigation started by LANdscape's own page, so the `SameSite=Strict` cookie is sent for it. `GET /apps/frame/:id/:surface` (behind the guard) answers with the entry HTML. The app's local scripts and stylesheets are inlined, other assets become `data:` URLs, and the SDK bootstrap is injected. The response has its own CSP: `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-ancestors 'self'`. The frame then makes no subresource requests at all, so the missing cookie does not matter, and it has no network access. `srcdoc` and `blob:` frames were rejected because they inherit LANdscape's CSP, which forbids inline scripts. Signed asset URLs were rejected because they are bearer tokens that leak through logs and history, and any page on the same site could reuse them. The RPC broker (`Platform/AppBroker.ts`) validates every message with zod, checks the app's granted permissions on each call, and forwards to the REST/WS API. Pure decision logic in `Shared/src/Permissions.ts` is unit-tested.
- **F3 Permissions** `metrics, docker:read, docker:write, files:read, files:write, ssh:exec, logs, shortcuts, notifications, storage, net:fetch, monitor, actions:invoke, theme:read`. Dangerous: `docker:write, files:write, ssh:exec`. **Trusted** grants every permission, including unrestricted `net:fetch`, but the app stays sandboxed. Server-side enforcement where a call reaches the server through an app proxy endpoint (`storage`, `net:fetch`, `monitor`, `notifications`) is keyed by `X-LANdscape-App` plus a server-side grant check.
- **F4 Install** Tables `apps (id, version, manifest, trusted, granted, source, installed_at, updated_at)` and `app_storage (app_id, key, value)`. Sources: catalog (sha256 verified), URL (SafeFetch, ≤ 20 MB), upload. A zip reader built on `node:zlib` (central directory, deflate/store only, path traversal and size checks), so no dependency is added. Bundles live in `DATA_DIR/apps/<id>/<version>/`. Updates diff the permissions and need re-approval for new ones. Uninstall removes files, storage, monitors, pins and desktop items.
- **F5 Catalog** `Catalog/Apps/<Name>/` sources, `Scripts/src/BuildCatalog.ts` produces `Catalog/dist/<id>-<version>.zip` and `Catalog/index.json`. The server reads `https://raw.githubusercontent.com/eliasertl/LANdscape/main/Catalog/index.json` (cached 10 min) and falls back to the copy bundled in the image.
- **F6 App Store** core app: browse, search, categories, detail, install/update/uninstall, install from URL or file, an Installed tab with the trusted toggle and per-permission revoke.
- **F7 SDK** `Sdk/` workspace (`@landscape/sdk`): RPC client, typed calls per permission, registration helpers, theme tokens. `Docs/AppPlatform.md`, `Docs/AppSdk.md`, `Catalog/Template/`.
- **G3 demo packs** (if time allows): a theme pack, a cursor pack and a startup-animation pack.

## Milestone 7 — Catalog apps

- **G1** Task Manager, Files, Text Editor and Log Viewer move to `Catalog/Apps/` and use only the SDK. Their server logic stays in the core REST API. They are pre-installed and trusted on first start from the bundled catalog. A migration rewrites `enabledApps`, `window_memory` keys and pins to the new ids. Actions: `files.open-path`, `text-editor.open-file`, `task-manager.kill`, `log-viewer.follow`.
- **G2** Weather (Open-Meteo, city search, widget S/M/L), Notes (Markdown, `storage`, sticky widget, "New note" action), Calendar (ICS via `net:fetch`, month and week view, "Next events" widget), Container Stats (new core `GET /api/docker/containers/:id/stats` stream, graphs, widget), Uptime Monitor (core monitor targets, history chart, notifications, widget, tray item).

## Milestone 8 — In-app update

`Server/src/Update/`: `GET /api/update/status` (running version and commit from build args, latest `main` commit via the GitHub API with a timeout and a size cap) and `POST /api/update` (Docker socket required). Steps: tag the current image `landscape:previous`; remote build `landscape:latest` from `https://github.com/eliasertl/LANdscape.git#main` with the log streamed over `/ws/update`; start a helper container from the new image with the socket mounted. The helper inspects the LANdscape container, stops it, and recreates it with an identical config (env, mounts, ports including the proxy range, labels including CasaOS, restart policy, networks). It then waits for `/healthz` and rolls back to `landscape:previous` on failure. The rollback decision is pure (`Update/Plan.ts`) and unit-tested.

## Data model changes (summary)

| Milestone | Change |
|---|---|
| 1 | settings keys `proxy`; no table change (key/value table); per-device settings in localStorage |
| 2 | `shortcuts`/`widgets`: `anchor_x, anchor_y, offset_col, offset_row`; `widgets.size`; table `folders`; `shortcuts.folder_id`; settings `desktop`, `appearance` |
| 3 | settings `taskbar`, `windows`, `keyboard` |
| 4 | `sessions.locked_at`, `sessions.device`; settings `startup`, `cursor`, `lock`, `security`; `DATA_DIR/startup`, `DATA_DIR/cursors` |
| 5 | tables `notifications`, `monitor_results` (or in-memory ring buffer); `shortcuts.health_check`; settings `notifications`, `monitor` |
| 6 | tables `apps`, `app_storage`; `DATA_DIR/apps` |
| 7 | id migration for converted apps |
| 8 | none |

## Risks

- **Scope.** Eight milestones of this size are a lot of surface. Each PR stays reviewable by keeping new code in new modules and changing existing modules only at their seams.
- **Proxy idle detection.** Long-lived requests (SSE, long polling) count as activity, so a port with an open stream stays open even after its window closes. This is correct: the stream is still in use. Idle keep-alive sockets are not counted.
- **Opaque-origin apps.** Some web APIs (`localStorage`, cookies, service workers) are unavailable in opaque-origin frames. The SDK offers `storage` instead. Converted apps that need xterm or CodeMirror bundle them into the app.
- **Self-update.** It depends on Docker API details (remote build, recreating a container with identical config). The helper is careful and rolls back. The README documents the manual fallback.
- **CSS `zoom` for UI scale** changes how pointer coordinates relate to layout. The window manager and drag code divide by the scale where needed. A unit-free check runs in the Playwright click-through.
