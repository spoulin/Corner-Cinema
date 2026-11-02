# Corner Cinema

macOS app (Electron for Content Security by castLabs: Chromium with Widevine) that plays the
user's streaming services, with an always-on-top mini player (coming back in the rewrite).
The Swift + WebKit version is kept under the tag `v0.1-webkit`: WebKit shows no video while
DisplayLink runs, Chromium without hardware acceleration does.

## Rules

- Never add a streaming site to the app by default: the user adds their own services.
- Never skip, block or alter ads or DRM: ads are only muted, locally, then unmuted.
- Never hide page elements to isolate the player: sites check that their bait ad elements
  stay visible (Tubi shows "Please disable your ad-blocker"). The player is only put on top.
- Service pages get no preload with access to the app (`src/preload/ui.js` is for the app's own windows).
- Keep `README.md` and `README.fr.md` in sync with user-visible changes.
- Every new user-visible string gets a French value in `src/i18n/fr.json` (keys are the English text).
- Plain JavaScript (CommonJS in the main process, no framework in `src/renderer`); match the neighbouring code.

## Commands

- `npm install`, then `node node_modules/electron/install.js` if `node_modules/electron/dist` is missing.
- `npm run evs:setup` once, then `npm run evs:sign-dev` after each Electron install (VMP signature).
  The EVS account is the developer's; never create or sign in to one for them.
- `npm start`: development run. `npm run app`: packaged app in `dist/mac-arm64`.
- `swift scripts/make-icon.swift`: redraws the icon.

## Checking a change

- Run with `./node_modules/.bin/electron . --remote-debugging-port=9333` and use the Chrome
  DevTools Protocol (`http://127.0.0.1:9333/json`) to evaluate scripts or take screenshots of
  the interface (`index.html`) and of the service page.
- Video frames are not in screenshots.
- The dev app and the packaged app share their data (`~/Library/Application Support/Corner Cinema`):
  the user's own services live there.
