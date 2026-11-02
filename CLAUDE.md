# Corner Cinema

macOS app (Electron for Content Security by castLabs: Chromium with Widevine) that plays the
user's streaming services, with an always-on-top mini player (coming back in the rewrite).
The Swift + WebKit version is kept under the tag `v0.1-webkit`: WebKit shows no video while
DisplayLink runs, Chromium without hardware acceleration does.

## Rules

- Never add a streaming site to the app by default: the user adds their own services.
- Never skip, block or alter ads or DRM: ads are only muted, locally, then unmuted. The only
  exception is the user's own per-service "hide" selector (Edit › Advanced); the app ships no
  hiding or blocking rule of its own.
- Never hide page elements to isolate the player: sites check that their bait ad elements
  stay visible (Tubi shows "Please disable your ad-blocker"). The player is only put on top.
- Service pages only get `src/preload/page.js`, which exposes nothing to the site (no
  `contextBridge`) and acts only on trusted events; `src/preload/ui.js` is for the app's own windows.
- Nothing of ours over the video in the mini player: the site shows its own controls.
- Keep `README.md` and `README.fr.md` in sync with user-visible changes.
- Every new user-visible string gets a French value in `src/i18n/fr.json` (keys are the English text).
- Plain JavaScript (CommonJS in the main process, no framework in `src/renderer`); match the neighbouring code.

## Commands

- `npm install`, then `node node_modules/electron/install.js` if `node_modules/electron/dist` is missing.
- `npm run evs:setup` once, then `npm run evs:sign-dev` after each Electron install (VMP signature).
  The EVS account is the developer's; never create or sign in to one for them.
- `npm start`: development run. `npm run app`: packaged app in `dist/mac-arm64`.
- `npm run install-app`: builds and installs in `/Applications` (quits the running copy). The
  user runs the installed copy: rebuild and relaunch with this, then `open -a "Corner Cinema"`.
- `swift scripts/make-icon.swift`: redraws the icon.

## Checking a change

- Run with `CORNER_CINEMA_DATA=<scratch folder> ./node_modules/.bin/electron . --remote-debugging-port=9333`
  (a separate data folder: the user's services stay untouched, and the single-instance lock
  doesn't close the test copy) and use the Chrome
  DevTools Protocol (`http://127.0.0.1:9333/json`) to evaluate scripts or take screenshots of
  the interface (`index.html`) and of the service page.
- Video frames are not in screenshots.
- In development, the page preload's notes (`console.debug("[cc] …")`, e.g. each ad detected
  or ended) show in the terminal that runs Electron.
- The dev app and the packaged app share their data (`~/Library/Application Support/Corner Cinema`):
  the user's own services live there.
