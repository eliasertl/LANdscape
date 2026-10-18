# LANdscape

A self-hosted, macOS-style web desktop for your homeserver. Your services become desktop shortcuts that open in draggable windows, live host statistics sit on the desktop as widgets, and built-in admin apps (Terminal, Files, Text Editor, Docker, Task Manager, Log Viewer) cover day-to-day server administration. Single user, one Docker container, made for CasaOS and LAN/VPN use.

> **Security note.** LANdscape is an admin tool. With the Docker socket mounted and an SSH key configured, whoever logs in has root-equivalent control of your server. Keep it on your LAN or behind a VPN, use a strong password, and read the [Security](#security) section.

## Features

- **Lock screen** with the blurred wallpaper and a login card. 5 failed attempts lock the IP for 15 minutes.
- **Desktop** with wallpaper, draggable shortcut icons and widgets. Layout is saved on the server, so every device sees the same desktop.
- **Shortcuts** to any URL. The server checks whether the site allows embedding (X-Frame-Options / CSP `frame-ancestors`) before you save, fetches and stores the favicon, or uses an uploaded icon.
- **Window manager** in macOS style: traffic lights, drag, resize from every edge, minimize to the taskbar with a spring animation, maximize, several windows per shortcut, remembered sizes and positions.
- **Taskbar** (frosted glass) with a start menu/launcher (search, keyboard navigation, `Ctrl+Space`), grouped open windows and a clock.
- **Widgets** for CPU, RAM, disk usage, network throughput and IPs, temperatures, uptime, Docker container count and a clock. Each has its own update interval. Values come from the host, not the container.
- **Admin apps:** Settings (theme, wallpaper, enabled apps, integration status), Terminal (SSH + xterm.js), Files (SFTP with upload/download/rename/delete/preview), Text Editor (CodeMirror), Docker (containers, start/stop/restart, live logs), Task Manager (host processes, kill via SSH), Log Viewer (Docker logs, `journalctl`, any file, follow mode).
- **Phone layout** below 768 px: launcher grid, full-screen windows.
- **Light and dark themes** (dark is pure black), animated switching, reduced-motion and reduced-transparency support.

## Install on CasaOS

LANdscape ships as source; the image is built on your server (there is no CI or registry image).

### 1. Build the image

SSH into the server and run:

```sh
docker build -t landscape:latest https://github.com/eliasertl/LANdscape.git#main
```

The first build takes a few minutes (it compiles the client and generates wallpapers).

### 2. Generate the password hash

```sh
docker run --rm -it landscape:latest hash-password
```

Type your password; the command prints a bcrypt hash such as `$2b$10$…`.

> **Compose pitfall:** in `docker-compose.yml` every `$` in the hash must be written as `$$`. The command prints the escaped version for you. If you prefer, `htpasswd -bnBC 10 "" 'your password' | tr -d ':\n'` produces the same kind of hash.

### 3. Set up the SSH key

The Terminal, Files, Text Editor, Log Viewer and Task Manager "End process" use SSH into the host. Create a dedicated key pair and authorise it for the host user LANdscape should act as:

```sh
mkdir -p /DATA/AppData/landscape/ssh
ssh-keygen -t ed25519 -N "" -C landscape -f /DATA/AppData/landscape/ssh/id_ed25519
cat /DATA/AppData/landscape/ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

The private key stays in `/DATA/AppData/landscape/ssh/` (the container reads it from `/etc/landscape/ssh/id_ed25519`). Set `SSH_USER` to the user whose `authorized_keys` you edited. LANdscape stores the host key fingerprint on first connection and refuses to connect if it changes.

### 4. Install the app

In CasaOS open **App Store → Custom Install**, click **Import**, paste [`docker-compose.yml`](docker-compose.yml) from this repository, fill in `LOGIN_USERNAME`, `LOGIN_PASSWORD_HASH` (with `$$`) and `SSH_USER`, then install. Open `http://<server>:8080`.

### 5. Update

```sh
docker build -t landscape:latest https://github.com/eliasertl/LANdscape.git#main
```

then restart the app in CasaOS (or run `Scripts/update.sh`, which rebuilds and recreates the container).

Alternative: CasaOS can build from a `build: https://github.com/eliasertl/LANdscape.git#main` entry in the compose file instead of `image:`. It is less reliable (build errors are hard to see), so the manual build above is recommended.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LOGIN_USERNAME` | — (required) | Login user |
| `LOGIN_PASSWORD_HASH` | — (required) | bcrypt hash of the password (`$$` escaping in compose) |
| `PORT` | `8080` | Port the server listens on |
| `DATA_DIR` | `/etc/landscape` | Persistent data: SQLite DB, icons, wallpapers, SSH key, session secret |
| `SESSION_SECRET` | auto-generated, persisted | Session cookie signing secret |
| `SSH_HOST` | `host.docker.internal` | Host for SSH/SFTP |
| `SSH_PORT` | `22` | SSH port |
| `SSH_USER` | — (optional) | SSH user; leave empty to disable SSH-based apps |
| `SSH_KEY_PATH` | `/etc/landscape/ssh/id_ed25519` | Private key file |
| `HOST_PROC` | `/host/proc` | Host procfs mount (metrics, Task Manager) |
| `HOST_SYS` | `/host/sys` | Host sysfs mount (temperatures) |
| `HOST_ROOT` | `/host/root` | Optional read-only host root mount for disk usage |
| `DOCKER_SOCKET` | `/var/run/docker.sock` | Docker API socket |
| `PUID` / `PGID` | `1000` | User/group the server runs as; the entrypoint chowns `DATA_DIR` to match |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers (only behind a reverse proxy you control) |
| `LOG_LEVEL` | `info` | pino log level |

The container refuses to start without `LOGIN_USERNAME` and `LOGIN_PASSWORD_HASH` and logs a clear error.

## Mounts and what they imply

| Mount | Needed for | Implication |
|---|---|---|
| `/DATA/AppData/landscape:/etc/landscape` | everything | Persistent data. Contains the SSH private key and session secret; keep it private. |
| `/proc:/host/proc:ro` | CPU, RAM, network, uptime widgets, Task Manager | Read-only view of all host processes. |
| `/sys:/host/sys:ro` | temperatures, device names | Read-only. |
| `/:/host/root:ro` | disk usage per mount (optional) | Read-only view of the whole host file system **from inside the container**. Without it, disk usage comes from `df` over SSH when SSH is configured. |
| `/var/run/docker.sock` | Docker app, container-count widget, Docker logs | **Root-equivalent.** Anyone with LANdscape's password effectively has root on the host. |
| `extra_hosts: host.docker.internal:host-gateway` | SSH to the host | Lets the container reach the host's sshd. |

The container starts as root only to fix ownership of the data directory and to join the Docker socket's group, then drops to the unprivileged `node` user (`PUID`/`PGID`).

## Security

- Sessions are httpOnly, `SameSite=Strict` cookies, stored server-side (logout invalidates), 30-day lifetime.
- Every API route and WebSocket requires a session; WebSocket upgrades and state-changing requests must be same-origin.
- LANdscape sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`, so it cannot be framed itself, with a CSP that allows `frame-src http: https:` for your shortcuts.
- Uploaded SVG icons are rejected if they contain scripts and are served with a restrictive CSP.
- The server-side embed check and favicon fetch only follow http(s), with timeouts and size limits. They accept self-signed certificates because LAN services commonly use them; nothing secret is sent.
- Secrets (password hash, session secret, SSH key) are never sent to the client or written to logs.
- **No TLS.** LANdscape is meant for LAN/VPN use. If you put it behind an HTTPS reverse proxy, browsers will block plain-`http://` services inside iframes (mixed content); those shortcuts fall back to "Open in new tab".

## Troubleshooting

- **"Configuration error: LOGIN_PASSWORD_HASH does not look like a bcrypt hash"** — the `$` characters were swallowed. Write `$$` in compose, or quote the value in an env file.
- **Widgets say "Not available — see README"** — the `/proc` or `/sys` mount is missing, or the sensor does not exist on this machine. Check the volumes in the compose file; Settings → About shows each integration's status.
- **Terminal/Files show a setup screen** — `SSH_USER` is empty or the key is missing/unauthorised. Test from the server: `ssh -i /DATA/AppData/landscape/ssh/id_ed25519 <user>@localhost`.
- **"Host key changed"** — the host's SSH key was regenerated. Delete `/DATA/AppData/landscape/ssh/known_host` and reconnect.
- **Docker app shows a setup screen** — the socket is not mounted or not group-accessible. `stat -c %g /var/run/docker.sock` shows the group id; the entrypoint adds the server user to it automatically.
- **A shortcut shows "This site can't be embedded"** — the site sends `X-Frame-Options` or `frame-ancestors`. Use "Open in new tab" or edit the shortcut and choose "Try embedding anyway" if you know better.
- **Logged out after a restart** — set `SESSION_SECRET` explicitly or make sure the data directory is persisted (the generated secret lives there).
- **Lock screen says too many attempts** — wait 15 minutes, or restart the container (lockouts are kept in memory).

## Development

```sh
npm install
cp Scratch/.env.example Scratch/.env   # or create it: LOGIN_USERNAME, LOGIN_PASSWORD_HASH, DATA_DIR=./.data
npm run dev                            # server on :8080, client on :5173
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e                       # Playwright smoke test against the built server
```

See [AGENTS.md](AGENTS.md) for the repository structure, conventions and rules (including: no GitHub Actions).

## License

MIT. Wallpapers are generated procedurally at build time; no third-party images are bundled.
