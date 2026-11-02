# Corner Cinema

macOS app (Swift 6, SwiftUI + AppKit + WebKit, SwiftPM) that plays the user's streaming
services in a WKWebView and moves that web view into an always-on-top mini player.

## Rules

- Never add a streaming site to the app by default: the user adds their own services.
- Never skip, block or alter ads or DRM: ads are only muted, locally, then unmuted.
- Never hide page elements to isolate the player: sites check that their bait ad elements
  stay visible (Tubi shows "Please disable your ad-blocker"). The player is only put on top.
- Keep `README.md` and `README.fr.md` in sync with user-visible changes.
- Every new user-visible string gets a French value in `Resources/fr.lproj/Localizable.strings`.
- Swift language mode 5 (see `Package.swift`); match the style of the neighbouring code.

## Commands

- Build the app: `scripts/build-app.sh` (release) or `scripts/build-app.sh debug`.
- Run: `open "build/Corner Cinema.app"`.
- Redraw the icon: `swift scripts/make-icon.swift`.
- Logs: `/usr/bin/log stream --level info --predicate 'subsystem == "local.cornercinema"'`
  (in zsh, `log` alone is a builtin).

## Checking a change without the screen

Debug builds handle `cornercinema://debug-*` links (see `Sources/CornerCinema/Debug.swift`):

- `debug-eval?js=…`: runs JS in the page's Corner Cinema world; the result goes to the log.
- `debug-snapshot?path=/tmp/cc`: writes `-web.png` (page), `-window.png` (main window),
  `-mini.png` (mini player controls).
  Video frames are never in snapshots: a playing video shows black.
- `debug-mini`, `debug-hover?on=1`, `debug-audio`, `debug-lock`: mini player states.

When the Mac's screen is locked, pages count as hidden and WebKit runs their timers once a
second: ad timings measured then are slower than real use.
