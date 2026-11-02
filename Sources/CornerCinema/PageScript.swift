import Foundation

/// The script Corner Cinema adds to every page and every frame, in its own
/// JavaScript world (the site can't see it).
///
/// - In every frame: spots ads and mutes the videos while one plays, then
///   gives the sound back (only to the videos it muted itself).
/// - In the top frame: reports the main video's state, drives it, and isolates
///   the site's player over the whole page for the mini player.
enum PageScript {
    struct Config: Encodable {
        var muteAds: Bool
        /// The service's own "an ad is playing" selector, if the user gave one.
        var adSelector: String
    }

    static func source(_ config: Config) -> String {
        let json = (try? JSONEncoder().encode(config)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return body.replacingOccurrences(of: "__CONFIG__", with: json)
    }

    static let state = "window.__cc ? __cc.state() : null"
    static let iconCandidates = "window.__cc ? __cc.icons() : null"

    private static let body = #"""
    (() => {
      if (window.__cc) return;
      const config = __CONFIG__;
      const isTop = window === window.top;
      const frameID = Math.random().toString(36).slice(2);
      const post = message => { try { window.webkit.messageHandlers.cc.postMessage(message); } catch (e) {} };

      const shown = e => {
        if (!e || !e.isConnected) return false;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        if (e.checkVisibility) return e.checkVisibility({ opacityProperty: true, visibilityProperty: true });
        const s = getComputedStyle(e);
        return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
      };
      const area = e => { const r = e.getBoundingClientRect(); return r.width * r.height; };
      const isPlaying = v => !v.paused && !v.ended && v.readyState > 2;
      const textOf = e => (e.innerText ?? e.textContent ?? "").replace(/\s+/g, " ").trim();

      // Videos, including those in open shadow roots (custom player elements).
      const videos = (root = document) => {
        const found = [...root.querySelectorAll("video")];
        for (const e of root.querySelectorAll("*")) if (e.shadowRoot) found.push(...videos(e.shadowRoot));
        return found;
      };
      const best = list => list.sort((a, b) => (isPlaying(b) - isPlaying(a)) || (area(b) - area(a)))[0];

      // Ad servers' frames: whatever plays in them is an ad.
      const AD_HOSTS = /imasdk|doubleclick|googlesyndication|googleads|innovid|springserve|spotx|freewheel|fwmrm|adsystem|adserver|adnxs|vpaid|tremorhub|teads|yieldmo/i;
      const isAdFrame = !isTop && AD_HOSTS.test(location.href);

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

      // ---- Ads

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

      const detect = () => {
        if (config.adSelector) {
          try { if ([...document.querySelectorAll(config.adSelector)].some(shown)) return true; } catch (e) {}
        }
        if ([...document.querySelectorAll(AD_CLASSES)].some(shown)) return true;
        if (isAdFrame) return videos().some(v => isPlaying(v) && shown(v)) || labelIn(document.body, true);
        const video = isTop ? mainVideo() : best(videos().filter(shown));
        if (!video) return false;
        return labelIn(document.querySelector(".cc-video-box") || playerBox(video), false);
      };

      // How each video was before the ad: "keep" (already muted) or "restore".
      const marks = new WeakMap();
      let localAd = false, globalAd = false, seenAt = 0, reportedAt = 0;

      const muting = () => (config.muteAds && localAd) || globalAd;
      const apply = () => {
        const mute = muting();
        for (const v of videos()) {
          if (mute) {
            if (!marks.has(v)) marks.set(v, v.muted ? "keep" : "restore");
            if (!v.muted) v.muted = true;
          } else if (marks.has(v)) {
            if (marks.get(v) === "restore") v.muted = false;
            marks.delete(v);
          }
        }
      };

      let lastTick = 0, tickQueued = false;
      const tick = () => {
        if (!isTop && !isAdFrame && !document.getElementsByTagName("video").length) return;
        const now = lastTick = Date.now();
        if (detect()) seenAt = now;
        // Labels flicker between two ads of a break: keep the ad for a moment.
        const ad = seenAt > 0 && now - seenAt < 1200;
        if (ad !== localAd || !reportedAt || (ad && now - reportedAt > 2000)) {
          localAd = ad;
          reportedAt = now;
          post({ type: "ad", id: frameID, on: ad });
        }
        apply();
        if (isTop) keepFocus();
      };

      // An ad label appears: mute right away. Timers alone are not enough: in a
      // page that isn't visible (the window is behind others), WebKit runs them
      // once a second.
      const tickSoon = () => {
        if (tickQueued) return;
        const wait = 150 - (Date.now() - lastTick);
        if (wait <= 0) return tick();
        tickQueued = true;
        setTimeout(() => { tickQueued = false; tick(); }, wait);
      };
      new MutationObserver(tickSoon).observe(document.documentElement, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ["class", "style", "hidden", "aria-hidden"],
      });

      // Ad players turn their sound back on when they start.
      for (const type of ["play", "playing", "volumechange", "loadeddata"]) {
        document.addEventListener(type, () => { if (muting()) apply(); }, true);
      }
      window.addEventListener("pagehide", () => post({ type: "ad", id: frameID, on: false, gone: true }));

      const api = window.__cc = {
        setGlobalAd: on => { globalAd = on; apply(); },
        configure: values => { Object.assign(config, values); apply(); },
        // The listener's own mute: during an ad, it applies when the ad ends.
        setMuted: muted => {
          for (const v of videos()) {
            if (marks.has(v)) marks.set(v, muted ? "keep" : "restore");
            else v.muted = muted;
          }
        },
      };
      setInterval(tick, 300);
      if (!isTop) return;

      // ---- Top frame: the main video and the mini player

      // Videos, and players embedded from another site.
      const candidates = () => [...document.querySelectorAll("video, iframe")].concat(videos().filter(v => v.getRootNode() !== document))
        .filter(e => {
          const r = e.getBoundingClientRect();
          if (r.width < 200 || r.height < 112 || !shown(e)) return false;
          return e.tagName === "VIDEO" || (/player|embed|video|watch/i.test(e.src) && !AD_HOSTS.test(e.src));
        })
        .sort((a, b) => area(b) - area(a));

      function mainVideo() {
        const box = document.querySelector(".cc-video-box");
        if (box) {
          const v = box.tagName === "VIDEO" ? box : best([...box.querySelectorAll("video")]);
          if (v) return v;
        }
        const target = candidates()[0];
        return target && target.tagName === "VIDEO" ? target : null;
      }

      let mini = false, focusedAt = 0;

      const unfocus = () => {
        document.getElementById("cc-focus-style")?.remove();
        for (const name of ["cc-video-box", "cc-video-chain", "cc-video-ancestor"]) {
          for (const e of [...document.getElementsByClassName(name)]) e.classList.remove(name);
        }
      };

      // Shows the site's player (with its controls and subtitles) over the
      // whole page. The rest of the page stays as it is, only covered: sites
      // check that their ad elements are still visible (an ad blocker hides
      // them), so nothing else is hidden.
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
        const style = document.createElement("style");
        style.id = "cc-focus-style";
        // The player's ancestors go above everything else, and lose what would
        // keep the player inside them (a transform makes "fixed" relative to it).
        style.textContent = `
          .cc-video-ancestor { z-index: 2147483647 !important; transform: none !important; filter: none !important;
            contain: none !important; will-change: auto !important; perspective: none !important; opacity: 1 !important;
            isolation: auto !important; mix-blend-mode: normal !important; clip-path: none !important;
            mask: none !important; overflow: visible !important; }
          html.cc-video-ancestor, body.cc-video-ancestor { overflow: hidden !important; background: #000 !important; }
          .cc-video-box { position: fixed !important; inset: 0 !important; margin: 0 !important; padding: 0 !important;
            width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important;
            min-width: 0 !important; min-height: 0 !important; transform: none !important; border-radius: 0 !important;
            z-index: 2147483647 !important; background: #000 !important; visibility: visible !important; }
          .cc-video-chain, .cc-video-box video, .cc-video-box iframe { width: 100% !important; height: 100% !important;
            max-width: none !important; max-height: none !important; }
          .cc-video-box video { object-fit: contain !important; }`;
        (document.head || document.documentElement).appendChild(style);
        window.scrollTo(0, 0);
        return true;
      };

      // Sites replace their player (next episode, page change): focus the new one.
      function keepFocus() {
        if (!mini || Date.now() - focusedAt < 1000) return;
        const box = document.querySelector(".cc-video-box");
        const ok = box && box.isConnected && document.getElementById("cc-focus-style")
          && (box.tagName === "VIDEO" || box.tagName === "IFRAME" || box.querySelector("video, iframe"));
        if (!ok) focus();
      }

      Object.assign(api, {
        state: () => {
          const target = document.querySelector(".cc-video-box") || candidates()[0];
          const v = mainVideo();
          const d = v ? v.duration : 0;
          const meta = navigator.mediaSession && navigator.mediaSession.metadata;
          return JSON.stringify({
            has: !!(target || v),
            controls: !!v,
            t: v ? v.currentTime || 0 : 0,
            d: v && isFinite(d) ? d : 0,
            live: !!v && d === Infinity,
            p: !!v && !v.paused && !v.ended,
            m: !!v && (marks.has(v) ? marks.get(v) === "keep" : v.muted),
            w: v ? v.videoWidth : 0,
            h: v ? v.videoHeight : 0,
            title: (meta && meta.title) || document.title || "",
          });
        },
        toggle: () => {
          const v = mainVideo();
          if (v) v.paused ? v.play().catch(() => {}) : v.pause();
        },
        seek: t => {
          const v = mainVideo();
          if (!v || !v.seekable.length) return;
          v.currentTime = Math.min(Math.max(v.seekable.start(0), t), v.seekable.end(v.seekable.length - 1) - 0.25);
        },
        skip: s => { const v = mainVideo(); if (v) api.seek(v.currentTime + s); },
        setMini: on => { mini = on; on ? focus() : unfocus(); },
        // The site's icons, best first (touch icons are the largest).
        icons: () => {
          const links = [...document.querySelectorAll("link[rel~='icon' i], link[rel~='apple-touch-icon' i], link[rel~='apple-touch-icon-precomposed' i]")];
          const size = l => Math.max(0, ...String(l.sizes && l.sizes.value || "").split(/\s+/).map(s => parseInt(s, 10) || 0));
          const score = l => (/apple-touch/i.test(l.rel) ? 1000 : 0) + size(l) - (/\.svg/i.test(l.href) ? 2000 : 0);
          return JSON.stringify(links.sort((a, b) => score(b) - score(a)).map(l => l.href));
        },
      });
    })();
    """#
}
