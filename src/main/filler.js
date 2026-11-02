// Music during ads: while the page is muted for an ad, a hidden player plays
// the source the user chose (Settings), fading in and out. The source is a
// radio playlist (.pls, .m3u), a stream or audio file address, or a file or
// folder on this Mac.
const { BrowserWindow, net } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const store = require("./store");

const AUDIO_FILES = /\.(mp3|m4a|aac|wav|aiff?|flac|ogg|oga|opus|caf)$/i;

class Filler {
  constructor() {
    this.window = null;
    this.source = null;
    this.ready = null;
  }

  /** Prepares the source in Settings (again if it changed). */
  async prepare() {
    const { adFillerSource } = store.settings();
    const source = (adFillerSource || "").trim();
    if (source === this.source && this.ready) return this.ready;
    this.source = source;
    this.ready = (async () => {
      if (!source) return false;
      const { list, live } = await resolve(source);
      if (!list.length) return false;
      await this.load();
      await this.call(`filler.setSources(${JSON.stringify(list)}, ${live})`);
      return true;
    })().catch(error => {
      console.error("Music during ads:", error.message);
      return false;
    });
    return this.ready;
  }

  async start() {
    if (!(await this.prepare())) return;
    const settings = store.settings();
    this.call(`filler.start(${Number(settings.adFillerVolume)}, ${fadeMs()})`);
  }

  stop() {
    if (this.window) this.call(`filler.stop(${fadeMs()})`);
  }

  setVolume(volume) {
    if (this.window) this.call(`filler.setVolume(${Number(volume)})`);
  }

  /** Plays the source for a few seconds (the Listen button in Settings). */
  async preview() {
    await this.start();
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.stop(), 6000);
  }

  async load() {
    if (this.window && !this.window.isDestroyed()) return;
    this.window = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: "no-user-gesture-required" },
    });
    await this.window.loadFile(path.join(__dirname, "..", "renderer", "filler.html"));
  }

  call(code) {
    if (!this.window || this.window.isDestroyed()) return Promise.resolve();
    return this.window.webContents.executeJavaScript(code, true).catch(() => {});
  }
}

const fadeMs = () => Math.round(Number(store.settings().adFadeSeconds) * 1000);

/** The addresses to play for a source, and whether it is a live stream. */
async function resolve(source) {
  // A file or folder on this Mac.
  const local = source.startsWith("file://") ? new URL(source).pathname : source.replace(/^~(?=\/)/, process.env.HOME || "~");
  if (local.startsWith("/") && fs.existsSync(local)) {
    if (fs.statSync(local).isDirectory()) {
      const files = fs.readdirSync(local).filter(name => AUDIO_FILES.test(name)).sort((a, b) => a.localeCompare(b))
        .map(name => pathToFileURL(path.join(local, name)).href);
      return { list: files, live: false };
    }
    return { list: [pathToFileURL(local).href], live: false };
  }
  // A playlist that points to the stream (.pls, .m3u): its addresses, mirrors first to last.
  const url = new URL(source);
  if (/\.(pls|m3u)$/i.test(url.pathname)) {
    const text = await (await net.fetch(url.href)).text();
    const list = /\.pls$/i.test(url.pathname)
      ? [...text.matchAll(/^File\d+=(.+)$/gim)].map(match => match[1].trim())
      : text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"));
    return { list: list.filter(address => /^https?:\/\//i.test(address)), live: true };
  }
  // A stream or a single audio file.
  return { list: [url.href], live: !AUDIO_FILES.test(url.pathname) };
}

module.exports = { Filler };
