// Runs in every service page and in each of its frames, in an isolated world
// the site can't see or call. Nothing is exposed to the page.
// - Every frame: spots ads and tells the app, which mutes the page meanwhile.
// - Top frame: finds, reports and drives the main video; in the mini player,
//   marks the site's player (focus.css, added by the app, shows it alone) and
//   moves the player when dragged; sends YouTube videos to the privacy player.
const { ipcRenderer, webFrame } = require("electron");

const isTop = window === window.top;
/** { adSelector, muteAds, youtube }: the service's ad marker and the user's settings. */
let config = ipcRenderer.sendSync("cc:config") || {};
ipcRenderer.on("cc:config", (_event, value) => {
  config = value;
});

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
const textOf = e => (e.innerText ?? e.textContent ?? "").replace(/\s+/g, " ").trim();

// Videos, including those in open shadow roots (custom player elements).
const videos = (root = document) => {
  const found = [...root.querySelectorAll("video")];
  for (const e of root.querySelectorAll("*")) if (e.shadowRoot) found.push(...videos(e.shadowRoot));
  return found;
};
const best = list => list.sort((a, b) => (isPlaying(b) - isPlaying(a)) || (area(b) - area(a)))[0];

// Ad servers' frames: whatever plays in them is an ad, and never the film.
const AD_HOSTS = /imasdk|doubleclick|googlesyndication|googleads|innovid|springserve|spotx|freewheel|fwmrm|adsystem|adserver|adnxs|vpaid|tremorhub|teads|yieldmo/i;
const isAdFrame = !isTop && AD_HOSTS.test(location.href);

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
  if (isTop) {
    const target = candidates()[0];
    return target && target.tagName === "VIDEO" ? target : null;
  }
  return best(videos().filter(shown)) || null;
};

// MARK: Ads (every frame)

// An ad label: "Ad 1 of 2", "Ad · 0:15", "Publicité (0:12)", "Advertisement",
// or "Your video will resume after the ad".
const LABEL = /^(?:ads?|advert(?:isement|ising)?|commercial|publicit[eé]s?|pubs?|annonces?)\b/i;
const LABEL_ALONE = /^(?:advertisement|advertising|commercial|publicit[eé]s?)$/i;
const AFTER = /\b(?:resum|play|start|begin|continu)\w*\s+(?:after|in)\s+(?:the\s+|this\s+|these\s+)?(?:ads?|advert|commercial)|\b(?:reprend|recommence|commence|d[eé]marre|continue)\w*\s+(?:apr[eè]s|dans)\s+(?:la\s+|cette\s+|les\s+|ces\s+)?(?:pub|annonce)/i;
// Classes ad players use (YouTube's player, countdowns).
const AD_CLASSES = ".ad-showing, .ad-interrupting, [class*='ad-countdown' i], [class*='adcountdown' i], [class*='ad-timer' i]";

const labelIn = (scope, strict) => {
  if (!scope) return false;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let node, count = 0; (node = walker.nextNode()) && count < 5000; count++) {
    const text = node.nodeValue.trim();
    if (!text || text.length > 80) continue;
    const after = AFTER.test(text);
    if (!after && !LABEL.test(text)) continue;
    const element = node.parentElement;
    if (!shown(element)) continue;
    if (after) return true;
    // The label with what is next to it ("Ad" + "1 of 2" + "0:15" in separate tags).
    const parent = element.parentElement;
    const around = parent && textOf(parent).length <= 60 ? textOf(parent) : textOf(element);
    if (LABEL.test(around) && /\d/.test(around)) return true;
    if (!strict && LABEL_ALONE.test(around)) return true;
  }
  return false;
};

const detectAd = () => {
  if (config.adSelector) {
    try {
      if ([...document.querySelectorAll(config.adSelector)].some(shown)) return true;
    } catch {
      // Not a valid selector.
    }
  }
  if ([...document.querySelectorAll(AD_CLASSES)].some(shown)) return true;
  // Google's video ad SDK (IMA) plays its ads in videos of their own, titled
  // "Advertisement" (Plex and many others): whether the player shows its ad label or not.
  if (videos().some(v => isPlaying(v) && /^advertisement$/i.test(v.title))) return true;
  if (isAdFrame) return videos().some(v => isPlaying(v) && shown(v)) || labelIn(document.body, true);
  // Around the main video, and any video that plays (players fade their video
  // out while an ad starts: it may not count as shown).
  const focused = document.querySelector(".cc-video-box");
  const scopes = new Set();
  for (const video of [mainVideo(), ...videos().filter(isPlaying)].filter(Boolean).slice(0, 4)) {
    scopes.add(focused && focused.contains(video) ? focused : playerBox(video));
  }
  return [...scopes].some(scope => labelIn(scope, false));
};

let adShown = false;
let adSeenAt = 0;
let adReportedAt = 0;
let lastAdCheck = 0;
let adCheckQueued = false;

const checkAd = () => {
  lastAdCheck = Date.now();
  if (!isTop && !isAdFrame && !document.getElementsByTagName("video").length) return;
  const now = Date.now();
  if (detectAd()) adSeenAt = now;
  // Labels flicker between two ads of a break: keep the ad for a moment.
  const ad = adSeenAt > 0 && now - adSeenAt < 1200;
  // Report changes, and an ongoing ad every 2 seconds (a frame that goes away without a word stops counting).
  if (ad !== adShown || (ad && now - adReportedAt > 2000)) {
    if (ad !== adShown) console.debug(`[cc] ad ${ad ? "on" : "off"} in ${isTop ? "page" : "frame"} ${location.host}`);
    adShown = ad;
    adReportedAt = now;
    ipcRenderer.send("cc:ad", ad);
  }
};
setInterval(checkAd, 300);

// An ad label appears: tell the app right away (timers run once a second in
// pages that aren't visible).
const checkAdSoon = () => {
  if (adCheckQueued) return;
  const wait = 150 - (Date.now() - lastAdCheck);
  if (wait <= 0) return checkAd();
  adCheckQueued = true;
  setTimeout(() => {
    adCheckQueued = false;
    checkAd();
  }, wait);
};
new MutationObserver(checkAdSoon).observe(document, {
  subtree: true, childList: true, characterData: true,
  attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"],
});
window.addEventListener("pagehide", () => {
  if (adShown) ipcRenderer.send("cc:ad", false);
});

// The film comes back from an ad in a fade (every frame: YouTube's player is one).
const fadeTargets = new WeakMap();
ipcRenderer.on("cc:fade-in", (_event, ms) => {
  console.debug(`[cc] fade-in ${ms} ms, ${videos().length} videos in ${location.host || "page"}`);
  for (const video of videos()) {
    const target = fadeTargets.has(video) ? fadeTargets.get(video) : video.volume;
    fadeTargets.set(video, target);
    video.volume = 0;
    const start = Date.now();
    const step = () => {
      const progress = Math.min(1, (Date.now() - start) / ms);
      video.volume = target * progress;
      if (progress < 1) setTimeout(step, 40);
      else fadeTargets.delete(video);
    };
    step();
  }
});

// MARK: YouTube's privacy player (top frame)

/** The page is Corner Cinema's YouTube player (see main/youtube.js). */
const youtubePlayer = () => isTop && !!document.documentElement && !!document.documentElement.dataset.ccYoutube;
const youtube = code => webFrame.executeJavaScript(`window.__ccYouTube && __ccYouTube.${code}`).catch(() => null);

/** watch?v=ID, youtu.be/ID, /shorts/ID, /live/ID → ID. */
function youtubeID(address) {
  let url;
  try {
    url = new URL(address, location.href);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "youtu.be" && host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  let id;
  if (host === "youtu.be") id = parts[0];
  else if (["shorts", "live"].includes(parts[0])) id = parts[1];
  else if (parts[0] === "watch") id = url.searchParams.get("v");
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

// On YouTube, a click on a video opens it in the privacy player instead.
if (isTop) {
  window.addEventListener("click", event => {
    if (!config.youtube || !event.isTrusted || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!/(^|\.)youtube\.com$/i.test(location.hostname)) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    const id = link && youtubeID(link.href);
    if (!id) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ipcRenderer.send("cc:youtube", id);
  }, true);
}

// MARK: Mini player (top frame)

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

if (isTop) {
  // Sites replace their player (next episode, page change): mark the new one.
  setInterval(() => {
    if (!mini || Date.now() - focusedAt < 1000) return;
    const box = document.querySelector(".cc-video-box");
    const ok = box && box.isConnected
      && (box.tagName === "VIDEO" || box.tagName === "IFRAME" || box.querySelector("video, iframe"));
    if (!ok) focus();
  }, 1000);
}

// Dragging anywhere moves the mini player (the app follows the pointer). A
// simple click stays a click for the site, except on its progress bars, which
// keep their own dragging.
const SEEK_BARS = 'input[type=range], [role=slider], [role=progressbar], [class*="scrub" i], [class*="progress" i], [class*="slider" i], [class*="seek" i]';
let press = null;
let dragging = false;
let swallowClick = false;

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

if (isTop) {
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
}

// MARK: Messages with the app (top frame)

async function state() {
  if (youtubePlayer()) {
    const yt = await youtube("state()");
    return {
      has: true,
      controls: !!(yt && yt.ready),
      t: yt ? yt.t : 0,
      d: yt ? yt.d : 0,
      live: false,
      p: !!(yt && yt.p),
      w: 16,
      h: 9,
      title: (yt && yt.title) || document.title || "",
      youtubeError: yt ? yt.error : 0,
    };
  }
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

if (isTop) {
  ipcRenderer.on("cc:player", (_event, action, value) => {
    if (youtubePlayer() && ["toggle", "seek", "skip", "pause"].includes(action)) {
      youtube(`${action}(${action === "seek" || action === "skip" ? Number(value) : ""})`);
      return;
    }
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

  setInterval(async () => ipcRenderer.send("cc:video", await state()), 500);
}
