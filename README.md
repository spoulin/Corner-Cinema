<img src="Resources/AppIcon.png" width="128" alt="">

# Corner Cinema

**English** · [Français](README.fr.md)

A video player for macOS for people who watch films and series while they work.
You add the streaming services you subscribe to, sign in once, and watch them in the app.

> **Rewrite in progress.** Version 0.1 (Swift + WebKit, tag `v0.1-webkit`) showed no video
> while DisplayLink runs. Version 0.2 moves to Chromium with Widevine (castLabs Electron).
> Ad muting comes back in the next step.

## Use

- Corner Cinema comes with no site.
- **Add a Service** (＋): an address such as `example.com`, and a name.
- The service opens: sign in on its own page. The session is kept on this Mac.
- Right-click a service to edit it, move it, sign out of it (forget its cookies) or remove it.
- Sign-in pop-ups ("Continue with Google / Apple") open in a small window.
- ⇧⌘H home, ⌘[ / ⌘] back / forward, ⌘R reload, ⌘, settings.

## Mini player

When a video plays, click **Mini Player** (⇧⌘M), or simply switch to another app: the page
moves to a small floating window, still playing.

- It stays on top of every app, on every desktop, and over apps in full screen.
- The site's own player shows alone over the whole window, with its own controls and
  subtitles: Corner Cinema adds nothing over the video.
- It keeps the video's proportions, snaps to the edges and corners of the screen, and
  remembers its size and place.
- **Drag it from anywhere** to move it. A simple click stays a click for the site; the
  site's progress bars keep working.
- **Escape** (after a click on the player) brings the video back to the window, still playing.
- **Right-click** for the options: back to the window, close (pauses), **Opacity**
  (100 % to 40 %), **Audio Only** (a thin bar with the controls; the film plays on under it),
  **Lock** (clicks go through the player; ⌃⌥⌘T unlocks it).
- *Settings › Switch to the mini player when I go to another app* turns the automatic switch off.
- Live channels (Pluto TV) restart by themselves when paused: that is the site's choice.

### Shortcuts from any app

| Action | Shortcut |
| --- | --- |
| Play / Pause | ⌃⌥⌘P |
| Back / forward 10 seconds | ⌃⌥⌘J / ⌃⌥⌘L |
| Mute / unmute | ⌃⌥⌘M |
| Lock / unlock the mini player | ⌃⌥⌘T |
| Show / hide the mini player | ⌃⌥⌘H |

### DisplayLink

While DisplayLink runs, video drawn by the graphics chip stays black on every screen, with
only the sound, and macOS blocks protected video.

- Corner Cinema checks at launch: when DisplayLink runs, hardware acceleration is off and
  Chromium decodes and draws the video itself. The video shows, Netflix included (at 720p
  at most), at the cost of more processor work.
- DisplayLink started after the app: a notice in the toolbar offers to restart.
- *Settings › Hardware acceleration*: Automatic (default), On or Off.

## Build

Requirements: macOS 14+, Node.js 20+, Python 3.

```bash
npm install
node node_modules/electron/install.js   # downloads castLabs Electron, if npm did not
npm run evs:setup                       # castLabs EVS tool, in .evs
```

Widevine needs a VMP signature, which Netflix and others check. The signature comes
from castLabs' free EVS service, with your own account:

```bash
.evs/bin/python -m castlabs_evs.account signup   # first time; then `reauth` when it expires
npm run evs:sign-dev                             # signs node_modules/electron for `npm start`
```

Then:

- `npm start`: runs the app from the sources.
- `npm run app`: builds `dist/mac-arm64/Corner Cinema.app` (VMP-signed, then signed ad hoc for this Mac).
- `npm run dist`: builds a `.dmg` and a `.zip`.

People who download a built app need no account: the signature is in the app, and the
Widevine module downloads from Google at first launch.

## How it works

- `src/main/main.js`: app start (hardware acceleration, Widevine), menus, settings, messages.
- `src/main/main-window.js`: the main window; each open service is a `WebContentsView`
  under the toolbar, in a persistent session (`persist:services`). It drives the video.
- `src/main/mini-player.js`: the floating panel the page moves into; its audio-only bar and
  messages are `src/renderer/mini.*`.
- `src/preload/page.js`: runs in each service page, in a world the site can't see or call:
  finds, reports and drives the main video, marks the site's player and moves the mini
  player when dragged. `src/page/focus.css` shows the player alone. Nothing else in the
  page is hidden (sites check that their ad elements stay visible).
- `src/main/store.js`: services, icons and settings, as JSON in the app's data folder.
- `src/main/displaylink.js`: whether DisplayLink runs.
- `src/renderer/`: the toolbar, home screen, service editor and settings (HTML, no framework).
- `src/preload/ui.js`: the small API the app's own windows use. Service pages can't reach it.
- `scripts/evs.js`: VMP signing (before the Apple signature, as macOS requires).

The interface is in English, and in French when the Mac is in French (`src/i18n/fr.json`).

## License

[MIT](LICENSE). Electron for Content Security by castLabs; the Widevine module is
Google's, downloaded at first launch.
