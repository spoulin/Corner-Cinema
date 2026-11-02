// Widevine (VMP) signing with castLabs EVS, which Netflix and other services require.
//
// - `npm run evs:sign-dev`: signs node_modules/electron/dist, for `npm start`.
// - electron-builder `afterPack` hook: signs the packaged app, before the Apple
//   code signature (on macOS, VMP signing has to come first), then signs the app
//   ad hoc for this Mac when no Apple Developer ID is configured.
//
// The EVS tool lives in .evs (`npm run evs:setup`); the account is the
// developer's own (`.evs/bin/python -m castlabs_evs.account signup`).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const python = path.join(root, ".evs", "bin", "python");

function vmpSign(directory) {
  if (!fs.existsSync(python)) {
    throw new Error("The castLabs EVS tool is missing: run `npm run evs:setup`, then sign in with "
      + "`.evs/bin/python -m castlabs_evs.account reauth` (or `signup` the first time).");
  }
  console.log(`VMP signing ${directory}`);
  execFileSync(python, ["-m", "castlabs_evs.vmp", "sign-pkg", directory], { stdio: "inherit" });
}

function adHocSign(app) {
  console.log(`Ad-hoc code signing ${app}`);
  execFileSync("/usr/bin/codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
}

// electron-builder afterPack hook.
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  vmpSign(context.appOutDir);
  const identity = context.packager.platformSpecificBuildOptions.identity;
  if (identity === null || identity === undefined) {
    adHocSign(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`));
  }
};

if (require.main === module && process.argv[2] === "dev") {
  const dist = path.join(root, "node_modules", "electron", "dist");
  vmpSign(dist);
  adHocSign(path.join(dist, "Electron.app"));
}
