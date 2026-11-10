// Shortcuts that work from any app. Each action has a default; the user can
// choose another one in Settings, or none. Stored as Electron accelerators.
const { globalShortcut } = require("electron");
const store = require("./store");

const ACTIONS = [
  { id: "toggle", title: "Play / Pause", key: "Control+Alt+Command+P" },
  { id: "back", title: "Back 10 Seconds", key: "Control+Alt+Command+J" },
  { id: "forward", title: "Forward 10 Seconds", key: "Control+Alt+Command+L" },
  { id: "mute", title: "Mute / Unmute", key: "Control+Alt+Command+M" },
  { id: "ad", title: "This Is an Ad (Mute Until Pressed Again)", key: "Control+Alt+Command+A" },
  { id: "lock", title: "Lock / Unlock the Mini Player", key: "Control+Alt+Command+T" },
  { id: "hide", title: "Show / Hide the Mini Player", key: "Control+Alt+Command+H" },
  { id: "louder", title: "Music During Ads: Louder", key: "Control+Alt+Command+=" },
  { id: "quieter", title: "Music During Ads: Quieter", key: "Control+Alt+Command+-" },
];

const SYMBOLS = { Control: "⌃", Alt: "⌥", Shift: "⇧", Command: "⌘", Up: "↑", Down: "↓", Left: "←", Right: "→", Return: "↩", Backspace: "⌫", Delete: "⌦", Tab: "⇥" };

let handlers = {};
const unavailable = new Set();

/** The accelerator of an action ("" when the user turned it off). */
function accelerator(id) {
  const chosen = (store.settings().shortcuts || {})[id];
  if (typeof chosen === "string") return chosen;
  const action = ACTIONS.find(a => a.id === id);
  return action ? action.key : "";
}

/** "Control+Alt+Command+P" → "⌃⌥⌘P". */
function label(id) {
  return accelerator(id).split("+").filter(Boolean).map(part => SYMBOLS[part] || part).join("");
}

const labels = () => Object.fromEntries(ACTIONS.map(({ id }) => [id, label(id)]));

/** run: { id: () => … }, called by each shortcut. */
function register(run) {
  if (run) handlers = run;
  globalShortcut.unregisterAll();
  unavailable.clear();
  for (const { id } of ACTIONS) {
    const key = accelerator(id);
    if (!key) continue;
    let ok = false;
    try {
      ok = globalShortcut.register(key, () => handlers[id] && handlers[id]());
    } catch {
      // Not a valid accelerator.
    }
    if (!ok) unavailable.add(id);
  }
}

/** While the user types a new shortcut in Settings, the others don't run. */
function pause() {
  globalShortcut.unregisterAll();
}

/**
 * A new shortcut for an action ("" to turn it off). An action that had the same
 * keys loses them. Returns the title of that action, if any.
 */
function choose(id, key) {
  if (!ACTIONS.some(a => a.id === id) || typeof key !== "string" || key.length > 60) return null;
  const chosen = { ...(store.settings().shortcuts || {}), [id]: key };
  let taken = null;
  if (key) {
    for (const action of ACTIONS) {
      if (action.id !== id && accelerator(action.id) === key) {
        chosen[action.id] = "";
        taken = action.title;
      }
    }
  }
  store.updateSettings({ shortcuts: chosen });
  register();
  return taken;
}

function reset() {
  store.updateSettings({ shortcuts: {} });
  register();
}

/** For Settings: every action, its keys, and whether another app holds them. */
const list = t => ACTIONS.map(({ id, title }) => ({ id, title: t(title), label: label(id), unavailable: unavailable.has(id) }));

module.exports = { register, pause, choose, reset, label, labels, list, accelerator };
