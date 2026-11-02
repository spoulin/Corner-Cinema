<img src="Resources/AppIcon.png" width="128" alt="">

# Corner Cinema

**English** · [Français](README.fr.md)

A video player for macOS for people who watch films and series while they work.
You add the streaming services you subscribe to, sign in once, and the video plays
in a small window that stays on top, in a corner of the screen.
Ads play without sound, and the sound comes back with the film.

## Build

```bash
scripts/build-app.sh
open "build/Corner Cinema.app"
```

Requirements: macOS 14+, Xcode / Swift 6.
To install it, copy `build/Corner Cinema.app` to `/Applications`.

## Services

- Corner Cinema comes with no site.
- **Add a Service** (＋): an address such as `example.com`, and a name.
- The service opens: sign in on its own page, as in Safari.
  The session is kept on this Mac (cookies and storage, like a browser).
- Right-click a service to edit it, move it, sign out of it (forget its cookies) or remove it.
- Sign-in pop-ups ("Continue with Google / Apple") open in a small window.

Corner Cinema presents itself as Safari and plays protected videos with
FairPlay, Safari's DRM. A service that plays in Safari plays here.
A service that only works in Chrome (Widevine) does not.

## Mini player

When a video plays, click **Mini Player** (⇧⌘M), or simply switch to another app:
the video moves to a small floating window.

- It stays on top of every app, on every desktop, and over apps in full screen.
- It takes nothing from the page: the same web page keeps playing, with the site's own
  player, controls and subtitles, shown alone over the whole window.
- It keeps the video's proportions, snaps to the edges and corners of the screen when
  dropped near them, and remembers its size and place.
- The controls show when the pointer moves over it:
  - ⟲ 10 s, play / pause, ⟳ 10 s, mute;
  - the progress bar, to move in the video;
  - 📣 *This is an ad*, the options (•••), back to the window, close (pauses).
- Drag the top of the player to move it.
- Options:
  - **Opacity**: 100 % to 40 %.
  - **Audio Only**: a thin bar with the title and the controls; the film plays on under it.
  - **Lock**: clicks go through the player to the window behind it. ⌃⌥⌘T unlocks it.
- The menu bar icon has the same controls, from any app.

*Settings › Switch to the mini player when I go to another app* turns the automatic switch off.

### DisplayLink and AirPlay screens

Screens connected through DisplayLink, AirPlay or Sidecar get a copy of the Mac's image.
macOS leaves protected videos (Netflix, Mubi…) out of that copy, and hardware-decoded
videos often stay black there too: only the sound plays. WebKit has no setting to turn
hardware acceleration off, and protected videos need it anyway.

- The mini player always goes to a screen connected to the Mac itself (same corner).
  Dropped on a DisplayLink screen, it moves back, with a message.
- On such a screen, the main window shows a banner to move it, or to use the mini player.
- *Settings › Keep the mini player on a screen connected to the Mac* turns this off.

## Ads

While an ad plays, Corner Cinema mutes the video, then gives the sound back when the
film returns. A video muted by you stays muted. Nothing is skipped, blocked or changed
on the site: the ad still plays, without sound.

- An ad is recognized by:
  - its label in the player ("Ad 1 of 2", "Ad · 0:15", "Publicité", "Your video will resume after the ad");
  - the classes common ad players use;
  - frames from ad servers that play a video.
- "Ad · muted" shows in the toolbar and on the mini player.
- An ad not recognized: click 📣 (or ⌃⌥⌘A). The sound stays off until you click again.
- For a service whose ads are always missed: *Edit › Advanced › Ad marker*, a CSS
  selector of an element the service shows only during ads.
  The Web Inspector helps to find one: Safari › Develop › *your Mac* › Corner Cinema.

## Shortcuts from any app

| Action | Shortcut |
| --- | --- |
| Play / Pause | ⌃⌥⌘P |
| Back / forward 10 seconds | ⌃⌥⌘J / ⌃⌥⌘L |
| Mute / unmute | ⌃⌥⌘M |
| This is an ad (mute until pressed again) | ⌃⌥⌘A |
| Lock / unlock the mini player | ⌃⌥⌘T |
| Show / hide the mini player | ⌃⌥⌘H |

In the app: ⇧⌘M mini player, ⇧⌘H home, ⌘[ / ⌘] back / forward, ⌘R reload.
The shortcuts use the key positions of a US keyboard (letters are at the same place on a
Canadian French keyboard).

## Automation

- `open "cornercinema://open?url=https%3A%2F%2Fexample.com%2Fwatch"`: opens a page.
- `open "cornercinema://mini"`: mini player on or off.
- `open "cornercinema://play-pause"`.

## How it works

- `PlayerModel`: one `WKWebView` (persistent website data, Safari user agent), its
  state, its commands and the ad state of every frame.
- `PageScript`: the script added to every page and frame, in its own JavaScript world
  (the site can't see it):
  - ad detection and muting, in each frame;
  - in the top frame, the main video's state and controls, and the isolated player.
- `MiniPlayer`: the floating panel (`NSPanel`) the web view moves into. Moving the same
  web view keeps the video playing, protected videos included.
- `MiniOverlay`: the controls drawn over the video (SwiftUI).
- `MainWindowController`: the main window (AppKit), with the SwiftUI views and toolbar.
- `HotKeys`: the shortcuts from any app (Carbon hot keys, no permission needed).
- Netflix stops with an error when a script moves its video: its player is driven with
  the keys it understands (space, ← and →).

The interface is in English, and in French when the Mac is in French (`Resources/fr.lproj`).

### Development

Debug builds (`scripts/build-app.sh debug`) add hooks to check the app from a terminal:

```bash
open "cornercinema://debug-eval?js=document.title"     # result in the log
open "cornercinema://debug-snapshot?path=/tmp/cc"      # /tmp/cc-web.png, -window.png, -mini.png
log stream --level info --predicate 'subsystem == "local.cornercinema"'
```

## License

[MIT](LICENSE).
