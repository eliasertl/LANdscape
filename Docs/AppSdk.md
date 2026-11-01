# Building an app

A LANdscape app is a zip with a `manifest.json` and plain HTML, CSS and JavaScript. It runs in a sandboxed frame and talks to LANdscape through `window.landscape`, which the host injects into every frame; there is nothing to bundle. Start from `Catalog/Template/`.

## Manifest

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "author": "You",
  "description": "Forecast from Open-Meteo.",
  "icon": "icon.svg",
  "categories": ["utilities"],
  "permissions": ["net:fetch", "storage"],
  "net": { "hosts": ["api.open-meteo.com", "*.open-meteo.com"] },
  "contributes": {
    "windows": [{ "id": "main", "entry": "index.html", "defaultSize": { "width": 720, "height": 520 } }],
    "widgets": [{ "id": "today", "name": "Weather today", "entry": "widget.html", "sizes": { "s": { "cols": 1, "rows": 1 }, "m": { "cols": 2, "rows": 1 }, "l": { "cols": 3, "rows": 2 } }, "settingsFields": [{ "key": "unit", "label": "Unit", "type": "select", "options": [{ "value": "c", "label": "°C" }, { "value": "f", "label": "°F" }], "defaultValue": "c" }] }],
    "trayItems": [{ "id": "temp", "title": "Temperature", "entry": "tray.html" }],
    "startupAnimations": [{ "id": "clouds", "name": "Clouds", "entry": "startup.html" }],
    "cursorSets": [{ "id": "mono", "name": "Mono", "cursors": { "default": { "file": "cursors/default.svg", "hotspotX": 2, "hotspotY": 2 } } }],
    "themes": [{ "id": "dusk", "name": "Dusk", "accent": "#ff9f0a", "tokens": { "dark": { "--color-background": "#0b0a14" }, "light": {} } }],
    "wallpapers": [{ "id": "sky", "name": "Sky", "file": "wallpapers/sky.webp" }],
    "actions": [{ "id": "refresh", "title": "Refresh the forecast", "params": [] }],
    "background": { "entry": "background.html" }
  }
}
```

Rules (`Shared/src/AppManifest.ts` is the source of truth): ids are lowercase letters, digits and dashes; versions are semver; every entry and file is a relative path inside the zip; the manifest is strict (unknown keys are rejected). Cursor sets, themes and wallpapers need no code at all. SVGs may not contain scripts, event handlers, `foreignObject` or embeds.

## Surfaces

| Contribution | Where it runs | Frame params |
|---|---|---|
| `windows` | a desktop window (the first one is "the app" in the launcher) | whatever opened it: action params, `landscape.ui.openWindow(id, params)` |
| `widgets` | inside a desktop widget frame | `{ settings, size, widgetId }`, updated through `ui.onParams` |
| `trayItems`, `taskbarItems` | a 36 × 28 px frame in the taskbar | `{ vertical }` |
| `startupAnimations` | full screen at startup; call `landscape.ui.close()` when done | the startup settings (`durationMs`, `text`, colors, `logoUrl`) |
| `background` | a hidden page while LANdscape is open; receives the app's actions when no window is open | none |

Every surface has **no network access**: scripts, styles, images and fonts are inlined by the server at load time, external URLs are stripped. Use `landscape.net.fetch` for data.

## The SDK

Import the types for autocompletion (`npm install` the repo, then `import type { Landscape } from '@landscape/sdk'`); at runtime `window.landscape` already exists before your script runs.

```js
landscape.theme.apply();                         // LANdscape's design tokens as CSS custom properties on :root
const { appName, surface, params, permissions } = landscape.context;

const cpu = await landscape.metrics.sample('cpu');                  // metrics
const off = landscape.metrics.subscribe('memory', 5000, (s) => …);  // s.data or s.unavailable
const containers = await landscape.docker.list();                   // docker:read
await landscape.docker.action(id, 'restart');                       // docker:write
const text = await landscape.files.read('/etc/hosts');              // files:read
await landscape.files.write('/tmp/x', 'hi');                        // files:write
const { stdout } = await landscape.ssh.exec('uptime');              // ssh:exec
const stop = landscape.logs.open({ source: 'docker', containerId }, (m) => …); // logs
await landscape.notifications.notify({ title: 'Done', level: 'info' });        // notifications
await landscape.storage.set('notes', [...]);                        // storage (JSON, 256 KB per key, 20 MB per app)
const { status, body } = await landscape.net.fetch(url);            // net:fetch (manifest hosts, or any when trusted)
await landscape.monitor.register({ key: 'nas', kind: 'ping', label: 'NAS', address: '10.0.0.5:445' }); // monitor
await landscape.actions.invoke('docker.restart', { containerId });  // actions:invoke
landscape.actions.handle('refresh', async (params) => …);           // your own actions, no permission needed
landscape.ui.setTitle('Weather · Berlin'); landscape.ui.toast('Saved', 'success'); landscape.ui.close();
const ok = await landscape.ui.confirm({ title: 'Delete?', message: '…', danger: true });
landscape.ui.onParams((p) => …);                                     // widgets: settings/size changed
landscape.ui.onBeforeClose(() => !dirty || confirm('Discard?'));
```

Every call returns a promise; a missing permission rejects with `error.code === 'permission_denied'`. Subscriptions return an unsubscribe function. Logs, metrics and stats streams are closed when the frame goes away.

**Theme.** `landscape.theme.apply()` sets `data-theme` and the tokens (`--color-background`, `--color-label`, `--color-accent`, `--radius`, `--font-ui`, …) on your document; `landscape.theme.subscribe` fires on changes. Use the tokens so the app matches the desktop in light and dark.

**Actions.** Declare them in the manifest; they appear in the command palette and can be invoked by other apps. When one runs, LANdscape delivers it to your background page if you have one, else to an open window, else it opens your main window with `params.action = '<id>'` plus the parameters.

## Build, test, publish

1. Put the sources in a folder with `manifest.json` at its root (see `Catalog/Template/`). The packs under `Catalog/Apps/` are the smallest examples of each kind: `DuskPaper` (two themes and a wallpaper, no code), `InkCursors` (a cursor set, no code) and `RippleStartup` (a startup animation page).
2. Zip the folder (`zip -r my-app-1.0.0.zip .` inside it) or, inside this repository, put it under `Catalog/Apps/<Name>/` and run `npm run catalog`, which writes `Catalog/dist/<id>-<version>.zip` and updates `Catalog/index.json` with the sha256 and size.
3. Install it: App Store → Install from URL or file. The dialog lists the permissions; dangerous ones (`docker:write`, `files:write`, `ssh:exec`) are flagged.
4. Test: open the window, add the widget, run the action from `Ctrl+Space`. Broker errors show in the browser console as rejected promises with a `code`. `Tests/E2E/AppStore.spec.ts` shows how the template is exercised end to end.
5. Publish: commit the folder, the zip and the index on `main`; every LANdscape fetches the index live from GitHub and shows the new app within ten minutes. Bump `version` for every change; LANdscape asks for approval only when the new version needs permissions the installed one did not have.

Limits: bundle ≤ 20 MB (≤ 40 MB unpacked, ≤ 2000 files), each inlined asset ≤ 4 MB, storage values ≤ 256 KB, `net.fetch` responses ≤ 5 MB with a 15 s timeout.
