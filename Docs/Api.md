# HTTP and WebSocket API

All routes except the ones marked *public* require a valid session cookie. State-changing requests and WebSocket upgrades must also carry a same-origin `Origin` header. Errors are `{ "error": { "code", "message", "details?" } }`.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | public; body `{ username, password }`; 401 on wrong credentials (`details.attemptsRemaining`), 429 when locked (`details.retryAfterSeconds`) |
| POST | `/api/auth/logout` | deletes the session |
| GET | `/api/auth/session` | public; `{ authenticated, locked, username, lockScreenWallpaper, lockScreen: { clock, showDate, message, blur }, startup }` (`startup` is the animation to play on page load, or null) |
| POST | `/api/auth/lock` | marks the session locked: every other route answers `423 locked` until unlock |
| POST | `/api/auth/unlock` | `{ password }`; same lockout as login; 401 on a wrong password |
| POST | `/api/auth/activity` | heartbeat from an active tab (about once a minute) so the server-side idle lock does not fire while the user is present |
| GET | `/api/auth/sessions` | `[{ key, device, userAgent, createdAt, lastSeenAt, expiresAt, locked, current }]`; keys are opaque, never the cookie value |
| DELETE | `/api/auth/sessions/:key` | revokes one session (400 for the current one: use logout) |
| DELETE | `/api/auth/sessions` | revokes every other session; `{ ok, revoked }` |
| GET | `/healthz` | public; `{ ok: true }` for the Docker health check |

## Desktop

| Method | Path | Notes |
|---|---|---|
| GET | `/api/desktop` | bootstrap: shortcuts, widgets, folders, settings, windowMemory, integrations, proxy (`{ start, end }`), version |
| GET/POST | `/api/shortcuts` | create runs the embed check and fetches the favicon. Optional `position` (anchored), `folderId` and `healthCheck` (default true). `openMode` is `auto \| embed \| proxy \| newtab`; the response carries `proxyPort` (number or null). `openMode: "proxy"` with no free port → 409 `All N proxy ports are in use — …` |
| PATCH/DELETE | `/api/shortcuts/:id` | URL changes re-run the embed check; a new origin renews the proxy assignment. `openMode: "proxy"` with no free port → 409 |
| POST | `/api/shortcuts/check-embed` | `{ url }` → `{ status: yes|no|unknown, reason, finalUrl, title }` |
| POST | `/api/shortcuts/:id/recheck`, `/refresh-icon` | recheck always reports the *direct* result, also for proxied shortcuts |
| PUT | `/api/desktop/positions` | `{ items: [{ kind: shortcut\|widget\|folder, id, position }] }` where `position` is `{ anchorX: left\|center\|right, anchorY: top\|center\|bottom, offsetCol, offsetRow }` (grid cells, see [Architecture → Desktop layout](Architecture.md#desktop-layout)) |
| POST/PATCH/DELETE | `/api/folders[/:id]` | `{ name, position? }`; DELETE puts the folder's shortcuts back on the desktop and returns `{ ok, shortcuts }` |
| POST | `/api/uploads/icon`, `/api/uploads/wallpaper` | multipart `file`; PNG/JPEG/SVG/WebP ≤ 2 MB, PNG/JPEG/WebP ≤ 20 MB |
| POST | `/api/uploads/media/:kind` | multipart `file`; `image` (PNG/JPEG/WebP/SVG/GIF ≤ 5 MB), `video` (WebM/MP4 ≤ 15 MB), `sound` (MP3/OGG/WAV ≤ 2 MB), `cursor` (PNG/SVG ≤ 256 KB); types are sniffed → `{ file, mime, url }` |
| GET/DELETE | `/api/uploads/media[/:kind/:file]` | list per kind / delete one |
| GET | `/startup/:file` (public), `/cursors/:file` | startup media is public because the animation can play before login |
| GET | `/icons/:file` | stored icons |
| GET | `/wallpapers/bundled/:file` (public), `/wallpapers/upload/:file` | |
| GET | `/api/wallpapers`; DELETE `/api/wallpapers/:file` | |
| POST/PATCH/DELETE | `/api/widgets[/:id]` | `{ type, position, size: s\|m\|l, settings }` |
| PUT | `/api/window-memory/:appKey` | `{ x, y, width, height, maximized }`; appKey is `shortcut:<id>` or `app:<id>` |
| GET/PATCH | `/api/settings` | Complete settings on GET (`Shared/src/Settings.ts` holds the schema and defaults). PATCH takes a partial object: top-level keys are optional and groups may name only the fields that change, e.g. `{ proxy: { idleGraceSeconds: 120 } }`. Unknown keys → 400. Currently: `theme`, `wallpaper`, `enabledApps` (only apps switched off; missing ids are enabled), `proxyIndicator: badge\|none`, `proxy: { idleGraceSeconds: 10–3600 }`, `appearance: { accent: preset\|#rrggbb, blur: 0–40, slideshow: { enabled, intervalMinutes, order: sequence\|shuffle, wallpapers[] }, timeOfDay: { enabled, morning, day, evening, night } }`, `desktop: { iconSize: s\|m\|l, labels: show\|hide\|shadow, openWith: single\|double, showIcons, density: compact\|normal\|roomy }`, `taskbar: { style: floating\|win10\|win11\|dock, position: bottom\|top\|left\|right, autoHide, size: s\|m\|l, showTitles, clock: { seconds, hours: auto\|12\|24, showDate }, pinned: ["app:<id>" \| "shortcut:<id>"], trayHidden: [<tray item id>] }`, `windows: { animation: normal\|fast\|off, buttons: mac\|windows, openMaximized, cascade }`, `keyboard: { bindings: { "<action id>": "Ctrl+Alt+ArrowLeft" \| "" } }` (a missing action id means its default; "" unbinds), `startup: { when: never\|load\|login\|both, preset, durationMs, speed, skippable, background, foreground, text, logoFile, sound: { kind: none\|chime\|upload, file, volume } }`, `cursor: { set: system\|soft\|contrast\|custom\|<app set>, custom: { <state>: { file, hotspotX, hotspotY } } }`, `lock: { idleMinutes, clock: none\|digital\|large, showDate, message, blur }`, `security: { sessionDays }`, `notifications: { dnd, watchers: { docker, disk: { enabled, percent }, temperature: { enabled, celsius }, monitors } }`, `monitor: { intervalSeconds }` |
| GET | `/api/proxy` | `{ start, end, total, used, ports: [{ port, shortcutId, name, target, state: closed\|opening\|open\|error, listening, error, reason, leases, connections, closesInMs }], waiting: [{ shortcutId, name }] }` |
| POST | `/api/proxy/leases` | `{ shortcutId }` → 201 `{ leaseId, port, ttlMs }` once the port accepts connections. 404 unknown shortcut, 409 the shortcut has no proxy port, 503 `proxy_port_unavailable` when the port cannot be bound |
| POST | `/api/proxy/leases/:id/renew` | heartbeat (the client sends one every 20 s); `{ ok, port }`, 404 when the lease expired (lease again) |
| DELETE | `/api/proxy/leases/:id` | the window closed; the port closes after the idle grace period |
| GET | `/api/system/status`, `/api/system/version` | integration checks (SSH probe included) |

## Notifications and monitor

| Method | Path | Notes |
|---|---|---|
| GET | `/api/notifications` | `{ notifications: [{ id, source, level, title, body, createdAt, readAt, data }], unread }` (newest first, last 200 of 500 kept) |
| POST | `/api/notifications` | `{ title, body?, level?: info\|warning\|error, source?: "test" \| "app:<id>", data? }` → 201; pushed to every client |
| POST | `/api/notifications/read` | `{ ids: [..] \| "all" }` |
| DELETE | `/api/notifications` | clears the history |
| GET | `/api/monitor` | `{ intervalSeconds, statuses: [{ target: { id, kind: http\|ping, label, address, owner }, state: up\|down\|unknown, checkedAt, latencyMs, reason, history: [{ at, up, latencyMs }] }] }` |
| GET | `/api/monitor/:id/history` | one status with its history |
| POST | `/api/monitor/check` | checks every target now |
| POST/DELETE | `/api/monitor/targets[/:id]` | apps register `{ id: "<appId>:<key>", kind, label, address, owner: "<appId>" }`; shortcut targets (`shortcut:<id>`) follow the shortcut's `healthCheck` flag |

## Docker and processes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/docker/containers` | includes `service` (compose service) and `icon` (from CasaOS / common icon labels) |
| POST | `/api/docker/containers/:id/(start\|stop\|restart)` | |
| POST | `/api/processes/:pid/kill` | `{ signal: TERM|KILL }`, runs `kill` over SSH |

## Files (SFTP)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/files/home` | SSH user's home |
| GET | `/api/files/list?path=` | sorted listing, symlinked directories resolved |
| GET | `/api/files/stat?path=` | |
| GET | `/api/files/read?path=` | text ≤ 2 MB, rejects binary |
| PUT | `/api/files/write` | `{ path, content }` |
| GET | `/api/files/download?path=` | attachment stream |
| GET | `/api/files/raw?path=` | inline preview with the right content type (SVG gets a restrictive CSP) |
| POST | `/api/files/upload?dir=` | multipart stream, up to 2 GB |
| POST | `/api/files/mkdir`, `/rename`, `/delete` | `{ dir, name }`, `{ path, name }`, `{ paths }` |

## Embed proxy ports

Not part of the API: each port in `PROXY_PORT_START`–`PROXY_PORT_END` that is assigned to a shortcut, and currently open (see the lease routes above), forwards every request and WebSocket upgrade to that shortcut's origin, after checking the LANdscape session cookie (`401` HTML page otherwise). See [Security.md](Security.md#embed-proxy) for the header and cookie rewriting.

## WebSockets

- `/ws/metrics` — client `{ type: "subscribe", metric, intervalMs }` / `{ type: "unsubscribe", metric }`; server `{ type: "sample", metric, at, data }`, `{ type: "unavailable", metric, reason }`.
- `/ws/terminal?cols&rows` — binary frames are terminal bytes both ways; text frames `{ type: "resize", cols, rows }`; server `{ type: "ready" | "exit" | "error" }`.
- `/ws/events` — server → client only: `{ type: "notification", notification }`, `{ type: "notifications-read", ids }`, `{ type: "notifications-cleared" }`, `{ type: "monitor-status", status }`, `{ type: "monitor-targets" }` (re-fetch the list), `{ type: "settings-changed" }`.
- `/ws/logs` — client `{ type: "open", source: "docker", containerId, tail, follow }` | `{ source: "journal", unit, lines, follow }` | `{ source: "file", path, follow }` | `{ type: "close" }`; server `{ type: "chunk", text }`, `{ type: "end", reason }`, `{ type: "error", message }`.

Message shapes live in `Shared/src/WsMessages.ts`; validation schemas in `Shared/src/Schemas.ts`.
