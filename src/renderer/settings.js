// The settings window.
const { t } = cc;
document.title = t("Settings");

function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
    else if (name === "class") element.className = value;
    else if (value !== false && value !== null && value !== undefined) element.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) element.append(child);
  }
  return element;
}

let shortcuts = [];

function render({ settings, acceleration, shortcuts: list }) {
  if (list) shortcuts = list;
  const autoMini = el("input", {
    type: "checkbox",
    checked: settings.autoMini,
    onchange: async event => render(await cc.setSettings({ autoMini: event.target.checked })),
  });
  const checkbox = key => el("input", {
    type: "checkbox",
    checked: settings[key],
    onchange: async event => render(await cc.setSettings({ [key]: event.target.checked })),
  });
  const choice = el("select", {
    onchange: async event => render(await cc.setSettings({ hardwareAcceleration: event.target.value })),
  },
  [["auto", t("Automatic (off while DisplayLink runs)")], ["on", t("On")], ["off", t("Off")]].map(([value, label]) =>
    el("option", { value, selected: settings.hardwareAcceleration === value }, label)));

  const now = acceleration.off
    ? (acceleration.displayLinkAtLaunch ? t("Off: DisplayLink was running at launch.") : t("Off."))
    : t("On.");

  document.getElementById("settings").replaceChildren(
    el("section", {},
      el("h2", {}, t("Mini Player")),
      el("label", { class: "row" }, el("span", {}, t("Switch to the mini player when I go to another app")), autoMini),
      el("p", { class: "caption" }, t("Only while a video is playing. The mini player stays on top of every app, on every desktop.")),
      el("label", { class: "row" }, el("span", {}, t("Snap the mini player to the edges of the screen")), checkbox("miniSnap"))),
    el("section", {},
      el("h2", {}, t("Ads")),
      el("label", { class: "row" }, el("span", {}, t("Mute ads automatically")), checkbox("muteAds")),
      el("p", { class: "caption" }, t("The ad still plays, without sound, and the sound comes back with the video. Nothing is skipped or blocked. If an ad is not recognized, click the megaphone (⌃⌥⌘A)."))),
    el("section", {},
      el("h2", {}, t("YouTube")),
      el("label", { class: "row" }, el("span", {}, t("Play YouTube videos in YouTube's privacy player")), checkbox("youtubePrivacyPlayer")),
      el("p", { class: "caption" }, t("YouTube's embeddable player, without tracking cookies and without the page around it. YouTube Premium isn't recognized there; turn this off to keep the normal page."))),
    el("section", {},
      el("h2", {}, t("Shortcuts from any app")),
      shortcuts.map(shortcut => el("div", { class: "row shortcut" },
        el("span", {}, shortcut.title),
        el("span", { class: shortcut.unavailable ? "key unavailable" : "key", title: shortcut.unavailable ? t("Another app already uses this shortcut") : "" },
          "⌃⌥⌘" + shortcut.key)))),
    el("section", {},
      el("h2", {}, t("Hardware acceleration")),
      el("div", { class: "row" }, el("span", {}, t("Video and drawing by the graphics chip")), choice),
      el("p", { class: "caption" }, t("While DisplayLink runs, videos drawn by the graphics chip stay black on every screen, with only the sound. Without acceleration, the video shows, at the cost of more processor work (Netflix plays at 720p at most).")),
      el("p", { class: "status" }, el("strong", {}, t("Now:")), " ", now),
      acceleration.needsRestart
        ? el("div", { class: "restart" },
          el("span", {}, t("The change applies after a restart.")),
          el("button", { class: "primary", onclick: () => cc.relaunch() }, t("Restart")))
        : null),
    el("section", {},
      el("h2", {}, t("Sign-ins")),
      el("div", { class: "row" },
        el("span", {}, t("Forget the cookies and data of every site")),
        el("button", { onclick: () => cc.signOutOfEverything() }, t("Sign Out of All Services…")))));
}

cc.getSettings().then(render);
cc.on("acceleration", () => cc.getSettings().then(render));
