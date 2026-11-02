// The main window: the services, or the open page under the toolbar.
const { app, BrowserWindow, Menu, WebContentsView, nativeTheme, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const urls = require("../shared/urls");
const { t } = require("./i18n");
const { MiniPlayer } = require("./mini-player");

const TOOLBAR_HEIGHT = 52;
/** The services' cookies and storage, kept between launches: the user signs in once. */
const PARTITION = "persist:services";

/** The site's icons, best first (touch icons are the largest). */
const ICON_CANDIDATES = `(() => {
  const links = [...document.querySelectorAll("link[rel~='icon' i], link[rel~='apple-touch-icon' i], link[rel~='apple-touch-icon-precomposed' i]")];
  const size = l => Math.max(0, ...String(l.sizes && l.sizes.value || "").split(/\\s+/).map(s => parseInt(s, 10) || 0));
  const score = l => (/apple-touch/i.test(l.rel) ? 1000 : 0) + size(l) - (/\\.svg/i.test(l.href) ? 2000 : 0);
  return links.sort((a, b) => score(b) - score(a)).map(l => l.href);
})()`;

const HOME_STATE = { browsing: false };
const NO_VIDEO = { has: false, controls: false, t: 0, d: 0, live: false, p: false, w: 0, h: 0, title: "" };

/** Finds and drives the page's video, in a world the site can't see (see preload/page.js). */
const PAGE_PRELOAD = path.join(__dirname, "..", "preload", "page.js");
/** Shows the site's player alone, in the mini player. */
const FOCUS_CSS = fs.readFileSync(path.join(__dirname, "..", "page", "focus.css"), "utf8");

class MainWindow {
  constructor({ preload, onServicesChanged }) {
    this.onServicesChanged = onServicesChanged;
    /** The open page (a WebContentsView), or null on the home screen. */
    this.page = null;
    this.service = null;
    this.state = HOME_STATE;
    this.video = NO_VIDEO;
    this.htmlFullScreen = false;
    this.mini = new MiniPlayer({ preload, player: this });

    this.window = new BrowserWindow({
      width: 1100,
      height: 720,
      minWidth: 680,
      minHeight: 440,
      show: false,
      title: "Corner Cinema",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1f22" : "#f5f5f7",
      webPreferences: { preload, contextIsolation: true, sandbox: true },
    });
    this.window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
    this.window.once("ready-to-show", () => this.window.show());
    this.window.on("resize", () => this.layout());
    // Closing hides the window (the Dock icon brings it back) and pauses what plays in it.
    this.window.on("close", event => {
      if (app.isQuitting) return;
      event.preventDefault();
      this.pauseMedia();
      this.window.hide();
    });
    // The toolbar and home screen never navigate (a link dropped on them, for example).
    this.window.webContents.on("will-navigate", event => event.preventDefault());
  }

  show() {
    this.window.show();
    this.window.focus();
  }

  /** Opens a service's home page, or another page (its service is found by its site). */
  open(service, url = service ? service.url : null) {
    if (!url) return;
    if (this.mini.isOpen) this.leaveMini({ show: false });
    this.closePage();
    this.service = service || store.serviceFor(url);
    const view = new WebContentsView({
      webPreferences: {
        partition: PARTITION,
        preload: PAGE_PRELOAD,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.page = view;
    this.freshHistory = true;
    this.window.contentView.addChildView(view);
    this.watch(view.webContents);
    this.video = NO_VIDEO;
    this.state = {
      browsing: true,
      serviceName: this.service ? this.service.name : urls.domain(url),
      title: "",
      url,
      canGoBack: false,
      canGoForward: false,
      loading: true,
      error: null,
      mini: false,
      video: { has: false, p: false },
    };
    this.layout();
    this.send();
    view.webContents.loadURL(url);
  }

  /** Back to the services: the page and what plays in it stop. */
  goHome() {
    if (this.mini.isOpen) this.leaveMini({ show: false });
    this.closePage();
    this.service = null;
    this.state = HOME_STATE;
    this.send();
  }

  go(action) {
    const contents = this.page && this.page.webContents;
    if (action === "home") return this.goHome();
    if (!contents) return;
    if (action === "back" && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    if (action === "forward" && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
    if (action === "reload") {
      this.update({ error: null });
      contents.reload();
    }
    if (action === "stop") contents.stop();
  }

  pauseMedia() {
    if (!this.page) return;
    this.page.webContents.executeJavaScript("document.querySelectorAll('video, audio').forEach(m => m.pause())", true)
      .catch(() => {});
  }

  closePage() {
    if (!this.page) return;
    this.window.contentView.removeChildView(this.page);
    this.page.webContents.close();
    this.page = null;
  }

  layout() {
    if (!this.page || this.mini.isOpen) return;
    const { width, height } = this.window.getContentBounds();
    const top = this.htmlFullScreen ? 0 : TOOLBAR_HEIGHT;
    this.page.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
    // Errors show in the window, under where the page would be.
    this.page.setVisible(!this.state.error);
  }

  update(changes) {
    if (!this.state.browsing) return;
    this.state = { ...this.state, ...changes };
    if ("error" in changes) this.layout();
    this.send();
  }

  send() {
    if (!this.window.isDestroyed()) this.window.webContents.send("state", this.state);
  }

  watch(contents) {
    // Links meant for a new tab open here; real pop-ups (sign-in with Google or
    // Apple) get a small window of their own, in the same session.
    contents.setWindowOpenHandler(({ url, disposition }) => {
      if (disposition === "foreground-tab" || disposition === "background-tab") {
        contents.loadURL(url);
        return { action: "deny" };
      }
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true } };
    });
    // mailto:, app links…: to the app that handles them.
    contents.on("will-navigate", event => {
      if (!/^(https?|about|blob|data):/i.test(event.url)) {
        event.preventDefault();
        shell.openExternal(event.url);
      }
    });

    const history = () => this.update({
      url: contents.getURL(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
    });
    contents.on("did-navigate", () => {
      // "Back" stops at the service's first page.
      if (this.freshHistory) {
        contents.navigationHistory.clear();
        this.freshHistory = false;
        // Where the service's address leads (tubi.tv → tubitv.com).
        this.landingURL = contents.getURL();
      }
      history();
    });
    contents.on("did-navigate-in-page", history);
    contents.on("did-start-loading", () => this.update({ loading: true, error: null }));
    contents.on("did-stop-loading", () => this.update({ loading: false }));
    contents.on("page-title-updated", (_event, title) => this.update({ title }));
    contents.on("did-fail-load", (_event, code, description, _url, isMainFrame) => {
      // -3: replaced by another load.
      if (!isMainFrame || code === -3) return;
      this.update({ error: description || String(code), loading: false });
    });
    contents.on("did-finish-load", () => {
      // A new page in the mini player (next episode): isolate its player too.
      if (this.mini.isOpen) this.isolatePlayer(true);
      this.fetchIcon();
    });
    // In the mini player, Escape brings the video back to the window.
    contents.on("before-input-event", (event, input) => {
      if (this.mini.isOpen && input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        this.leaveMini();
      }
    });
    contents.on("enter-html-full-screen", () => {
      this.htmlFullScreen = true;
      this.layout();
    });
    contents.on("leave-html-full-screen", () => {
      this.htmlFullScreen = false;
      this.layout();
    });
    contents.on("context-menu", (_event, params) => {
      if (this.mini.isOpen) this.mini.menu();
      else this.contextMenu(contents, params).popup({ window: this.window });
    });
  }

  // MARK: Video

  /** The page's video, as its preload reports it twice a second. */
  receiveVideo(contents, video) {
    if (!this.page || contents !== this.page.webContents || !video) return;
    this.video = video;
    const summary = { has: video.has, p: video.p };
    if (summary.has !== this.state.video.has || summary.p !== this.state.video.p) this.update({ video: summary });
    if (this.mini.isOpen) this.mini.update(video);
  }

  /** A command for the page's preload: toggle, seek, skip, pause, mini. */
  run(action, value) {
    if (this.page) this.page.webContents.send("cc:player", action, value);
  }

  /** Netflix stops with an error when a script moves its video: its player is
   * driven with the keys it understands (space, ← and →). */
  usesKeys() {
    try {
      return /(^|\.)netflix\.com$/i.test(new URL(this.page.webContents.getURL()).hostname);
    } catch {
      return false;
    }
  }

  press(keyCode) {
    const contents = this.page.webContents;
    contents.focus();
    contents.sendInputEvent({ type: "keyDown", keyCode });
    contents.sendInputEvent({ type: "keyUp", keyCode });
  }

  canSeek() {
    return !!this.page && this.video.controls && this.video.d > 0 && !this.usesKeys();
  }

  isMuted() {
    return !!this.page && this.page.webContents.isAudioMuted();
  }

  togglePlayPause() {
    if (!this.page) return;
    if (this.usesKeys()) this.press("Space");
    else this.run("toggle");
  }

  skip(seconds) {
    if (!this.page) return;
    if (this.usesKeys()) this.press(seconds < 0 ? "Left" : "Right");
    else this.run("skip", Number(seconds));
  }

  seek(seconds) {
    if (this.canSeek()) this.run("seek", Number(seconds));
  }

  /** The listener's own mute, for the whole page. */
  toggleMute() {
    if (!this.page) return;
    this.page.webContents.setAudioMuted(!this.page.webContents.isAudioMuted());
    if (this.mini.isOpen) this.mini.send();
  }

  // MARK: Mini player

  enterMini() {
    if (!this.page || !this.video.has || this.mini.isOpen) return;
    this.window.contentView.removeChildView(this.page);
    this.mini.show(this.page, this.video);
    this.isolatePlayer(true);
    this.window.hide();
    this.update({ mini: true });
  }

  /** Back to the main window, still playing (or paused, for ✕). */
  leaveMini({ pause = false, show = true } = {}) {
    if (!this.mini.isOpen) return;
    if (pause && this.video.p) this.togglePlayPause();
    this.isolatePlayer(false);
    this.mini.release();
    this.window.contentView.addChildView(this.page);
    this.update({ mini: false });
    this.layout();
    if (show) this.show();
  }

  toggleMini() {
    if (this.mini.isOpen) this.leaveMini();
    else this.enterMini();
  }

  /** While a video plays, going to another app brings out the mini player. */
  autoMini() {
    if (!store.settings().autoMini || this.mini.isOpen || !this.video.p) return;
    if (!this.window.isVisible() || this.window.isFullScreen() || this.htmlFullScreen) return;
    this.enterMini();
  }

  async isolatePlayer(on) {
    const contents = this.page && this.page.webContents;
    if (!contents) return;
    this.run("mini", on);
    if (this.focusCSS) {
      contents.removeInsertedCSS(this.focusCSS).catch(() => {});
      this.focusCSS = null;
    }
    if (on) this.focusCSS = await contents.insertCSS(FOCUS_CSS).catch(() => null);
  }

  contextMenu(contents, params) {
    const items = [];
    if (params.isEditable) {
      items.push({ role: "cut", label: t("Cut") }, { role: "copy", label: t("Copy") }, { role: "paste", label: t("Paste") },
        { type: "separator" }, { role: "selectAll", label: t("Select All") });
    } else if (params.selectionText) {
      items.push({ role: "copy", label: t("Copy") });
    } else {
      items.push(
        { label: t("Back"), enabled: contents.navigationHistory.canGoBack(), click: () => this.go("back") },
        { label: t("Reload"), click: () => this.go("reload") },
      );
    }
    items.push({ type: "separator" },
      { label: t("Inspect Element"), click: () => contents.inspectElement(params.x, params.y) });
    return Menu.buildFromTemplate(items);
  }

  /** Keeps the site's own icon for its tile, the first time the service opens. */
  async fetchIcon() {
    const service = this.service;
    const contents = this.page && this.page.webContents;
    if (!service || !contents || store.icons()[service.id]) return;
    const page = contents.getURL();
    if (!urls.belongsTo(page, service.url) && !urls.belongsTo(page, this.landingURL)) return;
    let candidates = [];
    try {
      candidates = await contents.executeJavaScriptInIsolatedWorld(1000, [{ code: ICON_CANDIDATES }]);
    } catch {
      // The page went away.
    }
    candidates.push(new URL("/favicon.ico", contents.getURL()).href);
    for (const href of candidates) {
      try {
        const response = await contents.session.fetch(href);
        const type = (response.headers.get("content-type") || "").split(";")[0];
        if (!response.ok || !type.startsWith("image/")) continue;
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length < 100) continue;
        store.setIcon(service.id, `data:${type};base64,${bytes.toString("base64")}`);
        this.onServicesChanged();
        return;
      } catch {
        // Next candidate.
      }
    }
  }
}

module.exports = { MainWindow, PARTITION };
