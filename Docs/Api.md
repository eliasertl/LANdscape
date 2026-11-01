# HTTP and WebSocket API

All routes except the ones marked *public* require a valid session cookie. State-changing requests and WebSocket upgrades must also carry a same-origin `Origin` header. Errors are `{ "error": { "code", "message", "details?" } }`.

## Auth

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | public; body `{ username, password }`; 401 on wrong credentials (`details.attemptsRemaining`), 429 when locked (`details.retryAfterSeconds`) |
| POST | `/api/auth/logout` | deletes the session |
| GET | `/api/auth/session` | public; `{ authenticated, username, lockScreenWallpaper }` |
| GET | `/healthz` | public; `{ ok: true }` for the Docker health check |

## Desktop

| Method | Path | Notes |
|---|---|---|
| GET | `/api/desktop` | bootstrap: shortcuts, widgets, folders, settings, windowMemory, integrations, proxy (`{ start, end }`), version |
| GET/POST | `/api/shortcuts` | create runs the embed check and fetches the favicon. Optional `position` (anchored) and `folderId`. `openMode` is `auto \| embed \| proxy \| newtab`; the response carries `proxyPort` (number or null). `openMode: "proxy"` with no free port → 409 `All N proxy ports are in use — …` |
| PATCH/DELETE | `/api/shortcuts/:id` | URL changes re-run the embed check; a new origin renews the proxy assignment. `openMode: "proxy"` with no free port → 409 |
| POST | `/api/shortcuts/check-embed` | `{ url }` → `{ status: yes|no|unknown, reason, finalUrl, title }` |
| POST | `/api/shortcuts/:id/recheck`, `/refresh-icon` | recheck always reports the *direct* result, also for proxied shortcuts |
| PUT | `/api/desktop/positions` | `{ items: [{ kind: shortcut\|widget\|folder, id, position }] }` where `position` is `{ anchorX: left\|center\|right, anchorY: top\|center\|bottom, offsetCol, offsetRow }` (grid cells, see [Architecture → Desktop layout](Architecture.md#desktop-layout)) |
| POST/PATCH/DELETE | `/api/folders[/:id]` | `{ name, position? }`; DELETE puts the folder's shortcuts back on the desktop and returns `{ ok, shortcuts }` |
| POST | `/api/uploads/icon`, `/api/uploads/wallpaper` | multipart `file`; PNG/JPEG/SVG/WebP ≤ 2 MB, PNG/JPEG/WebP ≤ 20 MB |
| GET | `/icons/:file` | stored icons |
| GET | `/wallpapers/bundled/:file` (public), `/wallpapers/upload/:file` | |
| GET | `/api/wallpapers`; DELETE `/api/wallpapers/:file` | |
| POST/PATCH/DELETE | `/api/widgets[/:id]` | `{ type, position, size: s\|m\|l, settings }` |
| PUT | `/api/window-memory/:appKey` | `{ x, y, width, height, maximized }`; appKey is `shortcut:<id>` or `app:<id>` |
| GET/PATCH | `/api/settings` | Complete settings on GET (`Shared/src/Settings.ts` holds the schema and defaults). PATCH takes a partial object: top-level keys are optional and groups may name only the fields that change, e.g. `{ proxy: { idleGraceSeconds: 120 } }`. Unknown keys → 400. Currently: `theme`, `wallpaper`, `enabledApps` (only apps switched off; missing ids are enabled), `proxyIndicator: badge\|none`, `proxy: { idleGraceSeconds: 10–3600 }`, `appearance: { accent: preset\|#rrggbb, blur: 0–40, slideshow: { enabled, intervalMinutes, order: sequence\|shuffle, wallpapers[] }, timeOfDay: { enabled, morning, day, evening, night } }`, `desktop: { iconSize: s\|m\|l, labels: show\|hide\|shadow, openWith: single\|double, showIcons, density: compact\|normal\|roomy }`, `taskbar: { style: floating\|win10\|win11\|dock, position: bottom\|top\|left\|right, autoHide, size: s\|m\|l, showTitles, clock: { seconds, hours: auto\|12\|24, showDate }, pinned: ["app:<id>" \| "shortcut:<id>"], trayHidden: [<tray item id>] }`, `windows: { animation: normal\|fast\|off, buttons: mac\|windows, openMaximized, cascade }`, `keyboard: { bindings: { "<action id>": "Ctrl+Alt+ArrowLeft" \| "" } }` (a missing action id means its default; "" unbinds) |
| GET | `/api/proxy` | `{ start, end, total, used, ports: [{ port, shortcutId, name, target, state: closed\|opening\|open\|error, listening, error, reason, leases, connections, closesInMs }], waiting: [{ shortcutId, name }] }` |
| POST | `/api/proxy/leases` | `{ shortcutId }` → 201 `{ leaseId, port, ttlMs }` once the port accepts connections. 404 unknown shortcut, 409 the shortcut has no proxy port, 503 `proxy_port_unavailable` when the port cannot be bound |
| POST | `/api/proxy/leases/:id/renew` | heartbeat (the client sends one every 20 s); `{ ok, port }`, 404 when the lease expired (lease again) |
| DELETE | `/api/proxy/leases/:id` | the window closed; the port closes after the idle grace period |
| GET | `/api/system/status`, `/api/system/version` | integration checks (SSH probe included) |

## Docker and processes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/docker/containers` | |
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
- `/ws/logs` — client `{ type: "open", source: "docker", containerId, tail, follow }` | `{ source: "journal", unit, lines, follow }` | `{ source: "file", path, follow }` | `{ type: "close" }`; server `{ type: "chunk", text }`, `{ type: "end", reason }`, `{ type: "error", message }`.

Message shapes live in `Shared/src/WsMessages.ts`; validation schemas in `Shared/src/Schemas.ts`.
