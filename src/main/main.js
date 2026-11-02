// Corner Cinema: the user's streaming services in a window (and, next, in a
// floating mini player). Chromium with Widevine (castLabs Electron).
const { app, components, dialog, globalShortcut, ipcMain, BrowserWindow, Menu, Tray, screen, session } = require("electron");
const path = require("path");
const store = require("./store");
const i18n = require("./i18n");
const urls = require("../shared/urls");
const { isDisplayLinkRunning } = require("./displaylink");
const { MainWindow, PARTITION } = require("./main-window");

const { t } = i18n;
const PRELOAD = path.join(__dirname, "..", "preload", "ui.js");

// Development: a separate data folder, so a test run doesn't touch the user's services.
if (process.env.CORNER_CINEMA_DATA) app.setPath("userData", process.env.CORNER_CINEMA_DATA);

// One Corner Cinema at a time: a second launch shows the first one's window.
if (!app.requestSingleInstanceLock()) process.exit(0);
app.on("second-instance", () => main && main.show());

// Hardware acceleration can only change before Chromium starts.
const displayLinkAtLaunch = isDisplayLinkRunning();
const accelerationMode = store.settings().hardwareAcceleration;
const accelerationOff = accelerationMode === "off" || (accelerationMode === "auto" && displayLinkAtLaunch);
if (accelerationOff) app.disableHardwareAcceleration();

// Present as Chrome: some sites refuse browsers they don't know ("Electron/…").
const chromeMajor = process.versions.chrome.split(".")[0];
app.userAgentFallback = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
  + `Chrome/${chromeMajor}.0.0.0 Safari/537.36`;

let main = null;
let settingsWindow = null;
let tray = null;
/** DisplayLink started after the app: the video stays black until a restart. */
let displayLinkNeedsRestart = false;

app.on("open-url", (event, link) => {
  event.preventDefault();
  app.whenReady().then(() => handleLink(link));
});

app.whenReady().then(async () => {
  i18n.load();
  // Widevine is installed (first launch) or updated by castLabs' component updater.
  if (components) await components.whenReady().catch(error => console.error("Widevine:", error));
  setUpSession();
  Menu.setApplicationMenu(buildMenu());
  main = new MainWindow({ preload: PRELOAD, onServicesChanged: sendServices });
  const { resumeURL } = store.settings();
  if (resumeURL) {
    store.updateSettings({ resumeURL: null });
    main.open(null, resumeURL);
  }
  watchDisplayLink();
  registerShortcuts();
  createTray();
});

// The Dock icon brings the window back (it says when the video is in the mini player).
app.on("activate", () => main && main.show());
app.on("did-resign-active", () => main && main.autoMini());
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("before-quit", () => {
  app.isQuitting = true;
});

// Sites get what playing a video needs, nothing more (no camera, microphone or location).
function setUpSession() {
  const services = session.fromPartition(PARTITION);
  const allowed = new Set(["fullscreen", "mediaKeySystem", "clipboard-sanitized-write", "pointerLock"]);
  services.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
  services.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));
}

function watchDisplayLink() {
  if (accelerationOff || accelerationMode !== "auto") return;
  const check = () => {
    if (displayLinkNeedsRestart || !isDisplayLinkRunning()) return;
    displayLinkNeedsRestart = true;
    sendAcceleration();
  };
  setInterval(check, 15000);
  screen.on("display-added", () => setTimeout(check, 3000));
}

function acceleration() {
  const saved = store.settings().hardwareAcceleration;
  const offAtNextLaunch = saved === "off" || (saved === "auto" && isDisplayLinkRunning());
  return {
    saved,
    off: accelerationOff,
    displayLinkAtLaunch,
    needsRestart: displayLinkNeedsRestart || offAtNextLaunch !== accelerationOff,
  };
}

function sendAcceleration() {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("acceleration", acceleration());
}

function sendServices() {
  const value = { services: store.services(), icons: store.icons() };
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("services", value);
}

/** Starts again, on the page that was open. */
function relaunch() {
  const url = main && main.page ? main.page.webContents.getURL() : null;
  store.updateSettings({ resumeURL: url && /^https?:/.test(url) ? url : null });
  app.relaunch();
  app.isQuitting = true;
  app.exit(0);
}

/** cornercinema://open?url=… */
function handleLink(link) {
  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return;
  }
  if (parsed.protocol !== "cornercinema:" || parsed.hostname !== "open") return;
  const page = urls.normalize(parsed.searchParams.get("url"));
  if (page && main) {
    main.open(null, page);
    main.show();
  }
}

// MARK: Playback

/** Shortcuts that work from any app (⌃⌥⌘ + a key). */
const SHORTCUTS = [
  { key: "P", title: "Play / Pause", run: () => main.togglePlayPause() },
  { key: "J", title: "Back 10 Seconds", run: () => main.skip(-10) },
  { key: "L", title: "Forward 10 Seconds", run: () => main.skip(10) },
  { key: "M", title: "Mute / Unmute", run: () => main.toggleMute() },
  { key: "A", title: "This Is an Ad (Mute Until Pressed Again)", run: () => main.toggleManualAd() },
  { key: "T", title: "Lock / Unlock the Mini Player", run: () => main.mini.isOpen && main.mini.setLocked(!main.mini.locked) },
  { key: "H", title: "Show / Hide the Mini Player", run: () => (main.mini.isOpen ? main.mini.toggleHidden() : main.enterMini()) },
];
const unavailableShortcuts = new Set();

function registerShortcuts() {
  for (const shortcut of SHORTCUTS) {
    if (!globalShortcut.register(`Control+Alt+Command+${shortcut.key}`, () => main && shortcut.run())) {
      unavailableShortcuts.add(shortcut.key);
    }
  }
}

function player(action, value) {
  switch (action) {
    case "toggle": return main.togglePlayPause();
    case "back": return main.skip(-10);
    case "forward": return main.skip(10);
    case "seek": return main.seek(Number(value));
    case "mute": return main.toggleMute();
    case "ad": return main.toggleManualAd();
    case "mini": return main.toggleMini();
    case "window": return main.leaveMini();
    case "close": return main.leaveMini({ pause: true });
    case "menu": return main.mini.menu();
    case "drag": return main.mini.drag(value);
    case "audio": return main.mini.setAudioOnly(!!value);
    default: return undefined;
  }
}

// MARK: Services

async function signOut(service) {
  const { response } = await dialog.showMessageBox(main.window, {
    type: "question",
    buttons: [t("Sign Out"), t("Cancel")],
    defaultId: 0,
    cancelId: 1,
    message: t("Sign out of %s?", service.name),
    detail: t("Corner Cinema forgets this site's cookies and data. You will sign in again next time."),
  });
  if (response !== 0) return;
  if (main.service && main.service.id === service.id) main.goHome();
  const services = session.fromPartition(PARTITION);
  const site = urls.domain(service.url);
  for (const cookie of await services.cookies.get({})) {
    const domain = cookie.domain.replace(/^\./, "");
    if (domain !== site && !domain.endsWith("." + site)) continue;
    await services.cookies.remove(`http${cookie.secure ? "s" : ""}://${domain}${cookie.path}`, cookie.name);
  }
  for (const origin of [`https://${site}`, `https://www.${site}`]) {
    await services.clearStorageData({ origin });
  }
}

async function signOutOfEverything(window) {
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    buttons: [t("Sign Out"), t("Cancel")],
    defaultId: 0,
    cancelId: 1,
    message: t("Sign out of all services?"),
    detail: t("Corner Cinema forgets the cookies and data of every site. Your services stay in the list."),
  });
  if (response !== 0) return;
  main.goHome();
  const services = session.fromPartition(PARTITION);
  await services.clearStorageData();
  await services.clearCache();
}

function serviceMenu(id) {
  const service = store.service(id);
  if (!service) return null;
  const list = store.services();
  const move = offset => {
    store.moveService(id, offset);
    sendServices();
  };
  return Menu.buildFromTemplate([
    { label: t("Open"), click: () => main.open(service) },
    { label: t("Edit…"), click: () => main.window.webContents.send("edit-service", id) },
    { type: "separator" },
    { label: t("Move Left"), enabled: list[0].id !== id, click: () => move(-1) },
    { label: t("Move Right"), enabled: list[list.length - 1].id !== id, click: () => move(1) },
    { type: "separator" },
    { label: t("Sign Out…"), click: () => signOut(service) },
    {
      label: t("Remove"),
      click: () => {
        store.removeService(id);
        sendServices();
      },
    },
  ]);
}

// MARK: Windows and menus

/** The menu bar icon: the controls, the window and Quit, from any app (the mini
 * player doesn't make Corner Cinema the active app, so its menus aren't shown). */
function createTray() {
  tray = new Tray(path.join(__dirname, "..", "assets", "trayTemplate.png"));
  tray.setToolTip("Corner Cinema");
  const show = () => tray.popUpContextMenu(trayMenu());
  tray.on("click", show);
  tray.on("right-click", show);
}

function trayMenu() {
  const items = [];
  if (main && main.page) {
    const video = main.video;
    if (video.title) items.push({ label: video.title.slice(0, 60), enabled: false });
    items.push(
      { label: video.p ? t("Pause") : t("Play"), click: () => main.togglePlayPause() },
      { label: t("Back 10 Seconds"), click: () => main.skip(-10) },
      { label: t("Forward 10 Seconds"), click: () => main.skip(10) },
      { label: main.userMuted ? t("Unmute") : t("Mute"), click: () => main.toggleMute() },
      {
        label: main.manualAd && main.manualAdUntil
          ? `${t("This Is an Ad")} · ${(() => { const left = Math.max(0, Math.round((main.manualAdUntil - Date.now()) / 1000)); return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; })()}`
          : t("This Is an Ad"),
        type: "checkbox",
        checked: main.manualAd,
        click: () => main.toggleManualAd(),
      },
      { type: "separator" },
    );
    if (main.mini.isOpen) {
      items.push(
        { label: main.mini.isVisible ? t("Hide the Mini Player") : t("Show the Mini Player"), click: () => main.mini.toggleHidden() },
        { label: t("Lock the Mini Player"), type: "checkbox", checked: main.mini.locked, click: () => main.mini.setLocked(!main.mini.locked) },
        { label: t("Back to the Window (Esc)"), click: () => main.leaveMini() },
      );
    } else {
      items.push({ label: t("Mini Player"), enabled: main.video.has, click: () => main.enterMini() });
    }
    items.push({ type: "separator" });
  }
  items.push(
    { label: t("Show Corner Cinema"), click: () => main && main.show() },
    { label: t("Settings…"), click: openSettings },
    { type: "separator" },
    { label: t("Quit Corner Cinema"), click: () => app.quit() },
  );
  return Menu.buildFromTemplate(items);
}

function openSettings() {
  if (settingsWindow) return settingsWindow.focus();
  settingsWindow = new BrowserWindow({
    width: 540,
    height: 860,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: t("Settings"),
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true },
  });
  settingsWindow.loadFile(path.join(__dirname, "..", "renderer", "settings.html"));
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

function buildMenu() {
  const go = action => () => main && main.go(action);
  return Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: "about", label: t("About Corner Cinema") },
        { type: "separator" },
        { label: t("Settings…"), accelerator: "Cmd+,", click: openSettings },
        { type: "separator" },
        { role: "services", label: t("Services") },
        { type: "separator" },
        { role: "hide", label: t("Hide Corner Cinema") },
        { role: "hideOthers", label: t("Hide Others") },
        { role: "unhide", label: t("Show All") },
        { type: "separator" },
        { role: "quit", label: t("Quit Corner Cinema") },
      ],
    },
    {
      label: t("Edit"),
      submenu: [
        { role: "undo", label: t("Undo") },
        { role: "redo", label: t("Redo") },
        { type: "separator" },
        { role: "cut", label: t("Cut") },
        { role: "copy", label: t("Copy") },
        { role: "paste", label: t("Paste") },
        { role: "selectAll", label: t("Select All") },
      ],
    },
    {
      label: t("Go"),
      submenu: [
        { label: t("Home"), accelerator: "Shift+Cmd+H", click: go("home") },
        { label: t("Back"), accelerator: "Cmd+[", click: go("back") },
        { label: t("Forward"), accelerator: "Cmd+]", click: go("forward") },
        { label: t("Reload"), accelerator: "Cmd+R", click: go("reload") },
      ],
    },
    {
      label: t("Playback"),
      submenu: [
        { label: t("Play / Pause"), accelerator: "Control+Alt+Command+P", registerAccelerator: false, click: () => main.togglePlayPause() },
        { label: t("Back 10 Seconds"), accelerator: "Control+Alt+Command+J", registerAccelerator: false, click: () => main.skip(-10) },
        { label: t("Forward 10 Seconds"), accelerator: "Control+Alt+Command+L", registerAccelerator: false, click: () => main.skip(10) },
        { label: t("Mute / Unmute"), accelerator: "Control+Alt+Command+M", registerAccelerator: false, click: () => main.toggleMute() },
        { label: t("This Is an Ad"), accelerator: "Control+Alt+Command+A", registerAccelerator: false, click: () => main.toggleManualAd() },
        { type: "separator" },
        { label: t("Mini Player"), accelerator: "Shift+Cmd+M", click: () => main.toggleMini() },
        { label: t("Show / Hide the Mini Player"), accelerator: "Control+Alt+Command+H", registerAccelerator: false, click: () => main.mini.toggleHidden() },
        { label: t("Lock / Unlock the Mini Player"), accelerator: "Control+Alt+Command+T", registerAccelerator: false, click: () => main.mini.setLocked(!main.mini.locked) },
        { label: t("Audio Only"), click: () => main.mini.setAudioOnly(!main.mini.audioOnly) },
      ],
    },
    {
      label: t("View"),
      submenu: [
        { role: "togglefullscreen", label: t("Enter Full Screen") },
        { type: "separator" },
        {
          label: t("Developer Tools for the Page"),
          accelerator: "Alt+Cmd+I",
          click: () => main && main.page && main.page.webContents.openDevTools({ mode: "detach" }),
        },
      ],
    },
    {
      role: "windowMenu",
      label: t("Window"),
    },
  ]);
}

// MARK: Messages from the windows

ipcMain.on("init", event => {
  event.returnValue = {
    strings: i18n.strings(),
    services: store.services(),
    icons: store.icons(),
    state: main ? main.state : { browsing: false },
    acceleration: acceleration(),
  };
});

ipcMain.handle("service:add", (_event, data) => {
  const url = urls.normalize(data && data.url);
  if (!url) return;
  const service = store.addService({
    name: String(data.name || "").trim() || urls.suggestedName(url),
    url,
    adSelector: String(data.adSelector || "").trim(),
    hideSelector: String(data.hideSelector || "").trim(),
  });
  sendServices();
  main.open(service);
});

ipcMain.handle("service:update", (_event, data) => {
  const url = urls.normalize(data && data.url);
  if (!url || !store.service(data.id)) return;
  store.updateService({
    id: data.id,
    name: String(data.name || "").trim() || urls.suggestedName(url),
    url,
    adSelector: String(data.adSelector || "").trim(),
    hideSelector: String(data.hideSelector || "").trim(),
  });
  sendServices();
  if (main.service && main.service.id === data.id) {
    main.service = store.service(data.id);
    main.applyHiding();
  }
});

ipcMain.handle("service:open", (_event, id) => {
  const service = store.service(id);
  if (service) main.open(service);
});

ipcMain.handle("service:menu", (event, id) => {
  const menu = serviceMenu(id);
  if (menu) menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.handle("go", (_event, action) => main.go(action));
ipcMain.handle("player", (_event, action, value) => player(action, value));

// From the service page's preload: its video, and the mini player being dragged.
ipcMain.on("cc:video", (event, video) => main && main.receiveVideo(event.sender, video));
/** What the page's preload needs: the service's ad marker and the user's settings. */
function pageConfig() {
  const settings = store.settings();
  return {
    adSelector: main && main.service ? main.service.adSelector || "" : "",
    muteAds: settings.muteAds,
    youtube: settings.youtubePrivacyPlayer,
  };
}

/** Settings changed: every frame of the open page gets them. */
function sendPageConfig() {
  if (!main || !main.page) return;
  const config = pageConfig();
  for (const frame of main.page.webContents.mainFrame.framesInSubtree) {
    try {
      frame.send("cc:config", config);
    } catch {
      // The frame went away.
    }
  }
  main.updateAudio();
}

const fromPage = event => main && main.page && event.sender === main.page.webContents;

ipcMain.on("cc:config", event => {
  event.returnValue = fromPage(event) ? pageConfig() : {};
});
ipcMain.on("cc:ad", (event, on) => {
  if (fromPage(event)) main.receiveAd(event.senderFrame, !!on);
});
ipcMain.on("cc:youtube", (event, id) => {
  if (fromPage(event) && typeof id === "string" && /^[A-Za-z0-9_-]{6,20}$/.test(id)) main.openYouTube(id);
});
ipcMain.on("cc:escape", event => {
  if (main && main.mini.isOpen && main.page && event.sender === main.page.webContents) main.leaveMini();
});
ipcMain.on("cc:drag", (event, phase) => {
  if (main && main.mini.isOpen && main.page && event.sender === main.page.webContents) main.mini.drag(phase);
});
ipcMain.handle("settings:open", () => openSettings());
ipcMain.handle("settings:get", () => ({
  settings: store.settings(),
  acceleration: acceleration(),
  shortcuts: SHORTCUTS.map(({ key, title }) => ({ key, title: t(title), unavailable: unavailableShortcuts.has(key) })),
}));

ipcMain.handle("settings:set", (_event, changes) => {
  if (changes && ["auto", "on", "off"].includes(changes.hardwareAcceleration)) {
    store.updateSettings({ hardwareAcceleration: changes.hardwareAcceleration });
    sendAcceleration();
  }
  if (changes && typeof changes.adFillerSource === "string" && changes.adFillerSource.length < 2000) {
    store.updateSettings({ adFillerSource: changes.adFillerSource.trim() });
    main.filler.prepare();
  }
  if (changes && typeof changes.adFillerVolume === "number" && changes.adFillerVolume >= 0 && changes.adFillerVolume <= 1) {
    store.updateSettings({ adFillerVolume: changes.adFillerVolume });
    main.filler.setVolume(changes.adFillerVolume);
  }
  if (changes && [0, 0.5, 1, 2, 3].includes(changes.adFadeSeconds)) store.updateSettings({ adFadeSeconds: changes.adFadeSeconds });
  if (changes && [0, 60, 120, 180, 210, 240, 300, 600].includes(changes.manualAdSeconds)) {
    store.updateSettings({ manualAdSeconds: changes.manualAdSeconds });
  }
  for (const key of ["autoMini", "miniSnap", "muteAds", "youtubePrivacyPlayer"]) {
    if (changes && typeof changes[key] === "boolean") store.updateSettings({ [key]: changes[key] });
  }
  if (changes && ("muteAds" in changes || "youtubePrivacyPlayer" in changes)) sendPageConfig();
  // The mini player's opacity, 20 % to 100 %, applied right away.
  if (changes && typeof changes.miniOpacity === "number" && changes.miniOpacity >= 0.2 && changes.miniOpacity <= 1) {
    main.mini.setOpacity(Math.round(changes.miniOpacity * 100) / 100);
  }
  return { settings: store.settings(), acceleration: acceleration() };
});

ipcMain.handle("relaunch", relaunch);
ipcMain.handle("filler:preview", () => main.filler.preview());
ipcMain.handle("filler:choose", async event => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: ["openFile", "openDirectory"],
    message: t("Choose a music file or folder"),
  });
  return canceled ? null : filePaths[0];
});
ipcMain.handle("sign-out-all", event => signOutOfEverything(BrowserWindow.fromWebContents(event.sender)));
