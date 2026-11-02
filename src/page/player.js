// Runs in the service page's top frame, in Corner Cinema's own JavaScript
// world (the site can't see it): finds the main video, reports its state,
// drives it, and isolates the site's player for the mini player. The styles of
// the isolated player are in focus.css, added by the app.
(() => {
  if (window.__cc) return;

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

  // The player's box: the highest ancestor of the video that is still about
  // its size. It holds the site's controls, subtitles and ad labels.
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
    if (target && target.tagName === "VIDEO") return target;
    return null;
  };

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
    if (!target) return false;
    // A video in a custom player element: isolate the element.
    while (target.getRootNode() !== document && target.getRootNode().host) target = target.getRootNode().host;
    const box = playerBox(target);
    for (let e = target; e && e !== box; e = e.parentElement) e.classList.add("cc-video-chain");
    for (let e = box.parentElement; e; e = e.parentElement) e.classList.add("cc-video-ancestor");
    box.classList.add("cc-video-box");
    window.scrollTo(0, 0);
    return true;
  };

  // Sites replace their player (next episode, page change): mark the new one.
  setInterval(() => {
    if (!mini || Date.now() - focusedAt < 1000) return;
    const box = document.querySelector(".cc-video-box");
    const ok = box && box.isConnected
      && (box.tagName === "VIDEO" || box.tagName === "IFRAME" || box.querySelector("video, iframe"));
    if (!ok) focus();
  }, 1000);

  const api = window.__cc = {
    state() {
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
    },
    toggle() {
      const v = mainVideo();
      if (v) v.paused ? v.play().catch(() => {}) : v.pause();
    },
    seek(t) {
      const v = mainVideo();
      if (!v || !v.seekable.length) return;
      v.currentTime = Math.min(Math.max(v.seekable.start(0), t), v.seekable.end(v.seekable.length - 1) - 0.25);
    },
    skip(seconds) {
      const v = mainVideo();
      if (v) api.seek(v.currentTime + seconds);
    },
    pause() {
      for (const v of videos()) v.pause();
    },
    setMini(on) {
      mini = on;
      if (on) focus();
      else unfocus();
    },
  };
})();
