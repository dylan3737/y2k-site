// Fetches llama.cpp's llama-server, which runs the free mind's model, into
// vendor/llama/<platform>-<arch>/. The installers carry it from there (see
// "extraResources" in package.json), and running from source uses it too.
//
//   node tools/fetch-llama-server.mjs              this computer's platform
//   node tools/fetch-llama-server.mjs --mac        both Mac builds (arm64, x64)
//   node tools/fetch-llama-server.mjs win32-x64 …  any of the builds below
//
// The release is pinned. To move to a newer one, change LLAMA_TAG, rerun this,
// and run tests/freemind.mjs with the real model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const LLAMA_TAG = 'b12613';

// One build per platform: Metal on Apple silicon, the processor on Intel Macs,
// and Vulkan on Windows and Linux, which falls back to the processor where
// there is no graphics card that can run it.
const BUILDS = {
  'darwin-arm64': 'macos-arm64.tar.gz',
  'darwin-x64': 'macos-x64.tar.gz',
  'win32-x64': 'win-vulkan-x64.zip',
  'linux-x64': 'ubuntu-vulkan-x64.tar.gz'
};

// What is kept: the server and the libraries it loads. The rest of the
// release (other tools, the web UI's sources) is left out of the installers.
const KEEP = /^(llama-server(\.exe)?|.*\.(so(\.\d+)*|dylib|dll|metal|metallib)|LICENSE.*)$/i;

const here = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(here, '..', 'vendor', 'llama');

function find(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === name) return dir;
    if (entry.isDirectory()) {
      const found = find(full, name);
      if (found) return found;
    }
  }
  return null;
}

async function fetchBuild(target) {
  const asset = BUILDS[target];
  if (!asset) throw new Error('No build for ' + target + '. There are: ' + Object.keys(BUILDS).join(', '));
  const dest = path.join(vendor, target);
  const stamp = path.join(dest, 'VERSION');
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === LLAMA_TAG + ' ' + asset) {
    console.log(target + ': already ' + LLAMA_TAG);
    return;
  }
  const url = 'https://github.com/ggml-org/llama.cpp/releases/download/' + LLAMA_TAG + '/llama-' + LLAMA_TAG + '-bin-' + asset;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'llama-'));
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ' answered ' + res.status);
    const archive = path.join(work, asset);
    fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
    const unpacked = path.join(work, 'unpacked');
    fs.mkdirSync(unpacked);
    // tar reads both .tar.gz and .zip (bsdtar on macOS and Windows).
    execFileSync('tar', ['-xf', archive, '-C', unpacked]);
    const exe = target.startsWith('win32') ? 'llama-server.exe' : 'llama-server';
    const from = find(unpacked, exe);
    if (!from) throw new Error(asset + ' has no ' + exe);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    // A Linux library comes as a chain of names (libllama.so -> libllama.so.1
    // -> libllama.so.1.0.0); llama-server asks for the middle one, so that is
    // the one kept. Elsewhere every name is kept, as the release has them.
    const names = fs.readdirSync(from).filter((name) => KEEP.test(name) && !/bench/.test(name));
    const byFile = new Map();
    for (const name of names) {
      const real = fs.realpathSync(path.join(from, name));
      if (!fs.statSync(real).isFile()) continue;
      byFile.set(real, (byFile.get(real) || []).concat(name));
    }
    let kept = 0;
    for (const [real, all] of byFile) {
      const chosen = target.startsWith('linux') && all.length > 1 ? [all.find((n) => /\.so\.\d+$/.test(n)) || all[0]] : all;
      for (const name of chosen) {
        // Copied, not linked: an installer can't be trusted to keep symlinks.
        fs.copyFileSync(real, path.join(dest, name));
        kept += fs.statSync(real).size;
      }
    }
    if (!target.startsWith('win32')) fs.chmodSync(path.join(dest, exe), 0o755);
    fs.writeFileSync(stamp, LLAMA_TAG + ' ' + asset + '\n');
    console.log(target + ': ' + LLAMA_TAG + ', ' + Math.round(kept / 1048576) + ' MB in ' + path.relative(process.cwd(), dest));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const args = process.argv.slice(2);
const targets = args.includes('--mac') ? ['darwin-arm64', 'darwin-x64']
  : args.length ? args : [process.platform + '-' + process.arch];
for (const target of targets) await fetchBuild(target);
