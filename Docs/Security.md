# Security notes

LANdscape is a single-user admin tool. Logging in grants control over the host through SSH and the Docker socket, so the login and the request guard are the security boundary.

## Authentication and sessions

- Credentials come from `LOGIN_USERNAME` and `LOGIN_PASSWORD_HASH` (bcrypt). The server refuses to start without both and rejects values that are not bcrypt hashes (a common symptom of unescaped `$` in compose files).
- The bcrypt comparison always runs, even for a wrong username, so timing does not reveal which part failed.
- After 5 failed attempts from one IP the IP is locked for 15 minutes (in memory; a restart clears it). `request.ip` is the socket address unless `TRUST_PROXY=true`.
- Sessions are random 256-bit ids stored in SQLite with a 30-day sliding expiry, carried in a signed (`SESSION_SECRET`), `httpOnly`, `SameSite=Strict` cookie. Logout deletes the row. The secret is generated once and stored at `DATA_DIR/session-secret` (mode 0600) when not configured.
- The guard (`Server/src/Auth/Guard.ts`) requires a session for every `/api/*`, `/ws/*`, `/icons/*` and `/wallpapers/upload/*` path except login, the session probe and `/healthz`. Non-GET API calls and WebSocket upgrades must carry a same-origin `Origin` header (missing counts as mismatch).

## Headers

Set by `Server/src/Http/SecurityHeaders.ts`: `X-Frame-Options: DENY`, CSP with `frame-ancestors 'none'`, `default-src 'self'`, `script-src 'self'` (no inline scripts; the theme bootstrap is an external file), `style-src 'self' 'unsafe-inline'` (xterm.js and CodeMirror inject styles), `frame-src http: https:` so shortcuts can be framed, `object-src 'none'`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, a minimal `Permissions-Policy`. No HSTS because LANdscape does not terminate TLS.

## Inputs

- Every body, query and param is validated with the zod schemas in `Shared/src/Schemas.ts`.
- Files in the data directory are addressed by a strict file-name regex and resolved with a prefix check (`Desktop/DataFiles.ts`).
- Remote (SFTP) paths must be absolute, NUL-free and are normalised with `path.posix` (`Ssh/PathValidation.ts`); the SSH user's permissions are the real boundary.
- Uploaded images are type-sniffed from magic bytes. SVGs are rejected when they contain scripts, event handlers, `javascript:` URLs, `foreignObject`, or embeds, and are served with `Content-Security-Policy: default-src 'none'`.
- Shell commands built from user input (journal unit names) are restricted by regex and single-quoted.

## Server-side fetches

The embed check and favicon fetch (`Desktop/SafeFetch.ts`) only follow `http(s)` URLs, cap redirects at 5, time out after 8 s, and cap body sizes (256 KB HTML, 2 MB icon). They accept self-signed certificates because LAN services commonly use them; no credentials or cookies are sent. They are reachable only through authenticated routes. Because LANdscape's purpose is reaching LAN services, these fetches are not restricted to public addresses.

## Secrets

The password hash, session secret and SSH key are never sent to the client and never logged (`Config.ts` has a redacting view used for the startup log).

## Host access

- The Docker socket is root-equivalent. The Docker app, the container-count widget and Docker logs use it.
- SSH acts with the permissions of `SSH_USER`. Host keys are trusted on first use and pinned in `DATA_DIR/ssh/known_host`; a changed key refuses to connect.
- The container starts as root only to fix ownership of the data directory and to join the Docker socket's group, then drops to an unprivileged user (`PUID`/`PGID`).

## Known limitations

- No TLS. Behind an HTTPS reverse proxy, plain-http shortcuts cannot be embedded (mixed content) and fall back to "Open in new tab".
- Sites on another *site* than LANdscape run as third-party iframes; Safari and Chrome block their cookies, so logins inside such frames may not persist. Same host with a different port is fine.
- Lockout state is per process; multiple replicas are out of scope.
