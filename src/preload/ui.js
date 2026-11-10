// The app's own windows (toolbar, home screen, settings) talk to the main process
// through this small API. Service pages get no preload: they can't reach it.
const { contextBridge, ipcRenderer } = require("electron");

const init = ipcRenderer.sendSync("init");
const channels = ["state", "services", "edit-service", "acceleration", "mini-state", "shortcuts"];

contextBridge.exposeInMainWorld("cc", {
  init,
  t(text, ...values) {
    let i = 0;
    return (init.strings[text] || text).replace(/%s/g, () => String(values[i++] ?? ""));
  },
  addService: data => ipcRenderer.invoke("service:add", data),
  updateService: data => ipcRenderer.invoke("service:update", data),
  openService: id => ipcRenderer.invoke("service:open", id),
  serviceMenu: id => ipcRenderer.invoke("service:menu", id),
  go: action => ipcRenderer.invoke("go", action),
  openSettings: () => ipcRenderer.invoke("settings:open"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: changes => ipcRenderer.invoke("settings:set", changes),
  /** Choosing shortcuts in Settings. */
  pauseShortcuts: () => ipcRenderer.invoke("shortcuts:pause"),
  resumeShortcuts: () => ipcRenderer.invoke("shortcuts:resume"),
  chooseShortcut: (id, key) => ipcRenderer.invoke("shortcuts:choose", id, key),
  resetShortcuts: () => ipcRenderer.invoke("shortcuts:reset"),
  /** Video and mini player commands: toggle, back, forward, seek, mute, mini, menu, drag, close. */
  player: (action, value) => ipcRenderer.invoke("player", action, value),
  relaunch: () => ipcRenderer.invoke("relaunch"),
  signOutOfEverything: () => ipcRenderer.invoke("sign-out-all"),
  previewFiller: () => ipcRenderer.invoke("filler:preview"),
  chooseFiller: () => ipcRenderer.invoke("filler:choose"),
  on(channel, callback) {
    if (channels.includes(channel)) ipcRenderer.on(channel, (_event, value) => callback(value));
  },
});
