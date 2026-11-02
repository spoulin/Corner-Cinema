// The main window: the services, or the open page under the toolbar.
const { app, BrowserWindow, Menu, WebContentsView, nativeTheme, shell } = require("electron");
const path = require("path");
const store = require("./store");
const urls = require("../shared/urls");
const { t } = require("./i18n");

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

class MainWindow {
  constructor({ preload, onServicesChanged }) {
    this.onServicesChanged = onServicesChanged;
    /** The open page (a WebContentsView), or null on the home screen. */
    this.page = null;
    this.service = null;
    this.state = HOME_STATE;
    this.htmlFullScreen = false;

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
    this.closePage();
    this.service = service || store.serviceFor(url);
    const view = new WebContentsView({
      webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    this.page = view;
    this.freshHistory = true;
    this.window.contentView.addChildView(view);
    this.watch(view.webContents);
    this.state = {
      browsing: true,
      serviceName: this.service ? this.service.name : urls.domain(url),
      title: "",
      url,
      canGoBack: false,
      canGoForward: false,
      loading: true,
      error: null,
    };
    this.layout();
    this.send();
    view.webContents.loadURL(url);
  }

  /** Back to the services: the page and what plays in it stop. */
  goHome() {
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
    if (!this.page) return;
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
    contents.on("did-finish-load", () => this.fetchIcon());
    contents.on("enter-html-full-screen", () => {
      this.htmlFullScreen = true;
      this.layout();
    });
    contents.on("leave-html-full-screen", () => {
      this.htmlFullScreen = false;
      this.layout();
    });
    contents.on("context-menu", (_event, params) => this.contextMenu(contents, params).popup({ window: this.window }));
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
