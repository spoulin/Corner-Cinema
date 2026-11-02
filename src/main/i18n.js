// English by default, French when the Mac is in French. The keys are the English text.
const { app } = require("electron");

let strings = {};

function load() {
  const language = (app.getPreferredSystemLanguages()[0] || "en").toLowerCase();
  strings = language.startsWith("fr") ? require("../i18n/fr.json") : {};
}

/** t("Sign out of %s?", name) */
function t(text, ...values) {
  let i = 0;
  return (strings[text] || text).replace(/%s/g, () => String(values[i++] ?? ""));
}

module.exports = { load, t, strings: () => strings };
