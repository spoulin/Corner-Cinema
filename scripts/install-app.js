// Installs the built app in /Applications, where Spotlight, Raycast and the
// Launchpad find it (`npm run install-app` builds it first). A running copy is
// quit first. The user's services, settings and sign-ins aren't in the app:
// they stay in ~/Library/Application Support/Corner Cinema.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "dist", "mac-arm64", "Corner Cinema.app");
const target = "/Applications/Corner Cinema.app";

const isRunning = () => {
  try {
    execFileSync("/usr/bin/pgrep", ["-f", "Corner Cinema.app/Contents/MacOS/Corner Cinema"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

(async () => {
  if (!fs.existsSync(source)) {
    console.error("The app isn't built: run `npm run app` first.");
    process.exit(1);
  }
  if (isRunning()) {
    console.log("Quitting Corner Cinema…");
    execFileSync("/usr/bin/osascript", ["-e", 'tell application "Corner Cinema" to quit']);
    for (let i = 0; i < 20 && isRunning(); i++) await new Promise(resolve => setTimeout(resolve, 500));
  }
  try {
    fs.rmSync(target, { recursive: true, force: true });
    execFileSync("/usr/bin/ditto", [source, target]);
  } catch (error) {
    console.error(`Couldn't write ${target}: ${error.message}`);
    process.exit(1);
  }
  console.log(`✓ ${target}`);
})();
