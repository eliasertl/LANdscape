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
   ├─ Design/      tokens, typography, springs, theme
   ├─ Store/       zustand: session, desktop data, windows, UI state
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

## Windows

The window manager is hand-written. Windows are rendered in creation order with stable React keys so iframes never remount when the z-order changes; stacking uses `z-index`. Minimized windows stay mounted with `visibility: hidden`. Drag and resize use pointer capture; while interacting, a transparent overlay covers every iframe so the frames cannot swallow pointer events. Open/close/minimize animations are driven by `Design/Spring.ts`, a frame-rate-independent spring solver with Carbon's `response`/`dampingFraction` parameters. Each app or shortcut remembers its last geometry (`window_memory` table); new windows cascade when a sibling is already open.

## Embed proxy

Shortcuts that cannot be framed directly are shown through a transparent pass-through proxy on their own port, so the app keeps requesting absolute paths and runs on a separate origin.

- `Proxy/Assignments.ts` — pure planning: which shortcut holds which port. A shortcut wants a port in mode `proxy`, or in `auto` when the embed check says `no`. Valid assignments are kept; free ports go out lowest first, explicit `proxy` before `auto`, oldest first; the rest wait.
- `Proxy/ProxyService.ts` — applies the plan to the `shortcuts.proxy_port`/`proxy_tag` columns (migration 2) and hands the routes to the manager. `reconcile()` runs at startup (which assigns ports to existing blocked shortcuts after an upgrade or a range change) and after every shortcut create/update/recheck/delete. A new target origin releases the assignment first, so it gets a new cookie tag.
- `Proxy/ProxyManager.ts` — one `ProxyListener` per assigned port; opens new ones, closes released ones, re-targets in place, retries ports that fail to bind. Listeners start after the main server listens.
- `Proxy/Listener.ts` — `node:http` server; streams requests to the target with `node:http`/`node:https` (keep-alive agents, self-signed certificates accepted), 60 s until response headers, 15 min idle while streaming; WebSocket upgrades are piped as raw sockets after the handshake. No third-party proxy library: the rewriting needs full control over headers, and Node's primitives cover streaming and upgrades.
- `Proxy/Rewrite.ts` — pure functions for request headers (Host/Origin/Referer, cookie filtering), response headers (framing headers, `Set-Cookie`, `Location`) and CSP stripping.

On the client, `Windows/ShortcutFrame.ts` decides per shortcut between a direct iframe, `http://<location.hostname>:<port><path>` and a "can't embed" panel; `Windows/ProxyBadge.tsx` marks proxied windows in the title bar and phone header.

## Metrics

Widgets subscribe over `/ws/metrics` with `{ metric, intervalMs }`. `Metrics/Hub.ts` keeps one timer per metric at the fastest requested interval, samples once, and forwards to each subscriber only when that subscriber's own interval has elapsed. Samplers read the host's `/proc` and `/sys` (mounted read-only); network counters come from `/proc/1/net/dev` (the host's network namespace), addresses from `fib_trie`/`route`/`if_inet6`, disks from `/proc/1/mounts` with usage via `statfs` on the optional host-root mount or `df` over SSH. Every sampler returns `{ available: false, reason }` instead of throwing when something is missing.

## SSH

`Ssh/Connection.ts` pools ssh2 clients and spreads channels (shell, exec, sftp) over them so OpenSSH's `MaxSessions` limit is never hit. Host keys are trusted on first use and pinned in `DATA_DIR/ssh/known_host`. Follow commands (`journalctl -f`) run with a pty so closing the channel ends the remote process. SFTP operations run with the SSH user's permissions; path inputs are normalised to absolute POSIX paths before use.

## Persistence

`Db/Database.ts` wraps `node:sqlite` (WAL mode). Migrations are an ordered list in `Db/Migrations.ts` keyed by `PRAGMA user_version`. Repositories in `Db/Repositories/` map rows to the shared types.
