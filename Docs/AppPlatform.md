# App platform

LANdscape can be extended with **catalog apps**: frontend-only bundles that add windows, widgets, taskbar and tray items, startup animations, cursor sets, themes, wallpapers and actions. This document is the architecture and security model; [AppSdk.md](AppSdk.md) explains how to build one.

## Where things live

| Piece | Location |
|---|---|
| Manifest schema, permissions, catalog index schema | `Shared/src/AppManifest.ts`, `Shared/src/Permissions.ts` |
| Install / update / uninstall, bundle validation | `Server/src/Apps/AppStore.ts` (+ `Zip.ts`, `ZipWriter.ts`) |
| Frame document builder (inlining + SDK injection) | `Server/src/Apps/FrameInjector.ts` |
| Routes (`/api/apps/*`, `/api/catalog`, `/apps/frame/*`, `/apps/files/*`) | `Server/src/Apps/AppRoutes.ts` |
| Catalog fetch with offline fallback | `Server/src/Apps/Catalog.ts` |
| Tables `apps`, `app_storage` | migration 6, `Server/src/Db/Repositories/AppsRepository.ts` |
| Bundles on disk | `DATA_DIR/apps/<id>/<version>/` |
| SDK runtime (injected into frames) and types | `Sdk/src/Runtime.ts` → `Sdk/dist/runtime.js`, `Sdk/src/Types.ts` |
| Host-side RPC broker | `Client/src/Platform/AppBroker.ts` |
| Surfaces | `Client/src/Apps/AppFrame.tsx` (one sandboxed iframe), `AppWindow.tsx`, `Widgets/AppWidget.tsx`, `Taskbar/Tray/AppTrayItem.tsx`, `Startup/AppStartupAnimation.tsx`, `Apps/AppBackgrounds.ts` |
| Registration into the registries | `Client/src/Platform/InstalledApps.ts` |
| App Store app | `Client/src/Apps/AppStore/` |
| Catalog sources and build | `Catalog/Apps/<Name>/`, `Catalog/Template/`, `Scripts/src/BuildCatalog.ts` → `Catalog/dist/*.zip`, `Catalog/index.json` |

## Isolation

Every code surface of an app is an `<iframe sandbox="allow-scripts allow-forms allow-modals allow-pointer-lock">`. Without `allow-same-origin` the frame has an **opaque origin**: it cannot read LANdscape's cookies, DOM, storage or API, and `postMessage` is the only channel to the host.

**Asset delivery.** An opaque-origin frame sends no `SameSite=Strict` cookie, so it could never load bundle files itself. Instead the frame's document is a navigation started by LANdscape's page (`/apps/frame/:id/:surface/:surfaceId`, behind the session guard; the same-site navigation carries the cookie), and the server builds the whole document (`FrameInjector.ts`): local `<script src>` and `<link rel=stylesheet>` are inlined, local images, fonts and `url()` references become `data:` URLs, external references are removed, and two inline scripts are prepended: `window.__landscapeFrame` (the frame context: app id, surface, params, permissions, nonce) and the SDK runtime. The response carries its own CSP:

```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;
font-src data:; media-src data: blob:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'
```

The frame therefore makes **no subresource or network requests at all**. Alternatives that were rejected: `srcdoc`/`blob:` frames inherit LANdscape's CSP, which forbids inline scripts; signed asset URLs are bearer tokens that leak through logs and history and could be reused by any page on the same site.

`/apps/files/:id/*` serves images and fonts of a bundle to **the host** (app icons in the launcher, wallpapers, cursor images), never to frames.

## The broker

`AppBroker.ts` listens for `message` events. A request is accepted only when its `source` is a registered frame window and its `nonce` equals the one the server put into that frame's document (a random 128-bit value the host generated for this iframe instance). Every message is validated with zod, every method checks the app's permission with `isAllowed(granted, trusted, permission)`, and the call is forwarded to the REST or WebSocket API with the user's session. Subscriptions (metrics, logs, container stats, monitor) are host-side sockets that push events back into the frame; they end with the frame.

Protocol (Sdk/src/Protocol.ts): frame → host `{ landscape: 1, nonce, id, method, params }`; host → frame `{ landscape: 1, id, result | error }` and `{ landscape: 1, event, data }`.

Server-side enforcement exists where the server itself can tell an app call apart: per-app storage and `net:fetch` live under `/api/apps/:id/…` and check the app's grants; `POST /api/ssh/exec` checks the `X-LANdscape-App` header when present. Everything else is enforced by the broker, which runs in LANdscape's own origin and is the only thing a frame can talk to.

## Permissions and trust

`Shared/src/Permissions.ts` lists the permissions with plain-language descriptions; `docker:write`, `files:write` and `ssh:exec` are flagged as dangerous in the install dialog. An app gets the permissions the user approved at install; the Installed tab can revoke each one. **Trusted** grants everything (including `net:fetch` to any host) without prompts, but the sandbox and the broker stay in place: trusted means "may use the whole API as the logged-in user", never "may touch LANdscape's DOM".

**Updates** compare the installed grants with the new manifest; new permissions must be approved before the update applies (`409 permissions_required` with the list). Trusted apps update without a prompt.

`net:fetch` goes through `POST /api/apps/:id/fetch`: http(s) only, 15 s timeout, 5 MB cap, SafeFetch rules, `Cookie`/`Authorization`/`Host`/`Origin` request headers dropped, `Set-Cookie` never returned, and the host must match the manifest's `net.hosts` (`*.example.com` wildcards) unless the app is trusted.

## Install, update, uninstall

Sources: the catalog (sha256 verified against the index), a URL, or an uploaded zip (≤ 20 MB, ≤ 2000 entries, ≤ 40 MB unpacked). `Zip.ts` is a small dependency-free reader (store/deflate) that rejects absolute paths and traversal. `prepareBundle` parses `manifest.json`, checks that every referenced file exists, type-sniffs raster images and rejects SVGs with scripts or event handlers. Bundles are written to `DATA_DIR/apps/<id>/<version>/`; older versions are removed after a successful install. Uninstall removes the directory, the `app_storage` rows, the app's monitor targets, its desktop widgets, its taskbar pins, and resets cursor/startup/theme/wallpaper settings that pointed at it.

The catalog index is fetched live from `raw.githubusercontent.com/eliasertl/LANdscape/main/Catalog/index.json` (cached 10 minutes); when that fails, the copy bundled in the image (`/app/Catalog/index.json`) is used and the App Store says so. Bundled zips (`Catalog/dist`) are also in the image, so an offline server can still install the catalog apps.

## Debugging

- `GET /api/apps` lists installed apps with grants, bundle size and available updates; `GET /api/catalog` shows which catalog (live or bundled) is in use and why.
- The server logs "App installed/updated/uninstalled" and "App trust changed" with the app id; install failures come back as 400 with the validation message.
- In the browser, `landscapeDebug.registries` shows what each app registered. A frame's document can be opened directly (`/apps/frame/<id>/window/main?nonce=<32 hex>`) to see the injected context. Broker errors arrive inside the app as rejected promises with `code` (`permission_denied`, `bad_params`, `unknown_method`).
- The template app (`Catalog/Template`) exercises storage, metrics, notifications, actions, a widget and a background page; `Tests/E2E/AppStore.spec.ts` installs it from a zip and checks each path.
