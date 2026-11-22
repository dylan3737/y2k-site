// electron-builder's afterPack hook: on a Mac that has the "Reaper Local
// Signing" certificate in its keychain, sign the app with it.
//
// Without a stable signature every build looks like a new app to macOS, and
// the permissions it was given (controlling Spotify, the screen) are lost on
// each update. A self-made certificate is enough for that: the app's identity
// becomes its bundle id and this certificate, the same from build to build.
// With no such certificate (CI, someone else's Mac) this does nothing.
// To make one, see "Keeping permissions across updates" in README.md.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const IDENTITY = 'Reaper Local Signing';

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  let found = '';
  try {
    found = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
  } catch {
    return;
  }
  if (!found.includes('"' + IDENTITY + '"')) {
    console.log('  • no "' + IDENTITY + '" certificate: the app is left unsigned');
    return;
  }
  const app = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', IDENTITY, app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  console.log('  • signed with "' + IDENTITY + '"');
};
