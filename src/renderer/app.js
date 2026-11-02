// The main window's own interface: the toolbar, the home screen with the
// services, and the service editor. The open page is a separate view, placed
// by the main process under the toolbar.
const { t } = cc;
const icon = window.CCIcons;
const urls = window.CCUrls;

let state = cc.init.state;
let services = cc.init.services;
let icons = cc.init.icons;
let acceleration = cc.init.acceleration;

const $ = id => document.getElementById(id);

function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class") element.className = value;
    else if (name === "html") element.innerHTML = value;
    else if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
    else if (value !== false && value !== null && value !== undefined) element.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) element.append(child);
  }
  return element;
}

function toolButton(name, label, onclick, { disabled = false, text = false } = {}) {
  return el("button", { class: text ? "tool text" : "tool", title: label, "aria-label": label, disabled, onclick },
    el("span", { html: icon(name) }), text ? el("span", {}, label) : null);
}

// MARK: Toolbar

function renderToolbar() {
  const bar = $("toolbar");
  bar.replaceChildren();
  const append = (...items) => bar.append(...items.filter(Boolean));
  bar.classList.toggle("loading", !!(state.browsing && state.loading));
  if (!state.browsing) {
    append(
      el("div", { class: "title" }, el("strong", {}, "Corner Cinema")),
      el("div", { class: "spacer" }),
      displayLinkNotice(),
      toolButton("gear", t("Settings (⌘,)"), () => cc.openSettings()),
      toolButton("plus", t("Add a Service"), () => openEditor(null), { text: true }),
    );
    return;
  }
  append(
    el("div", { class: "group" },
      toolButton("home", t("Back to your services (⇧⌘H)"), () => cc.go("home")),
      toolButton("back", t("Back (⌘[)"), () => cc.go("back"), { disabled: !state.canGoBack }),
      toolButton("forward", t("Forward (⌘])"), () => cc.go("forward"), { disabled: !state.canGoForward }),
      state.loading
        ? toolButton("stop", t("Stop"), () => cc.go("stop"))
        : toolButton("reload", t("Reload (⌘R)"), () => cc.go("reload")),
    ),
    el("div", { class: "title" },
      el("strong", {}, state.serviceName || ""),
      el("span", {}, state.title || "")),
    el("div", { class: "spacer" }),
    displayLinkNotice(),
    state.ad ? el("div", { class: "ad-badge" }, adBadgeText()) : null,
    toolButton(state.manualAd ? "megaphoneOn" : "megaphone",
      state.manualAd ? t("End of the ad: sound back on (⌃⌥⌘A)") : t("This is an ad: mute it (⌃⌥⌘A)"),
      () => cc.player("ad")),
    toolButton("pip", t("Mini Player (⇧⌘M)"), () => cc.player("mini"),
      { disabled: !(state.video && state.video.has) && !state.mini, text: true }),
  );
}

/** "Ad · muted", with the time left when "This is an ad" gives the sound back by itself. */
function adBadgeText() {
  if (!state.adUntil) return t("Ad · muted");
  const left = Math.max(0, Math.round((state.adUntil - Date.now()) / 1000));
  return `${t("Ad · muted")} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

// The countdown moves on every second.
setInterval(() => {
  const badge = document.querySelector(".ad-badge");
  if (badge && state.adUntil) badge.textContent = adBadgeText();
}, 1000);

/** DisplayLink started after the app: its video stays black until a restart. */
function displayLinkNotice() {
  if (!acceleration.needsRestart || acceleration.off) return null;
  return el("div", { class: "notice" },
    el("span", { html: icon("warning") }),
    el("span", {}, t("DisplayLink is running: restart to see the video.")),
    el("button", { onclick: () => cc.relaunch() }, t("Restart")));
}

// MARK: Home

function renderHome() {
  const home = $("home");
  home.hidden = state.browsing && !state.mini;
  if (state.browsing && state.mini) return renderMiniPlaceholder(home);
  if (state.browsing) return;
  home.replaceChildren(
    el("div", { class: "content" },
      el("h1", {}, t("Your services")),
      el("p", { class: "lead" }, t("Films and series in a corner of the screen while you work.")),
      services.length ? grid() : emptyState(),
      howItWorks()));
}

/** While the page plays in the mini player. */
function renderMiniPlaceholder(home) {
  home.replaceChildren(el("div", { class: "placeholder" },
    el("span", { class: "big-icon", html: icon("pip") }),
    el("h2", {}, t("Playing in the mini player")),
    el("p", {}, state.title || ""),
    el("div", { class: "buttons" },
      el("button", { onclick: () => cc.go("home") }, t("Stop")),
      el("button", { class: "primary", onclick: () => cc.player("window") }, t("Bring It Back Here")))));
}

function grid() {
  return el("div", { class: "grid" },
    services.map(service => el("button", {
      class: "tile",
      title: service.url,
      onclick: () => cc.openService(service.id),
      oncontextmenu: event => {
        event.preventDefault();
        cc.serviceMenu(service.id);
      },
    },
    serviceIcon(service),
    el("strong", {}, service.name),
    el("span", {}, urls.domain(service.url)))),
    el("button", { class: "tile add", onclick: () => openEditor(null) },
      el("span", { class: "service-icon", html: icon("plus") }),
      el("strong", {}, t("Add a Service")),
      el("span", {}, " ")));
}

function serviceIcon(service) {
  if (icons[service.id]) return el("img", { class: "service-icon", src: icons[service.id], alt: "" });
  let hash = 0;
  for (const c of service.name) hash = (hash * 31 + c.codePointAt(0)) & 0xffff;
  const letter = el("span", { class: "service-icon letter" }, (service.name[0] || "?").toUpperCase());
  letter.style.setProperty("--hue", String(hash % 360));
  return letter;
}

function emptyState() {
  return el("div", { class: "empty" },
    el("span", { class: "big-icon", html: icon("film") }),
    el("h2", {}, t("No services yet")),
    el("p", {}, t("Corner Cinema doesn't come with any site. Add the services you subscribe to, by their address (for example the home page of your streaming service), and sign in once: the session is kept on this Mac.")),
    el("button", { class: "primary", onclick: () => openEditor(null) }, t("Add a Service")));
}

function howItWorks() {
  const steps = [
    t("Add a service you subscribe to, with its address."),
    t("Open it and sign in once: Corner Cinema remembers it."),
    t("Start a film, then click Mini Player, or simply switch to another app: the video stays on top, in a corner."),
    t("Drag the mini player from anywhere to move it. Escape brings the video back to the window; right-click for its options."),
    t("Ads play without sound; the sound comes back with the film. If an ad slips through, click the megaphone (⌃⌥⌘A)."),
  ];
  return el("section", { class: "steps" },
    el("h3", {}, t("How it works")),
    el("ol", {}, steps.map(step => el("li", {}, step))));
}

// MARK: Error

function renderError() {
  const box = $("error");
  box.hidden = !(state.browsing && state.error);
  if (box.hidden) return;
  box.replaceChildren(
    el("span", { class: "big-icon", html: icon("warning") }),
    el("h2", {}, t("The page couldn't open")),
    el("p", {}, state.error),
    el("button", { class: "primary", onclick: () => cc.go("reload") }, t("Try Again")));
}

// MARK: Service editor

function openEditor(id) {
  const service = id ? services.find(s => s.id === id) : null;
  const dialog = $("editor");
  const address = el("input", { type: "text", value: service ? service.url : "", placeholder: "example.com", spellcheck: "false", autocomplete: "off" });
  const name = el("input", { type: "text", value: service ? service.name : "", spellcheck: "false" });
  const selector = el("input", { type: "text", class: "mono", value: service ? service.adSelector : "", placeholder: ".ad-label", spellcheck: "false" });
  const hide = el("input", { type: "text", class: "mono", value: service ? service.hideSelector || "" : "", placeholder: "#sticky-banner", spellcheck: "false" });
  const submit = el("button", { type: "submit", class: "primary" }, service ? t("Save") : t("Add and Open"));
  const refresh = () => {
    const url = urls.normalize(address.value);
    submit.disabled = !url;
    name.placeholder = url ? urls.suggestedName(url) : "";
  };
  address.addEventListener("input", refresh);

  const form = el("form", {
    method: "dialog",
    onsubmit: event => {
      event.preventDefault();
      const url = urls.normalize(address.value);
      if (!url) return;
      const data = { name: name.value, url, adSelector: selector.value, hideSelector: hide.value };
      if (service) cc.updateService({ ...data, id: service.id });
      else cc.addService(data);
      dialog.close();
    },
  },
  el("h2", {}, service ? t("Edit the Service") : t("Add a Service")),
  el("label", {}, el("span", {}, t("Address")), address),
  el("label", {}, el("span", {}, t("Name")), name),
  el("p", { class: "hint" }, t("The page where you sign in or choose what to watch.")),
  el("details", {},
    el("summary", {}, t("Advanced")),
    el("label", {}, el("span", {}, t("Ad marker (CSS selector)")), selector),
    el("p", { class: "hint" }, t("Optional. An element this service shows only during ads. Most ads are recognized without it.")),
    el("label", {}, el("span", {}, t("Hide on this service (CSS selector)")), hide),
    el("p", { class: "hint" }, t("Optional. Elements to hide on this service's pages, such as a banner stuck to the bottom. Some sites take this for an ad blocker: remove it if the site complains."))),
  el("div", { class: "buttons" },
    el("button", { type: "button", onclick: () => dialog.close() }, t("Cancel")),
    submit));
  dialog.replaceChildren(form);
  refresh();
  dialog.showModal();
  address.focus();
}

// MARK: Updates

function render() {
  renderToolbar();
  renderHome();
  renderError();
}

cc.on("state", value => {
  state = value;
  render();
});
cc.on("services", value => {
  services = value.services;
  icons = value.icons;
  render();
});
cc.on("acceleration", value => {
  acceleration = value;
  renderToolbar();
});
cc.on("edit-service", openEditor);

render();
