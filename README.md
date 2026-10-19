# LANdscape

A self-hosted, macOS-style web desktop for your homeserver. Your services become desktop shortcuts that open in draggable windows, live host statistics sit on the desktop as widgets, and built-in admin apps (Terminal, Files, Text Editor, Docker, Task Manager, Log Viewer) cover day-to-day server administration. Single user, one Docker container, made for CasaOS and LAN/VPN use.

> **Security note.** LANdscape is an admin tool. With the Docker socket mounted and an SSH key configured, whoever logs in has root-equivalent control of your server. Keep it on your LAN or behind a VPN, use a strong password, and read the [Security](#security) section.

## Features

- **Lock screen** with the blurred wallpaper and a login card. 5 failed attempts lock the IP for 15 minutes.
- **Desktop** with wallpaper, draggable shortcut icons and widgets. Layout is saved on the server, so every device sees the same desktop.
- **Shortcuts** to any URL. The server checks whether the site allows embedding (X-Frame-Options / CSP `frame-ancestors`) before you save, fetches and stores the favicon, or uses an uploaded icon.
- **Embed proxy** for sites that refuse to be framed (typical for self-hosted apps like Docmost): each such shortcut gets its own LANdscape port (8081–8100) that passes the site through 1:1 with the framing headers removed, so it still opens in a window — logins included. Only reachable while you are logged in to LANdscape. See [Embed proxy](#embed-proxy).
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

The private key stays in `/DATA/AppData/landscape/ssh/` (the container reads it from `/etc/landscape/ssh/id_ed25519`). Set `SSH_USER` to the user whose `authorized_keys` you edited. On start, the container fixes ownership and permissions of the `ssh/` folder so its unprivileged server user can read the key. LANdscape stores the host key fingerprint on first connection (`ssh/known_host`) and refuses to connect if it changes.

### 4. Install the app

In CasaOS open **App Store → Custom Install**, click **Import**, paste [`docker-compose.yml`](docker-compose.yml) from this repository, fill in `LOGIN_USERNAME`, `LOGIN_PASSWORD_HASH` (with `$$`) and `SSH_USER`, then install. Open `http://<server>:8080`.

The compose file also publishes ports **8081–8100** for the [embed proxy](#embed-proxy). Leave each one's host port equal to its container port; if one of them is taken on your server, see [Ports](#ports).

### 5. Update

```sh
docker build -t landscape:latest https://github.com/eliasertl/LANdscape.git#main
```

then restart the app in CasaOS (or run `Scripts/update.sh`, which rebuilds and recreates the container).

> **Updating from a version without the embed proxy:** rebuilding the image is not enough, because the new proxy ports must be published. In CasaOS open the app's settings (or re-import [`docker-compose.yml`](docker-compose.yml) via Custom Install) and add the ports 8081–8100 (host port = container port, TCP) plus the `PROXY_PORT_START`/`PROXY_PORT_END` variables, then save. Your data directory is kept. Shortcuts that could not be embedded so far get proxy ports automatically on the first start.

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
| `PROXY_PORT_START` / `PROXY_PORT_END` | `8081` / `8100` | Port range of the embed proxy, one port per proxied shortcut (max. 500, must not contain `PORT`). Publish exactly these ports, host = container. |
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

## Ports

| Port | Purpose |
|---|---|
| `8080` (`PORT`) | Web UI and API. |
| `8081`–`8100` (`PROXY_PORT_START`–`PROXY_PORT_END`) | Embed proxy, one port per shortcut shown through the proxy. A port only accepts connections while a shortcut is assigned to it; the others stay closed. |

The browser is sent to `http://<the host you opened LANdscape with>:<proxy port>`, so the published host port **must equal** the container port. To move the range (say 9001–9020), change both the variables and the published ports. You can make the range smaller if you need fewer proxied shortcuts.

## Embed proxy

Many self-hosted apps send `X-Frame-Options` or `Content-Security-Policy: frame-ancestors`, which stops browsers from showing them inside another page. For those shortcuts LANdscape runs a small pass-through proxy on a separate port:

- Every request to that port — any method, body, query, WebSockets — is forwarded unchanged to the shortcut's address. The page is not rewritten; only `X-Frame-Options` and the `frame-ancestors` part of the CSP are removed, redirects to the app's own address are mapped onto the proxy port, and `Host`/`Origin`/`Referer` look like a direct visit.
- It uses its own port instead of a path like `/proxy/…` so the app can keep requesting absolute paths (`/api`, `/static/…`) and believes it lives at `/`. A different port is also a different origin, so the proxied app's JavaScript cannot read LANdscape's pages or API.
- **Only you can use it:** each request must carry your LANdscape session cookie; logged out, the port answers "Log in to LANdscape to use this service." LANdscape's own cookie is never passed to the app.
- **Logins work and stay separate:** the app's cookies are stored under a per-port name prefix, so two proxied apps that both use a cookie called `session` do not log each other out, and no app can overwrite LANdscape's cookie.

**Choosing the mode** (shortcut dialog → *Open*):

| Mode | Behaviour |
|---|---|
| Auto (default) | Direct window if the site allows framing; through the proxy if it blocks it; if all proxy ports are taken, an "Open in new tab" offer. |
| Direct | Always the plain iframe ("try embedding anyway"). |
| Via proxy | Always through the proxy, even if direct embedding would work. Refused with a clear message when all ports are in use. |
| New tab | Never embeds. |

Proxied windows show a small ⇄ badge next to the title (with the port on phones); **Settings → Proxy** turns it off and lists which port serves which shortcut and whether it is listening. Ports are released when a shortcut stops using the proxy or is deleted; changing a shortcut to a different server gives it a fresh assignment (old cookies are not carried over).

**Limitations**

- The proxy ports speak plain HTTP. If you open LANdscape through an HTTPS reverse proxy, the browser blocks them as mixed content and proxied shortcuts fall back to "Open in new tab". HTTPS on the proxy ports is not supported.
- Apps that build links to their *own original address* in JavaScript (for example a configured "public URL" like `http://192.168.2.116:35957`) can leave the proxy; links or API calls to that address then go to the app directly.
- Cookies that an app sets *from JavaScript* (`document.cookie`) are not namespaced and are not forwarded, and apps whose JavaScript reads a server-set cookie by name (some CSRF schemes, e.g. `XSRF-TOKEN`) will not find it under its original name. Most apps use server-set, httpOnly session cookies and are unaffected.
- Redirects to another site (single sign-on, OAuth) leave the proxy and open that site directly, which usually cannot be framed either.

## Security

- Sessions are httpOnly, `SameSite=Strict` cookies, stored server-side (logout invalidates), 30-day lifetime.
- Every API route and WebSocket requires a session; WebSocket upgrades and state-changing requests (including login) must be same-origin.
- Embed proxy ports require the LANdscape session on every request and WebSocket, forward only to their one shortcut's server, never pass LANdscape's cookie on, and keep each app's cookies in its own namespace. See [Docs/Security.md](Docs/Security.md#embed-proxy).
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
- **A shortcut shows "This site can't be embedded"** — the site blocks framing and every proxy port is taken (the hint in the window says so). Free a port by switching another shortcut to *Direct* or *New tab*, delete one, or widen `PROXY_PORT_START`/`PROXY_PORT_END` (and publish the new ports).
- **"All 20 proxy ports are in use"** when saving a shortcut with *Via proxy* — same cause as above. Settings → Proxy shows which shortcuts hold the ports.
- **Proxy port not reachable** (the window stays blank or "can't connect" on `:8081`…) — the port is not published or is published under a different host port. Check the app's ports in CasaOS: 8081–8100 must be mapped to the same numbers. Settings → Proxy shows "Not listening" with a reason if LANdscape itself could not open the port (e.g. another program uses it). A firewall on the server must allow the range too.
- **A proxied window says "Log in to LANdscape to use this service."** — your LANdscape session expired or you logged out; log in again and reopen the window.
- **A proxied window says "The service is not reachable"** — LANdscape could not connect to the shortcut's address from inside the container. Check that the URL works from the server itself.
- **Logged out after a restart** — set `SESSION_SECRET` explicitly or make sure the data directory is persisted (the generated secret lives there).
- **Lock screen says too many attempts** — wait 15 minutes, or restart the container (lockouts are kept in memory).
- **"Cannot write the host key store"** — the data directory's `ssh/` folder is not writable by the server user. The entrypoint normally fixes this on start; if you run with `user:` in compose, make the folder writable or set `PUID`/`PGID` to its owner.
- **Ctrl+Space does nothing** — keyboard focus is inside an iframe (a shortcut window). Click the desktop or the search icon in the taskbar.
- **A login inside an embedded site does not stick** — sites on a different host than LANdscape are third-party iframes; Safari and Chrome block their cookies. Services on the same host but another port are fine.

## Which sites embed?

Self-hosted services usually allow framing unless they set `X-Frame-Options` or a `frame-ancestors` policy themselves (Docmost, for example, sends `X-Frame-Options: SAMEORIGIN`; Grafana needs `allow_embedding = true`). LANdscape detects this when you add the shortcut, and in *Auto* mode shows blocking sites through the [embed proxy](#embed-proxy) instead. The proxy is meant for your own LAN services. Big public sites (Google, YouTube, GitHub, …) are not a target: they need their own domain, HTTPS and third-party logins, so they generally will not work inside a window even through the proxy — use "New tab" for them.

## Development

```sh
npm install
# create Scratch/.env with LOGIN_USERNAME, LOGIN_PASSWORD_HASH (npm run hash-password -- 'pw'), DATA_DIR=./.data
npm run dev                            # server on :8080, client on :5173
npm run typecheck && npm run lint && npm test && npm run build
npm run test:e2e                       # Playwright smoke test against the built server
npm run seed                           # optional: load shortcuts from Scratch/Seed.json
```

To exercise the SSH apps locally without a Linux host, run an SSH server container that trusts a dev key:

```sh
mkdir -p .data/ssh && ssh-keygen -t ed25519 -N "" -f .data/ssh/id_ed25519
docker run -d --name landscape-sshd -p 2222:2222 -e PUID=1000 -e PGID=1000 -e USER_NAME=landscape \
  -e "PUBLIC_KEY=$(cat .data/ssh/id_ed25519.pub)" lscr.io/linuxserver/openssh-server
# Scratch/.env: SSH_HOST=127.0.0.1 SSH_PORT=2222 SSH_USER=landscape SSH_KEY_PATH=./.data/ssh/id_ed25519
```

See [AGENTS.md](AGENTS.md) for the repository structure, conventions and rules (including: no GitHub Actions).

## License

MIT. Wallpapers are generated procedurally at build time; no third-party images are bundled.
