// The mini player: a floating panel over every app, on every desktop and over
// apps in full screen. It takes the open page (the video keeps playing), keeps
// the video's proportions, snaps to the screen's edges and corners, and shows
// a bar of controls when the pointer moves over it.
const { BaseWindow, Menu, WebContentsView, screen } = require("electron");
const path = require("path");
const store = require("./store");
const { t } = require("./i18n");

const BAR_HEIGHT = 84;
const AUDIO_HEIGHT = 64;
const MIN_WIDTH = 340;
const MARGIN = 14;
const SNAP_DISTANCE = 48;
const OPACITIES = [1, 0.85, 0.7, 0.55, 0.4];

class MiniPlayer {
  /** `player`: the main window, which owns the page and drives the video. */
  constructor({ preload, player }) {
    this.preload = preload;
    this.player = player;
    this.window = null;
    this.page = null;
    this.ratio = 16 / 9;
    this.controls = false;
    this.locked = false;
    this.audioOnly = false;
    this.opacity = store.settings().miniOpacity;
    this.notice = null;
    this.video = {};
  }

  get isOpen() {
    return !!this.page;
  }

  get isVisible() {
    return !!(this.window && this.window.isVisible());
  }

  show(page, video) {
    if (!this.window) this.create();
    this.page = page;
    this.window.contentView.addChildView(page, 0);
    this.setRatio(video);
    this.window.setOpacity(this.opacity);
    this.layout();
    this.window.showInactive();
    this.send();
  }

  /** Gives the page back to the main window. */
  release() {
    if (!this.page) return;
    if (this.audioOnly) this.setAudioOnly(false);
    this.setLocked(false);
    this.window.contentView.removeChildView(this.page);
    this.page = null;
    this.window.hide();
  }

  toggleHidden() {
    if (!this.isOpen) return;
    if (this.window.isVisible()) this.window.hide();
    else this.window.showInactive();
  }

  update(video) {
    const resized = video.w && video.h && (video.w !== this.video.w || video.h !== this.video.h);
    this.video = video;
    if (resized && !this.audioOnly) this.setRatio(video);
    this.send();
  }

  create() {
    const saved = store.settings().miniBounds;
    const area = screen.getPrimaryDisplay().workArea;
    const width = 480;
    const bounds = saved && screen.getDisplayMatching(saved).workArea.width ? saved : {
      x: area.x + area.width - width - MARGIN,
      y: area.y + area.height - Math.round(width / this.ratio) - MARGIN,
      width,
      height: Math.round(width / this.ratio),
    };
    const window = new BaseWindow({
      ...bounds,
      type: "panel",
      frame: false,
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      hasShadow: true,
      backgroundColor: "#000000",
      title: "Corner Cinema",
    });
    window.setAlwaysOnTop(true, "floating");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setMinimumSize(MIN_WIDTH, Math.round(MIN_WIDTH / this.ratio));
    window.on("resize", () => this.layout());
    window.on("moved", () => this.settle());
    window.on("resized", () => this.settle());
    // ⌘W and the like: back to the window, paused.
    window.on("close", event => {
      event.preventDefault();
      this.player.leaveMini({ pause: true });
    });

    const overlay = new WebContentsView({
      webPreferences: { preload: this.preload, contextIsolation: true, sandbox: true },
    });
    overlay.setBackgroundColor("#00000000");
    overlay.webContents.loadFile(path.join(__dirname, "..", "renderer", "mini.html"));
    overlay.webContents.on("did-finish-load", () => this.send());
    window.contentView.addChildView(overlay);

    this.window = window;
    this.overlay = overlay;
    this.hover = setInterval(() => this.watchPointer(), 120);
  }

  layout() {
    if (!this.window) return;
    const { width, height } = this.window.getContentBounds();
    if (this.page) this.page.setBounds({ x: 0, y: 0, width, height });
    const bar = this.audioOnly ? height : Math.min(BAR_HEIGHT, height);
    this.overlay.setBounds({ x: 0, y: height - bar, width, height: bar });
    this.overlay.setVisible(this.audioOnly || this.controls || !!this.notice);
  }

  send() {
    if (!this.overlay || this.overlay.webContents.isLoading()) return;
    this.overlay.webContents.send("mini-state", {
      video: this.video,
      canSeek: this.player.canSeek(),
      muted: this.player.isMuted(),
      audioOnly: this.audioOnly,
      locked: this.locked,
      notice: this.notice,
    });
  }

  // MARK: Proportions and place

  setRatio(video) {
    if (video && video.w > 0 && video.h > 0) this.ratio = video.w / video.h;
    if (!this.window || this.audioOnly) return;
    this.window.setAspectRatio(this.ratio);
    this.window.setMinimumSize(MIN_WIDTH, Math.round(MIN_WIDTH / this.ratio));
    const bounds = this.window.getBounds();
    const height = Math.round(Math.max(bounds.width, MIN_WIDTH) / this.ratio);
    if (Math.abs(height - bounds.height) <= 1) return;
    const area = screen.getDisplayMatching(bounds).workArea;
    const upper = bounds.y + bounds.height / 2 < area.y + area.height / 2;
    this.window.setBounds(this.inside({
      x: bounds.x,
      y: upper ? bounds.y : bounds.y + bounds.height - height,
      width: Math.max(bounds.width, MIN_WIDTH),
      height,
    }), this.window.isVisible());
  }

  /** Keeps the whole player on its screen. */
  inside(bounds) {
    const area = screen.getDisplayMatching(bounds).workArea;
    const width = Math.min(bounds.width, area.width);
    const height = Math.min(bounds.height, area.height);
    return {
      x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
      y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
      width,
      height,
    };
  }

  /** Dropped near an edge, the player settles at a small distance from it. */
  settle() {
    if (!this.window || this.dragging) return;
    const bounds = this.window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const next = { ...bounds };
    if (Math.abs(bounds.x - area.x) < SNAP_DISTANCE) next.x = area.x + MARGIN;
    else if (Math.abs(area.x + area.width - bounds.x - bounds.width) < SNAP_DISTANCE) next.x = area.x + area.width - bounds.width - MARGIN;
    if (Math.abs(bounds.y - area.y) < SNAP_DISTANCE) next.y = area.y + MARGIN;
    else if (Math.abs(area.y + area.height - bounds.y - bounds.height) < SNAP_DISTANCE) next.y = area.y + area.height - bounds.height - MARGIN;
    const fitted = this.inside(next);
    if (fitted.x !== bounds.x || fitted.y !== bounds.y || fitted.width !== bounds.width || fitted.height !== bounds.height) {
      this.window.setBounds(fitted, true);
    }
    if (!this.audioOnly) store.updateSettings({ miniBounds: fitted });
  }

  /** The bar is dragged: the window follows the pointer until it is released. */
  drag(phase) {
    clearInterval(this.dragTimer);
    if (phase !== "start" || !this.window) {
      this.dragging = false;
      this.settle();
      return;
    }
    this.dragging = true;
    const start = screen.getCursorScreenPoint();
    const origin = this.window.getBounds();
    this.dragTimer = setInterval(() => {
      const point = screen.getCursorScreenPoint();
      this.window.setPosition(origin.x + point.x - start.x, origin.y + point.y - start.y);
    }, 16);
  }

  // MARK: Controls

  /** The controls show while the pointer moves over the player, and stay while it is on them. */
  watchPointer() {
    if (!this.isVisible || this.audioOnly) return;
    if (this.locked) return this.setControls(false);
    const point = screen.getCursorScreenPoint();
    const bounds = this.window.getBounds();
    const inside = point.x >= bounds.x && point.x < bounds.x + bounds.width
      && point.y >= bounds.y && point.y < bounds.y + bounds.height;
    const moved = !this.lastPoint || point.x !== this.lastPoint.x || point.y !== this.lastPoint.y;
    this.lastPoint = point;
    const onBar = inside && point.y >= bounds.y + bounds.height - BAR_HEIGHT;
    if (inside && (moved || onBar)) {
      this.lastActivity = Date.now();
      this.setControls(true);
    } else if (!this.menuOpen && !this.dragging && (!inside || Date.now() - this.lastActivity > 2500)) {
      this.setControls(false);
    }
  }

  setControls(on) {
    if (this.controls === on) return;
    this.controls = on;
    this.layout();
  }

  setLocked(on) {
    if (this.locked === on || !this.window) return;
    this.locked = on;
    this.window.setIgnoreMouseEvents(on);
    if (on) this.controls = false;
    this.flash(on ? t("Locked: clicks go through. ⌃⌥⌘T to unlock.") : t("Unlocked"));
  }

  setAudioOnly(on) {
    if (this.audioOnly === on || !this.window) return;
    const bounds = this.window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const upper = bounds.y + bounds.height / 2 < area.y + area.height / 2;
    this.audioOnly = on;
    if (on) {
      this.videoBounds = bounds;
      this.window.setAspectRatio(0);
      this.window.setMinimumSize(MIN_WIDTH + 60, AUDIO_HEIGHT);
      this.window.setMaximumSize(4000, AUDIO_HEIGHT);
      const width = Math.max(bounds.width, MIN_WIDTH + 60);
      this.window.setBounds(this.inside({
        x: bounds.x, y: upper ? bounds.y : bounds.y + bounds.height - AUDIO_HEIGHT, width, height: AUDIO_HEIGHT,
      }), true);
    } else {
      const video = this.videoBounds || { ...bounds, height: Math.round(bounds.width / this.ratio) };
      this.window.setMaximumSize(10000, 10000);
      this.window.setBounds(this.inside({
        x: bounds.x, y: upper ? bounds.y : bounds.y + bounds.height - video.height, width: video.width, height: video.height,
      }), true);
      this.setRatio();
    }
    this.layout();
    this.send();
  }

  setOpacity(value) {
    this.opacity = value;
    if (this.window) this.window.setOpacity(value);
    store.updateSettings({ miniOpacity: value });
  }

  flash(text) {
    clearTimeout(this.noticeTimer);
    this.notice = text;
    this.layout();
    this.send();
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.layout();
      this.send();
    }, 2500);
  }

  menu() {
    this.menuOpen = true;
    Menu.buildFromTemplate([
      {
        label: t("Opacity"),
        submenu: OPACITIES.map(value => ({
          label: `${Math.round(value * 100)} %`,
          type: "radio",
          checked: Math.abs(this.opacity - value) < 0.01,
          click: () => this.setOpacity(value),
        })),
      },
      { label: t("Audio Only"), type: "checkbox", checked: this.audioOnly, click: () => this.setAudioOnly(!this.audioOnly) },
      { label: t("Lock (Clicks Go Through)"), click: () => this.setLocked(true) },
    ]).popup({ window: this.window, callback: () => { this.menuOpen = false; } });
  }
}

module.exports = { MiniPlayer, OPACITIES };
