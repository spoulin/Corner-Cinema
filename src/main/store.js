// The user's services and settings, kept as JSON files in the app's data folder.
const { app } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const urls = require("../shared/urls");

const defaults = {
  /** "auto": off while DisplayLink runs (its screens show no video otherwise), "on" or "off". */
  hardwareAcceleration: "auto",
  /** A page to open again after a restart. */
  resumeURL: null,
  /** Bring out the mini player when the user goes to another app while a video plays. */
  autoMini: true,
  miniOpacity: 1,
  /** The mini player settles near the screen's edges and corners when dropped there. */
  miniSnap: true,
  /** Where the mini player was last left. */
  miniBounds: null,
  /** Mute the page while an ad plays (it still plays), and give the sound back after. */
  muteAds: true,
  /** How long "This is an ad" mutes the page, in seconds (0: until pressed again). */
  manualAdSeconds: 210,
  /** Music during ads: a radio playlist or stream address, an audio file or a folder ("": none). */
  adFillerSource: "",
  adFillerVolume: 0.7,
  /** Fades of the music and of the film's return, in seconds (0: none). */
  adFadeSeconds: 1,
  /** YouTube videos in YouTube's embeddable player, without cookies. */
  youtubePrivacyPlayer: true,
};

function file(name) {
  return path.join(app.getPath("userData"), name);
}

function read(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
}

function write(name, value) {
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(file(name), JSON.stringify(value, null, 2));
}

const settings = () => ({ ...defaults, ...read("settings.json", {}) });

function updateSettings(changes) {
  const next = { ...settings(), ...changes };
  write("settings.json", next);
  return next;
}

/** [{ id, name, url, adSelector, hideSelector }] in the user's order. */
const services = () => read("services.json", []);
const saveServices = list => write("services.json", list);

function addService({ name, url, adSelector = "", hideSelector = "" }) {
  const service = { id: crypto.randomUUID(), name, url, adSelector, hideSelector };
  saveServices([...services(), service]);
  return service;
}

function updateService(changed) {
  const list = services();
  const index = list.findIndex(s => s.id === changed.id);
  if (index < 0) return;
  if (urls.domain(list[index].url) !== urls.domain(changed.url)) setIcon(changed.id, null);
  list[index] = { ...list[index], ...changed };
  saveServices(list);
}

function removeService(id) {
  saveServices(services().filter(s => s.id !== id));
  setIcon(id, null);
}

function moveService(id, offset) {
  const list = services();
  const index = list.findIndex(s => s.id === id);
  const target = Math.min(Math.max(index + offset, 0), list.length - 1);
  if (index < 0 || target === index) return;
  [list[index], list[target]] = [list[target], list[index]];
  saveServices(list);
}

const service = id => services().find(s => s.id === id) || null;
const serviceFor = page => services().find(s => urls.belongsTo(page, s.url)) || null;

/** The sites' icons, as data URLs: { [service id]: "data:image/…" }. */
const icons = () => read("icons.json", {});

function setIcon(id, dataURL) {
  const all = icons();
  if (dataURL) all[id] = dataURL;
  else delete all[id];
  write("icons.json", all);
}

module.exports = {
  settings, updateSettings,
  services, addService, updateService, removeService, moveService, service, serviceFor,
  icons, setIcon,
};
