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

/** Music during ads: a radio, a stream, a file or a folder, with its volume and fades. */
function fillerSection(settings) {
  const source = el("input", {
    type: "text",
    class: "source",
    value: settings.adFillerSource || "",
    placeholder: "https://somafm.com/illstreet.pls",
    spellcheck: "false",
    onchange: event => cc.setSettings({ adFillerSource: event.target.value }),
  });
  const percent = Math.round((settings.adFillerVolume ?? 0.7) * 100);
  const volumeLabel = el("span", { class: "value" }, `${percent} %`);
  const volume = el("input", {
    type: "range", min: "5", max: "100", step: "5", value: String(percent),
    oninput: event => {
      volumeLabel.textContent = `${event.target.value} %`;
      cc.setSettings({ adFillerVolume: Number(event.target.value) / 100 });
    },
  });
  const fade = el("select", {
    onchange: event => cc.setSettings({ adFadeSeconds: Number(event.target.value) }),
  }, [[0, t("None")], [0.5, "0.5 s"], [1, "1 s"], [2, "2 s"], [3, "3 s"]].map(([value, label]) =>
    el("option", { value: String(value), selected: Number(settings.adFadeSeconds) === value }, label)));
  return el("section", {},
    el("h2", {}, t("Music during ads")),
    el("div", { class: "row" }, source,
      el("button", {
        onclick: async () => {
          const chosen = await cc.chooseFiller();
          if (!chosen) return;
          source.value = chosen;
          await cc.setSettings({ adFillerSource: chosen });
        },
      }, t("Choose…")),
      el("button", {
        onclick: async () => {
          await cc.setSettings({ adFillerSource: source.value });
          cc.previewFiller();
        },
      }, t("Listen"))),
    el("p", { class: "caption" }, t("While an ad plays without sound, this plays instead: a radio (a .pls or .m3u link, or its stream address), an audio file or a folder of music. Leave it empty for silence.")),
    el("div", { class: "row" }, el("span", {}, t("Volume of the music")), el("span", { class: "slider" }, volume, volumeLabel)),
    el("div", { class: "row" }, el("span", {}, t("Fades (music, and the film coming back)")), fade));
}

/** A slider from 20 % to 100 %, applied to the mini player while it moves. */
function opacityRow(value) {
  const percent = Math.round((value ?? 1) * 100);
  const label = el("span", { class: "value" }, `${percent} %`);
  const slider = el("input", {
    type: "range",
    min: "20",
    max: "100",
    step: "5",
    value: String(percent),
    oninput: event => {
      label.textContent = `${event.target.value} %`;
      cc.setSettings({ miniOpacity: Number(event.target.value) / 100 });
    },
  });
  return el("div", { class: "row" }, el("span", {}, t("Opacity of the mini player")),
    el("span", { class: "slider" }, slider, label));
}

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
      el("label", { class: "row" }, el("span", {}, t("Snap the mini player to the edges of the screen")), checkbox("miniSnap")),
      opacityRow(settings.miniOpacity)),
    el("section", {},
      el("h2", {}, t("Ads")),
      el("label", { class: "row" }, el("span", {}, t("Mute ads automatically")), checkbox("muteAds")),
      el("div", { class: "row" }, el("span", {}, t("“This is an ad” mutes for")), el("select", {
        onchange: async event => render(await cc.setSettings({ manualAdSeconds: Number(event.target.value) })),
      }, [[60, "1 min"], [120, "2 min"], [180, "3 min"], [210, "3 min 30"], [240, "4 min"], [300, "5 min"], [600, "10 min"],
        [0, t("Until pressed again")]].map(([value, label]) =>
        el("option", { value: String(value), selected: settings.manualAdSeconds === value }, label)))),
      el("p", { class: "caption" }, t("The ad still plays, without sound, and the sound comes back with the video. Nothing is skipped or blocked. If an ad is not recognized, click the megaphone (⌃⌥⌘A)."))),
    fillerSection(settings),
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
