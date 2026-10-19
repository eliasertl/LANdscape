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
| GET | `/api/desktop` | bootstrap: shortcuts, widgets, settings, windowMemory, integrations, proxy (`{ start, end }`), version |
| GET/POST | `/api/shortcuts` | create runs the embed check and fetches the favicon. `openMode` is `auto \| embed \| proxy \| newtab`; the response carries `proxyPort` (number or null). `openMode: "proxy"` with no free port → 409 `All N proxy ports are in use — …` |
| PATCH/DELETE | `/api/shortcuts/:id` | URL changes re-run the embed check; a new origin renews the proxy assignment. `openMode: "proxy"` with no free port → 409 |
| POST | `/api/shortcuts/check-embed` | `{ url }` → `{ status: yes|no|unknown, reason, finalUrl, title }` |
| POST | `/api/shortcuts/:id/recheck`, `/refresh-icon` | recheck always reports the *direct* result, also for proxied shortcuts |
| PUT | `/api/shortcuts/positions` | `{ positions: [{ id, x, y }] }` |
| POST | `/api/uploads/icon`, `/api/uploads/wallpaper` | multipart `file`; PNG/JPEG/SVG/WebP ≤ 2 MB, PNG/JPEG/WebP ≤ 20 MB |
| GET | `/icons/:file` | stored icons |
| GET | `/wallpapers/bundled/:file` (public), `/wallpapers/upload/:file` | |
| GET | `/api/wallpapers`; DELETE `/api/wallpapers/:file` | |
| POST/PATCH/DELETE | `/api/widgets[/:id]` | `{ type, x, y, settings }` |
| PUT | `/api/window-memory/:appKey` | `{ x, y, width, height, maximized }`; appKey is `shortcut:<id>` or `app:<id>` |
| GET/PATCH | `/api/settings` | `{ theme, wallpaper, enabledApps, proxyIndicator: badge\|none }` |
| GET | `/api/proxy` | `{ start, end, total, used, ports: [{ port, shortcutId, name, target, listening, error }], waiting: [{ shortcutId, name }] }` |
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

Not part of the API: each port in `PROXY_PORT_START`–`PROXY_PORT_END` that is assigned to a shortcut forwards every request and WebSocket upgrade to that shortcut's origin, after checking the LANdscape session cookie (`401` HTML page otherwise). See [Security.md](Security.md#embed-proxy) for the header and cookie rewriting.

## WebSockets

- `/ws/metrics` — client `{ type: "subscribe", metric, intervalMs }` / `{ type: "unsubscribe", metric }`; server `{ type: "sample", metric, at, data }`, `{ type: "unavailable", metric, reason }`.
- `/ws/terminal?cols&rows` — binary frames are terminal bytes both ways; text frames `{ type: "resize", cols, rows }`; server `{ type: "ready" | "exit" | "error" }`.
- `/ws/logs` — client `{ type: "open", source: "docker", containerId, tail, follow }` | `{ source: "journal", unit, lines, follow }` | `{ source: "file", path, follow }` | `{ type: "close" }`; server `{ type: "chunk", text }`, `{ type: "end", reason }`, `{ type: "error", message }`.

Message shapes live in `Shared/src/WsMessages.ts`; validation schemas in `Shared/src/Schemas.ts`.
