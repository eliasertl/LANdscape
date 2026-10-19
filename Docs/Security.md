# Security notes

LANdscape is a single-user admin tool. Logging in grants control over the host through SSH and the Docker socket, so the login and the request guard are the security boundary.

## Authentication and sessions

- Credentials come from `LOGIN_USERNAME` and `LOGIN_PASSWORD_HASH` (bcrypt). The server refuses to start without both and rejects values that are not bcrypt hashes (a common symptom of unescaped `$` in compose files).
- The bcrypt comparison always runs, even for a wrong username, so timing does not reveal which part failed.
- After 5 failed attempts from one IP the IP is locked for 15 minutes (in memory; a restart clears it). `request.ip` is the socket address unless `TRUST_PROXY=true`.
- Sessions are random 256-bit ids stored in SQLite with a 30-day sliding expiry, carried in a signed (`SESSION_SECRET`), `httpOnly`, `SameSite=Strict` cookie. Logout deletes the row. The secret is generated once and stored at `DATA_DIR/session-secret` (mode 0600) when not configured.
- The guard (`Server/src/Auth/Guard.ts`) requires a session for every `/api/*`, `/ws/*`, `/icons/*` and `/wallpapers/upload/*` path except login, the session probe and `/healthz`. Non-GET API calls (login included) and WebSocket upgrades must carry a same-origin `Origin` header (missing counts as mismatch).

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

## Embed proxy

Shortcuts whose sites forbid framing can be served through `Server/src/Proxy/`: one plain-HTTP listener per assigned port in `PROXY_PORT_START`–`PROXY_PORT_END`, forwarding to exactly one target origin. Threat model and the controls that answer it:

| Threat | Control |
|---|---|
| Someone on the LAN uses a proxy port to reach an internal service or the proxied app | Every request and WebSocket upgrade must carry a valid, signed LANdscape session cookie (browsers send cookies to every port of a host). Without it: `401` page / refused upgrade, nothing is forwarded. Logout or expiry closes the gate immediately (sessions are checked against the DB per request). Ports without an assignment are not even bound. |
| Open relay / SSRF through the proxy | The target is fixed per port (the shortcut's origin, chosen by the logged-in user). Only origin-form request targets (`/path`) are accepted — absolute-form (`GET http://other/`) gets `400`, `CONNECT` is closed — and the path is passed to `http.request` verbatim with a fixed host, so `//other/x` stays a path on the target. Redirects to other origins are passed back to the browser unchanged, never followed. |
| LANdscape's session leaking to a proxied app | The `Cookie` header is rebuilt: only cookies with this assignment's prefix are forwarded, with the prefix removed. `landscape_session` never matches. `X-Forwarded-*`/`Forwarded` are not added. |
| Proxied apps clobbering each other's or LANdscape's cookies (cookies ignore ports) | Every `Set-Cookie` from the target is renamed to `lp<port>_<tag>_<name>`, `Domain` is dropped (host-only), `Secure`/`Partitioned` are dropped (plain HTTP), `SameSite=None` becomes `Lax`. `<tag>` is random per assignment, so when a port is reused or a shortcut gets a new target origin, cookies left in the browser from the previous holder are never forwarded. `__Host-`/`__Secure-` names lose their special meaning once prefixed and are restored on the way in. |
| A proxied page attacking LANdscape | The proxy port is a different **origin**, so the same-origin policy keeps its scripts away from LANdscape's DOM, storage and API responses (no CORS headers; `Cross-Origin-Resource-Policy: same-origin`; LANdscape itself cannot be framed). It is however the same **site**, so the browser sends LANdscape's `SameSite=Strict` cookie with its requests. Every state-changing route (including login, so a proxied page cannot lock the user out) and every WebSocket upgrade therefore requires `Origin` to equal LANdscape's own origin, and GET routes have no side effects. `Tests/Server/SameSite.test.ts` sweeps all registered routes to keep it that way. |
| A proxied page attacking another proxied app (cross-port CSRF) | `Origin`/`Referer` are only rewritten to the target when they are the proxy's own origin. A request from another port keeps its foreign `Origin`, so the target app's own CSRF/origin checks still apply. |
| Weakening the proxied app's own protections | Only `X-Frame-Options` and the `frame-ancestors` directive are removed; the rest of the CSP stays. `upgrade-insecure-requests` is also dropped because the proxy origin is plain HTTP and the directive would break HTTPS targets. Bodies are streamed, never rewritten or logged. |

Accepted risks: the proxy accepts self-signed certificates on targets (like the embed check); the proxy origin is plain HTTP, so on an untrusted network the app's traffic between browser and LANdscape is as exposed as LANdscape's own; apps that hard-code their original URL in JavaScript bypass the proxy (and its cookie namespace) for those requests. Logs contain ports, target origins and error codes, never cookies, headers or bodies.

## Secrets

The password hash, session secret and SSH key are never sent to the client and never logged (`Config.ts` has a redacting view used for the startup log).

## Host access

- The Docker socket is root-equivalent. The Docker app, the container-count widget and Docker logs use it.
- SSH acts with the permissions of `SSH_USER`. Host keys are trusted on first use and pinned in `DATA_DIR/ssh/known_host`; a changed key refuses to connect.
- The container starts as root only to fix ownership of the data directory and to join the Docker socket's group, then drops to an unprivileged user (`PUID`/`PGID`).

## Known limitations

- No TLS. Behind an HTTPS reverse proxy, plain-http shortcuts cannot be embedded (mixed content) and fall back to "Open in new tab"; the same applies to the plain-HTTP embed proxy ports.
- Sites on another *site* than LANdscape run as third-party iframes; Safari and Chrome block their cookies, so logins inside such frames may not persist. Same host with a different port is fine.
- Lockout state is per process; multiple replicas are out of scope.
