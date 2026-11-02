// What the mini player shows of its own: a short message (locked, unlocked),
// and in audio-only mode, a thin bar with the title and the controls (the
// video is hidden under it). Dragging the bar outside its buttons moves the
// player. The bar is built once and only updated, so a click is never lost.
const { t } = cc;
const shapes = {
  play: '<path fill="currentColor" stroke="none" d="M6 4.2v11.6c0 .6.6.9 1.1.6l9.2-5.8c.5-.3.5-.9 0-1.2L7.1 3.6C6.6 3.3 6 3.6 6 4.2z"/>',
  pause: '<rect fill="currentColor" stroke="none" x="5" y="4" width="3.6" height="12" rx="1"/><rect fill="currentColor" stroke="none" x="11.4" y="4" width="3.6" height="12" rx="1"/>',
  back: '<path d="M4.5 10a5.5 5.5 0 1 0 1.6-3.9"/><path d="M5.5 3.5v3h3"/><text x="10" y="12.6" font-size="6" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>',
  forward: '<path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9"/><path d="M14.5 3.5v3h-3"/><text x="10" y="12.6" font-size="6" text-anchor="middle" fill="currentColor" stroke="none" font-weight="700">10</text>',
  sound: '<path d="M3.5 8h2.5l4-3.2v10.4L6 12H3.5z"/><path d="M13 7.5a3.5 3.5 0 0 1 0 5M15 5.5a6.3 6.3 0 0 1 0 9"/>',
  muted: '<path d="M3.5 8h2.5l4-3.2v10.4L6 12H3.5z"/><path d="M13 8l4 4M17 8l-4 4"/>',
  more: '<circle fill="currentColor" stroke="none" cx="5" cy="10" r="1.4"/><circle fill="currentColor" stroke="none" cx="10" cy="10" r="1.4"/><circle fill="currentColor" stroke="none" cx="15" cy="10" r="1.4"/>',
  video: '<rect x="2.5" y="4" width="15" height="12" rx="2"/><path fill="currentColor" stroke="none" d="M8.5 7.5v5l4-2.5z"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
};

function el(tag, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  return element;
}

/** A button whose symbol and label can change. */
function button(onclick, { big = false } = {}) {
  const element = el("button", big ? "big" : "");
  element.addEventListener("click", () => onclick());
  element.show = (name, label) => {
    if (element.dataset.shape !== name) {
      element.innerHTML = `<svg class="icon" viewBox="0 0 20 20" aria-hidden="true">${shapes[name]}</svg>`;
      element.dataset.shape = name;
    }
    element.title = label;
    element.setAttribute("aria-label", label);
  };
  return element;
}

function time(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const bar = document.getElementById("bar");
const controls = el("div", "row");
const play = button(() => cc.player("toggle"), { big: true });
const back = button(() => cc.player("back"));
const forward = button(() => cc.player("forward"));
const mute = button(() => cc.player("mute"));
const title = el("div", "title");
const titleText = el("span");
const titleTime = el("small");
title.append(titleText, titleTime);
const more = button(() => cc.player("menu"));
const video = button(() => cc.player("audio", false));
const close = button(() => cc.player("close"));
controls.append(play, title, back, forward, mute, more, video, close);
bar.append(controls);
back.show("back", t("Back 10 seconds (⌃⌥⌘J)"));
forward.show("forward", t("Forward 10 seconds (⌃⌥⌘L)"));
more.show("more", t("Options"));
video.show("video", t("Show the video"));
close.show("close", t("Close (pauses the video)"));
const notice = document.getElementById("notice");

function render(state) {
  const { video: current, audioOnly, muted } = state;
  document.body.classList.toggle("audio", audioOnly);
  play.show(current.p ? "pause" : "play", t("Play / Pause (⌃⌥⌘P)"));
  mute.show(muted ? "muted" : "sound", muted ? t("Unmute (⌃⌥⌘M)") : t("Mute (⌃⌥⌘M)"));
  titleText.textContent = current.title || "";
  titleTime.hidden = !current.d;
  titleTime.textContent = current.d ? `${time(current.t)} / ${time(current.d)}` : "";
  notice.hidden = !state.notice;
  notice.textContent = state.notice || "";
}

bar.addEventListener("pointerdown", event => {
  if (event.button !== 0 || event.target.closest("button")) return;
  bar.setPointerCapture(event.pointerId);
  bar.dragging = true;
  cc.player("drag", "start");
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  bar.addEventListener(type, () => {
    if (!bar.dragging) return;
    bar.dragging = false;
    cc.player("drag", "end");
  });
}

cc.on("mini-state", render);
