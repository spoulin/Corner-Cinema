<img src="Resources/AppIcon.png" width="128" alt="">

# Corner Cinema

**English** · [Français](README.fr.md)

A video player for macOS for people who watch films and series while they work.
You add the streaming services you subscribe to, sign in once, and watch them in the app.

> Version 0.1 (Swift + WebKit, tag `v0.1-webkit`) showed no video while DisplayLink runs.
> Version 0.2 moves to Chromium with Widevine (castLabs Electron).

## Install

There is no download yet: build and install the app with `npm run install-app` (see
[Build](#build)). It goes to `/Applications`, where Spotlight, Raycast and the Launchpad find
it. It runs on Macs with Apple silicon, macOS 14 or later.

The app isn't signed by Apple. On a Mac other than the one that built it, macOS blocks the
first launch: open *System Settings › Privacy & Security* and click *Open Anyway*.

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
  remembers its size and place. *Settings* (or its right-click menu) turns the snapping off.
- **Drag it from anywhere** to move it. A simple click stays a click for the site; the
  site's progress bars keep working.
- **Escape** (after a click on the player) brings the video back to the window, still playing.
- **Right-click** for the options: back to the window, close (pauses), **Opacity** (presets
  from 100 % to 40 %; any value from 20 % with the slider in *Settings*), **Audio Only** (a thin
  bar with the controls; the film plays on under it), **Lock** (clicks go through the player;
  ⌃⌥⌘T unlocks it).
- *Settings › Switch to the mini player when I go to another app* turns the automatic switch off.
- The mini player doesn't make Corner Cinema the active app (it leaves you in your work), so the
  menu bar shows the other app's menus. The **menu bar icon** has the controls, the window and
  *Quit*, from any app; so does the mini player's right-click menu.
- Live channels (Pluto TV) restart by themselves when paused: that is the site's choice.

## Ads

While an ad plays, Corner Cinema mutes the page, then gives the sound back when the film
returns. Your own mute stays as you left it. Nothing is skipped, blocked or changed on the
site: the ad still plays, without sound.

- An ad is recognized, in the page and in each of its frames, by:
  - its label in the player ("Ad 1 of 2", "Ad · 0:15", "Publicité", "Advertisement",
    "Your video will resume after the ad");
  - the classes common ad players use (YouTube's among them);
  - the videos Google's ad SDK (IMA) plays its ads in (titled "Advertisement"), as on Plex;
  - frames from ad servers that play a video.
- "Ad · muted" shows in the toolbar, and for a moment on the mini player.
- An ad not recognized: click the megaphone (or ⌃⌥⌘A from any app, the menu bar icon, or
  right-click in the mini player). The sound comes back by itself after 3 min 30, a TV ad
  break (*Settings* sets the time, or "until pressed again"), or when you press it again.
- Live TV channels (such as a cable channel streamed by a TV provider) often carry the
  broadcast's own commercials in the stream, with no marker at all: only the megaphone works there.
- For a service whose ads are always missed: *Edit › Advanced › Ad marker*, a CSS selector
  of an element the service shows only during ads (*View › Developer Tools for the Page*
  helps to find one).
- *Settings › Mute ads automatically* turns it off.
- *Edit › Advanced › Hide on this service* hides what you choose on a service's pages (a CSS
  selector), such as a banner stuck to the bottom of the page. Corner Cinema comes with no such
  rule: it is your choice, service by service. Some sites take it for an ad blocker.

## YouTube

YouTube videos (`watch`, Shorts, `youtu.be`) play in YouTube's own embeddable player, in
privacy mode (`youtube-nocookie.com`, as DuckDuckGo's Duck Player does): no tracking
cookies, no page around the video, and the official player API behind the controls.
Browsing YouTube (home, search, channels) stays the normal site; ⌘[ goes back to it.

- A video that can't play outside YouTube (its owner's choice) opens on its normal page.
- YouTube Premium isn't recognized in this player: *Settings › YouTube* keeps the normal page.

## Shortcuts from any app

| Action | Shortcut |
| --- | --- |
| Play / Pause | ⌃⌥⌘P |
| Back / forward 10 seconds | ⌃⌥⌘J / ⌃⌥⌘L |
| Mute / unmute | ⌃⌥⌘M |
| This is an ad (mute until pressed again) | ⌃⌥⌘A |
| Lock / unlock the mini player | ⌃⌥⌘T |
| Show / hide the mini player | ⌃⌥⌘H |

## DisplayLink

While DisplayLink runs, video drawn by the graphics chip stays black on every screen, with
only the sound, and macOS blocks protected video.

- Corner Cinema checks at launch: when DisplayLink runs, hardware acceleration is off and
  Chromium decodes and draws the video itself. The video shows, Netflix included (at 720p
  at most), at the cost of more processor work.
- DisplayLink started after the app: a notice in the toolbar offers to restart.
- *Settings › Hardware acceleration*: Automatic (default), On or Off.

## Known limits

- **Google sign-in** ("Sign in with Google", YouTube accounts) is refused: Google blocks
  sign-in in browsers built into apps. Sign in with an email and a password where the service
  allows it. YouTube plays without an account.
- **Netflix** plays at 720p at most without hardware acceleration (with DisplayLink), as in Chrome.
- A service that only plays in Safari (FairPlay only, no Widevine) doesn't play.
- **Live channels** (Pluto TV) restart by themselves when paused.

## Privacy

- No account, no analytics, no telemetry: Corner Cinema collects nothing. Its only
  connections are the sites you open and Google's update service for the Widevine module.
- Services, settings, sites' icons, cookies and sign-ins stay on the Mac, in
  `~/Library/Application Support/Corner Cinema`.
- Each service is the service's own website, used with your own account.

## Build

Requirements: macOS 14+, Node.js 20+, Python 3.

```bash
git clone https://github.com/spoulin/Corner-Cinema.git
cd Corner-Cinema
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
- `npm run install-app`: builds the app and installs it in `/Applications` (quitting the running
  copy first). Your services, settings and sign-ins stay: they aren't in the app.
- `npm run dist`: builds a `.dmg` and a `.zip`.

People who download a built app need no account: the signature is in the app, and the
Widevine module downloads from Google at first launch.

## How it works

- `src/main/main.js`: app start (hardware acceleration, Widevine), menus, settings, messages.
- `src/main/main-window.js`: the main window; each open service is a `WebContentsView`
  under the toolbar, in a persistent session (`persist:services`). It drives the video.
- `src/main/mini-player.js`: the floating panel the page moves into; its audio-only bar and
  messages are `src/renderer/mini.*`.
- `src/preload/page.js`: runs in each service page and each of its frames, in a world the
  site can't see or call: spots ads; in the top frame, finds, reports and drives the main
  video, marks the site's player, moves the mini player when dragged and sends YouTube
  videos to the privacy player. `src/page/focus.css` shows the player alone. Nothing else
  in the page is hidden (sites check that their ad elements stay visible).
- `src/main/youtube.js`: YouTube addresses and the privacy player page.
- `src/main/store.js`: services, icons and settings, as JSON in the app's data folder.
- `src/main/displaylink.js`: whether DisplayLink runs.
- `src/renderer/`: the toolbar, home screen, service editor and settings (HTML, no framework).
- `src/preload/ui.js`: the small API the app's own windows use. Service pages can't reach it.
- `scripts/evs.js`: VMP signing (before the Apple signature, as macOS requires).

The interface is in English, and in French when the Mac is in French (`src/i18n/fr.json`).

## License

[MIT](LICENSE). Electron for Content Security by castLabs; the Widevine module is
Google's, downloaded at first launch.

Corner Cinema isn't affiliated with, or endorsed by, any streaming service. The names of
services in this document belong to their owners and only describe how the app behaves with
them. Corner Cinema doesn't bypass any copy protection: protected videos play through
Widevine, as in Chrome.
