// The app's own windows (toolbar, home screen, settings) talk to the main process
// through this small API. Service pages get no preload: they can't reach it.
const { contextBridge, ipcRenderer } = require("electron");

const init = ipcRenderer.sendSync("init");
const channels = ["state", "services", "edit-service", "acceleration"];

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
  relaunch: () => ipcRenderer.invoke("relaunch"),
  signOutOfEverything: () => ipcRenderer.invoke("sign-out-all"),
  on(channel, callback) {
    if (channels.includes(channel)) ipcRenderer.on(channel, (_event, value) => callback(value));
  },
});
