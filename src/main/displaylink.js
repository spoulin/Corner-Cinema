// DisplayLink copies the Mac's image to its screens. While it runs, video
// decoded by the graphics chip stays black on every screen (only the sound
// plays), and protected videos are blocked: Chromium then has to decode and
// draw the video itself (hardware acceleration off).
const { execFileSync } = require("child_process");

function isDisplayLinkRunning() {
  try {
    execFileSync("/usr/bin/pgrep", ["-x", "DisplayLinkUserAgent"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

module.exports = { isDisplayLinkRunning };
