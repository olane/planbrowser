// Ad-hoc code-sign the packaged macOS app so Gatekeeper shows the milder
// "unidentified developer" prompt (with a right-click > Open bypass) instead
// of "damaged". Runs via electron-builder's afterPack hook, after the .app is
// assembled but before the dmg/zip are created.
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const { appOutDir } = context;
  const appBundle = fs.readdirSync(appOutDir).find((f) => f.endsWith('.app'));
  if (!appBundle) {
    console.warn('afterPack: no .app found to ad-hoc sign');
    return;
  }

  const appPath = path.join(appOutDir, appBundle);
  console.log(`afterPack: ad-hoc signing ${appPath}`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });
};
