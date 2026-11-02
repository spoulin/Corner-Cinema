// Addresses typed by the user. Shared by the main process and the window.
(function (root) {
  /** "netflix.com", "www.tubitv.com/home" or a full address → an https address, or null. */
  function normalize(text) {
    let value = String(text || "").trim();
    if (!value || /\s/.test(value)) return null;
    if (!value.includes("://")) value = "https://" + value;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) return null;
      if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
      return url.href;
    } catch {
      return null;
    }
  }

  /** The site, without "www.": netflix.com, tubitv.com… */
  function domain(address) {
    try {
      return new URL(address).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return "";
    }
  }

  /** "https://www.netflix.com" → "Netflix". */
  function suggestedName(address) {
    const parts = domain(address).split(".");
    const name = parts.find(part => !["www", "m", "app", "watch", "play"].includes(part)) || parts[0] || "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /** Whether a page belongs to a service's site (any subdomain). */
  function belongsTo(page, serviceAddress) {
    const site = domain(serviceAddress);
    let host;
    try {
      host = new URL(page).hostname.toLowerCase();
    } catch {
      return false;
    }
    return !!site && (host === site || host.endsWith("." + site));
  }

  const api = { normalize, domain, suggestedName, belongsTo };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CCUrls = api;
})(this);
