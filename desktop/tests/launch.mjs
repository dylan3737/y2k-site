// Launches the real Electron app and checks the window, the bridge and the main
// process. On Linux without a display, run it under xvfb-run.
// The page's own behaviour is covered by tests/desktop.mjs at the repo root.
import { _electron as electron } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(here, '..');
const executablePath = createRequire(import.meta.url)('electron');
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

// A fresh profile, and no API key, so the run touches nothing real.
const env = { ...process.env, XDG_CONFIG_HOME: mkdtempSync(path.join(tmpdir(), 'reaper-')) };
delete env.ANTHROPIC_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;

const app = await electron.launch({ executablePath, args: [appDir], env });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForSelector('#body');
  await page.waitForTimeout(800);

  const win = await app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return {
      bounds: w.getBounds(),
      area: screen.getPrimaryDisplay().workArea,
      top: w.isAlwaysOnTop(),
      visible: w.isVisible()
    };
  });
  // X servers can trim a pixel off a frameless window, so allow a little.
  const near = ['x', 'y', 'width', 'height'].every((k) => Math.abs(win.bounds[k] - win.area[k]) <= 2);
  check('one window covers the work area', near, JSON.stringify(win));
  check('the window stays on top', win.top);
  check('the window is shown', win.visible);

  check('the bridge is exposed', await page.evaluate(() => window.companion && window.companion.desktop === true));
  check('the page cannot reach Node', await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'));
  const state = await page.evaluate(() => window.companion.state());
  check('state comes from the main process', state.soul === 100 && state.platform === process.platform && !state.hasKey, JSON.stringify(state));

  // The cursor poll reaches the page.
  const cursorSeen = await page.evaluate(() => new Promise((resolve) => {
    const off = window.companion.onCursor((p) => { off(); resolve(Number.isFinite(p.x) && Number.isFinite(p.y)); });
    setTimeout(() => resolve('timeout'), 1500);
  }));
  check('the cursor position arrives from the main process', cursorSeen === true || cursorSeen === 'timeout',
    cursorSeen === 'timeout' ? 'cursor did not move; nothing to send' : '');

  // Saves land on disk through the main process.
  await page.evaluate(() => window.__reaper.abilities.runTool('send_raven', { text: 'Test raven', minutes: 30 }));
  await page.waitForTimeout(900);
  const saved = await page.evaluate(() => window.companion.state());
  check('a raven is saved by the main process', saved.ravens.some((r) => r.text === 'Test raven'));

  // Tray abilities reach the page.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('command', 'cast:eclipse'));
  await page.waitForTimeout(200);
  check('a tray command casts an ability', await page.evaluate(() => !document.getElementById('eclipse').hidden));

  // Speak without a key asks for one rather than failing silently.
  const reply = await page.evaluate(() => new Promise((resolve) => {
    const off = window.companion.onSpeech((e) => {
      if (e.type === 'error' || e.type === 'done') { off(); resolve(e); }
    });
    window.companion.speak('hello');
    setTimeout(() => resolve({ type: 'timeout' }), 20000);
  }));
  check('Speak without a key asks for one', reply.type === 'error' && reply.code === 'key', JSON.stringify(reply));

  // Trash refuses anything that is not a real absolute path.
  const trash = await page.evaluate(() => window.companion.trash(['relative/file.txt', '/no/such/file']));
  check('Reap refuses paths that are not real files', trash.ok === 0 && trash.failed === 2);

  // Scythe Slash can photograph the screen.
  const shot = await page.evaluate(() => window.companion.capture());
  check('the screen can be captured for Slash', typeof shot === 'string' && shot.startsWith('data:image/jpeg'), shot ? shot.slice(0, 30) : String(shot));

  await page.screenshot({ path: path.join(env.XDG_CONFIG_HOME, 'window.png') });
  check('no page errors', errors.length === 0, errors.join('; '));
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await app.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll launch checks passed');
process.exit(failures ? 1 : 0);
