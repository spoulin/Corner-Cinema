// Runs in every service page, in an isolated world the site can't see or call:
// - finds, reports and drives the main video;
// - in the mini player, marks the site's player (focus.css, added by the app,
//   shows it alone) and lets the player be dragged from anywhere.
// Nothing is exposed to the page.
const { ipcRenderer } = require("electron");

const shown = e => {
  if (!e || !e.isConnected) return false;
  const r = e.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  return e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
};
const area = e => {
  const r = e.getBoundingClientRect();
  return r.width * r.height;
};
const isPlaying = v => !v.paused && !v.ended && v.readyState > 2;

// Videos, including those in open shadow roots (custom player elements).
const videos = (root = document) => {
  const found = [...root.querySelectorAll("video")];
  for (const e of root.querySelectorAll("*")) if (e.shadowRoot) found.push(...videos(e.shadowRoot));
  return found;
};
const best = list => list.sort((a, b) => (isPlaying(b) - isPlaying(a)) || (area(b) - area(a)))[0];

// Ad servers' frames are never the film.
const AD_HOSTS = /imasdk|doubleclick|googlesyndication|googleads|innovid|springserve|spotx|freewheel|fwmrm|adsystem|adserver|adnxs|vpaid|tremorhub|teads|yieldmo/i;

// Videos, and players embedded from another site, largest first.
const candidates = () => [...document.querySelectorAll("video, iframe")]
  .concat(videos().filter(v => v.getRootNode() !== document))
  .filter(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 200 || r.height < 112 || !shown(e)) return false;
    return e.tagName === "VIDEO" || (/player|embed|video|watch/i.test(e.src) && !AD_HOSTS.test(e.src));
  })
  .sort((a, b) => area(b) - area(a));

// The player's box: the highest ancestor of the video that is still about its
// size. It holds the site's controls, subtitles and ad labels.
const playerBox = target => {
  const base = target.getBoundingClientRect();
  let box = target;
  while (box.parentElement && box.parentElement !== document.body && box.parentElement !== document.documentElement) {
    const r = box.parentElement.getBoundingClientRect();
    if (r.width > base.width * 1.15 || r.height > base.height * 1.4) break;
    box = box.parentElement;
  }
  return box;
};

const mainVideo = () => {
  const box = document.querySelector(".cc-video-box");
  if (box) {
    const v = box.tagName === "VIDEO" ? box : best([...box.querySelectorAll("video")]);
    if (v) return v;
  }
  const target = candidates()[0];
  return target && target.tagName === "VIDEO" ? target : null;
};

// MARK: Mini player

let mini = false;
let focusedAt = 0;

const unfocus = () => {
  for (const name of ["cc-video-box", "cc-video-chain", "cc-video-ancestor"]) {
    for (const e of [...document.getElementsByClassName(name)]) e.classList.remove(name);
  }
};

// Marks the site's player (with its controls and subtitles) to show over the
// whole page. The rest of the page stays as it is, only covered: sites check
// that their ad elements are still visible (an ad blocker hides them).
const focus = () => {
  unfocus();
  focusedAt = Date.now();
  let target = candidates()[0];
  if (!target) return;
  // A video in a custom player element: isolate the element.
  while (target.getRootNode() !== document && target.getRootNode().host) target = target.getRootNode().host;
  const box = playerBox(target);
  for (let e = target; e && e !== box; e = e.parentElement) e.classList.add("cc-video-chain");
  for (let e = box.parentElement; e; e = e.parentElement) e.classList.add("cc-video-ancestor");
  box.classList.add("cc-video-box");
  window.scrollTo(0, 0);
};

// Sites replace their player (next episode, page change): mark the new one.
setInterval(() => {
  if (!mini || Date.now() - focusedAt < 1000) return;
  const box = document.querySelector(".cc-video-box");
  const ok = box && box.isConnected
    && (box.tagName === "VIDEO" || box.tagName === "IFRAME" || box.querySelector("video, iframe"));
  if (!ok) focus();
}, 1000);

// Dragging anywhere moves the mini player (the app follows the pointer). A
// simple click stays a click for the site, except on its progress bars, which
// keep their own dragging.
const SEEK_BARS = 'input[type=range], [role=slider], [role=progressbar], [class*="scrub" i], [class*="progress" i], [class*="slider" i], [class*="seek" i]';
let press = null;
let dragging = false;
let swallowClick = false;

window.addEventListener("pointerdown", event => {
  press = null;
  if (!mini || !event.isTrusted || event.button !== 0) return;
  if (event.target instanceof Element && event.target.closest(SEEK_BARS)) return;
  press = { x: event.screenX, y: event.screenY };
}, true);

window.addEventListener("pointermove", event => {
  if (!press || dragging || !event.isTrusted) return;
  if ((event.buttons & 1) === 0) {
    press = null;
    return;
  }
  if (Math.hypot(event.screenX - press.x, event.screenY - press.y) < 5) return;
  dragging = true;
  // The release then reaches the page even if the pointer leaves the player.
  try {
    document.documentElement.setPointerCapture(event.pointerId);
  } catch {
    // The pointer is already gone.
  }
  ipcRenderer.send("cc:drag", "start");
}, true);

const endDrag = event => {
  press = null;
  if (!dragging) return;
  dragging = false;
  ipcRenderer.send("cc:drag", "end");
  // The click that ends a drag isn't for the site (it would pause the video).
  swallowClick = true;
  setTimeout(() => {
    swallowClick = false;
  }, 400);
  if (event) event.stopImmediatePropagation();
};
window.addEventListener("pointerup", endDrag, true);
window.addEventListener("pointercancel", endDrag, true);
window.addEventListener("lostpointercapture", () => endDrag(), true);
window.addEventListener("click", event => {
  if (!swallowClick) return;
  swallowClick = false;
  event.stopImmediatePropagation();
  event.preventDefault();
}, true);
// No text selection or dragged images while the player moves.
for (const type of ["dragstart", "selectstart"]) {
  window.addEventListener(type, event => {
    if (mini && (press || dragging)) event.preventDefault();
  }, true);
}

// Escape in the mini player brings the video back to the window. (The app
// usually catches the key first; this covers keys it doesn't see.)
window.addEventListener("keydown", event => {
  if (!mini || !event.isTrusted || event.key !== "Escape") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  ipcRenderer.send("cc:escape");
}, true);

// MARK: Messages with the app

function state() {
  const target = document.querySelector(".cc-video-box") || candidates()[0];
  const v = mainVideo();
  const d = v ? v.duration : 0;
  const meta = navigator.mediaSession && navigator.mediaSession.metadata;
  return {
    has: !!(target || v),
    controls: !!v,
    t: v ? v.currentTime || 0 : 0,
    d: v && isFinite(d) ? d : 0,
    live: !!v && d === Infinity,
    p: !!v && !v.paused && !v.ended,
    w: v ? v.videoWidth : 0,
    h: v ? v.videoHeight : 0,
    title: (meta && meta.title) || document.title || "",
  };
}

function seek(seconds) {
  const v = mainVideo();
  if (!v || !v.seekable.length) return;
  v.currentTime = Math.min(Math.max(v.seekable.start(0), seconds), v.seekable.end(v.seekable.length - 1) - 0.25);
}

ipcRenderer.on("cc:player", (_event, action, value) => {
  const v = mainVideo();
  switch (action) {
    case "toggle":
      if (v) v.paused ? v.play().catch(() => {}) : v.pause();
      break;
    case "seek":
      seek(Number(value));
      break;
    case "skip":
      if (v) seek(v.currentTime + Number(value));
      break;
    case "pause":
      for (const video of videos()) video.pause();
      break;
    case "mini":
      mini = !!value;
      if (mini) focus();
      else unfocus();
      endDrag();
      break;
    default:
      break;
  }
});

setInterval(() => ipcRenderer.send("cc:video", state()), 500);
