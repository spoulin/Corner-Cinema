// The music that plays during ads (in a hidden window), driven by the app
// through window.filler. A live stream starts again at the live point; files
// go on where they stopped. A stream that fails moves on to its next mirror.
(() => {
  const audio = new Audio();
  audio.preload = "none";
  let sources = [];
  let index = 0;
  let live = false;
  let playing = false;
  let fade = null;

  const ramp = (to, ms, done) => {
    clearInterval(fade);
    const from = audio.volume;
    const steps = Math.max(1, Math.round(ms / 40));
    let step = 0;
    if (ms <= 0) {
      audio.volume = to;
      if (done) done();
      return;
    }
    fade = setInterval(() => {
      step++;
      audio.volume = Math.min(1, Math.max(0, from + (to - from) * (step / steps)));
      if (step >= steps) {
        clearInterval(fade);
        if (done) done();
      }
    }, 40);
  };

  const load = position => {
    if (!sources.length) return;
    index = position % sources.length;
    audio.src = sources[index];
  };

  // Next mirror (streams) or next file (a folder).
  const next = () => {
    if (!sources.length) return;
    load(index + 1);
    if (playing) audio.play().catch(() => {});
  };
  audio.addEventListener("ended", () => { if (!live) next(); });
  audio.addEventListener("error", () => {
    if (live && index + 1 < sources.length) next();
    else if (!live && sources.length > 1) next();
  });

  window.filler = {
    /** sources: addresses to play in turn; live: a radio stream rather than files. */
    setSources(list, isLive) {
      sources = list;
      live = isLive;
      playing = false;
      audio.pause();
      load(0);
    },
    start(volume, ms) {
      if (!sources.length) return;
      playing = true;
      // A paused radio would play what it buffered minutes ago: back to the live point.
      if (live) load(index);
      audio.volume = 0;
      audio.play().catch(() => {});
      ramp(volume, ms);
    },
    stop(ms) {
      playing = false;
      ramp(0, ms, () => {
        if (!playing) audio.pause();
      });
    },
    /** For checking: what plays, at what volume. */
    state: () => ({ playing: !audio.paused, volume: Math.round(audio.volume * 100) / 100, src: audio.currentSrc, time: Math.round(audio.currentTime) }),
    setVolume(volume) {
      if (playing) ramp(volume, 150);
    },
  };
})();
