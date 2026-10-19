# LANdscape — rules for humans and agents

LANdscape is a self-hosted, single-user, macOS-style web desktop for a homeserver (CasaOS). It runs as one Docker container: a Fastify server that serves the built React client, persists to SQLite, and talks to the host via SSH/SFTP, the Docker socket and read-only `/proc` and `/sys` mounts.

## Hard rules

1. **No GitHub Actions, ever.** Do not create `.github/workflows` or any GitHub-hosted CI. They cost the owner money. The image is built on the server with `docker build … https://github.com/eliasertl/LANdscape.git#main` and checks run locally (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`).
2. **Never commit secrets, `Scratch/` content or wallpapers.** `Scratch/` is gitignored and holds local-only material (`TestLinks.md`, `.env`, `Seed.json`, compose overrides). Nothing the product needs at runtime may live there.
3. **No third-party wallpapers are bundled.** The mylinuxforwork/wallpaper repo was evaluated and rejected: it carries a GPL-2.0 file but the images are a "personal collection" from Reddit/4kwallpapers.com with unclear rights. Wallpapers are generated procedurally at build time by `Scripts/src/GenerateWallpapers.ts`. Do not add a download step.
4. **Security first.** Every `/api`, `/ws` and `/icons` route requires a session; WebSocket upgrades require a same-origin `Origin`. Never log the password hash, session secret or SSH key. Validate all input with the zod schemas in `Shared/src/Schemas.ts`. Server-side fetches are http(s)-only with timeouts and size limits.
5. **Keep apps and widgets self-contained.** Each built-in app lives in `Client/src/Apps/<Name>/` and each widget in `Client/src/Widgets/<Name>/`, registered in the respective `Registry.ts`. Adding or removing one is a local change.

## Structure

```
AGENTS.md / CLAUDE.md   rules (CLAUDE.md only contains "@AGENTS.md")
README.md               install, configure, update, troubleshoot (for the owner, no code reading needed)
Dockerfile              multi-stage: build → prod-deps → runtime (node:24-alpine, non-root via su-exec)
docker-compose.yml      CasaOS custom-install file with x-casaos metadata
Assets/                 app icon (referenced by raw GitHub URL from the compose file)
Shared/src/             types, zod schemas, constants, metric + WebSocket message types (imported as @landscape/shared, source only)
Server/src/             Fastify server
  Main.ts, App.ts, Config.ts, Context.ts
  Auth/                 password check, lockout, DB sessions, secret store, route guard
  Db/                   node:sqlite wrapper, migrations, repositories
  Desktop/              shortcuts, widgets, settings, window memory, embed check, favicon, icon/wallpaper stores
  Http/                 security headers, error handler, static client, health
  Metrics/              hub (shared sampling per metric), /ws/metrics, parsers for /proc and /sys
  Ssh/                  ssh2 connection pool, terminal, SFTP files, exec, path validation
  Docker/               dockerode client, container routes, log streams
  Logs/                 /ws/logs (docker | journalctl | file)
  System/               integration status
  Proxy/                embed proxy: port assignments, per-port listeners, pure header/cookie rewriting
Client/src/             React + Vite app
  Design/               tokens (CSS custom properties), typography, springs, theme
  Components/           small reusable controls (Button, Menu, Dialog, ...)
  Desktop/              wallpaper, icons, context menus, dialogs, Overlays (menus/dialogs/toasts shared with Phone/)
  Windows/              window manager: WindowManager, Window, TitleBar, ResizeHandles, IframeContent, WindowContent
  Taskbar/, StartMenu/, LockScreen/, Phone/ (PhoneShell + PhoneWindow below 768 px)
  Apps/<Name>/          built-in apps behind Apps/Registry.ts
  Widgets/<Name>/       widgets behind Widgets/Registry.ts
  Store/                zustand stores
Scripts/                update.sh, Entrypoint.sh, src/{HashPassword,GenerateWallpapers,SeedDev}.ts
Tests/Server/           vitest unit/integration tests (+ Fixtures/ for /proc and /sys samples)
Tests/E2E/              Playwright smoke tests
Docs/                   Architecture, Api, Security, Design notes
Scratch/                gitignored local material
```

## Commands

| Command | What it does |
|---|---|
| `npm install` | install all workspaces |
| `npm run dev` | server (tsx watch, port 8080) + Vite dev server (port 5173, proxies /api, /ws, /icons, /wallpapers). Reads `Scratch/.env` if present. |
| `npm run build` | build server (esbuild bundle), client (Vite), scripts, and generate wallpapers |
| `npm run typecheck` | `tsc` for every workspace and the tests |
| `npm run lint` | ESLint (type-aware) |
| `npm test` | vitest (Tests/Server) |
| `npm run test:e2e` | Playwright smoke test against the built server (run `npm run build` first) |
| `npm run wallpapers` | regenerate `Client/public/wallpapers` (gitignored) |
| `npm run seed` | dev-only: load shortcuts from `Scratch/Seed.json` into the local data dir |
| `npm run hash-password -- 'pw'` | print a bcrypt hash |
| `npm start` | run the built server |

Local dev env (`Scratch/.env`): `LOGIN_USERNAME`, `LOGIN_PASSWORD_HASH`, `DATA_DIR=./.data`, optionally `SSH_*`, `HOST_PROC`, `HOST_SYS`, `DOCKER_SOCKET` (on Windows `//./pipe/docker_engine` works). The SSH apps can be tested against a `lscr.io/linuxserver/openssh-server` container that trusts a key in `.data/ssh/` (see README → Development). Host metrics need a Linux host: build the image and run it with the `/proc`, `/sys` mounts (Docker Desktop's VM is enough for a smoke check).

Verification before a milestone is "done": `npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e`, plus a manual or scripted click-through (Playwright scripts in `Scratch/` are fine) and, for server-facing features, a run of the built image.

## Conventions

- TypeScript everywhere, ESM, strict mode. Node 24 (`node:sqlite`, `fetch`, `fs.statfs`).
- **PascalCase folders and source files** (`Server/src/Auth/Sessions.ts`, `Client/src/Windows/Window.tsx`), matching the owner's other projects. Config and dotfiles keep their conventional lowercase names.
- One React component per file, CSS Modules next to it (`Window.module.css`). No CSS-in-JS, no UI kit.
- Design tokens only: colors, radii, spacing and type come from `Client/src/Design/Tokens.css` and `Typography.css`. Light theme = Apple semantic colors, dark theme = pure black. Public Sans for UI, JetBrains Mono for terminal/editor, Phosphor icons.
- Motion uses `Client/src/Design/Spring.ts` (response + damping fraction, like Carbon). Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Server modules receive a `ServerContext` explicitly; no Fastify decorators for business objects.
- Errors are `HttpError` → `{ error: { code, message, details? } }`.
- Tests: fixtures over mocks; each test creates its own temp data dir via `Tests/Server/TestApp.ts`.
- Commits: small and logical, imperative subject. Never amend published history.
- English UI text throughout.
