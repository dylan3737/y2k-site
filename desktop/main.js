// The reaper on the desktop: one transparent, always-on-top window over a
// display's work area. Clicks pass through it except where the reaper and his
// effects are; the page decides that from the cursor position sent from here.
import {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, Notification,
  globalShortcut, nativeImage, desktopCapturer, shell, safeStorage
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOracle } from './oracle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (name) => path.join(here, 'assets', name);

const COME_KEY = 'CommandOrControl+Alt+R';
const SPEAK_KEY = 'CommandOrControl+Alt+Space';
const AWAY_AFTER = 180; // seconds without input before he falls asleep

// Transparent windows on Linux need this before the app is ready.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');

// --- Saved state ---------------------------------------------------------
const state = {
  soul: 100, best: 0, wander: true, chatty: true,
  ravens: [], hourglass: null, stats: {}, apiKey: null
};

const statePath = () => path.join(app.getPath('userData'), 'companion.json');

function readState() {
  try { Object.assign(state, JSON.parse(fs.readFileSync(statePath(), 'utf8'))); } catch {}
}

function writeNow() {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state));
  } catch {}
}

let saveTimer = null;
function writeState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeNow, 500);
}

function dayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// Only today's tally is kept.
function today() {
  const key = dayKey();
  if (!state.stats[key]) state.stats = { [key]: { activeSec: 0, focus: 0, caught: 0, reaped: 0 } };
  return state.stats[key];
}

// The API key is kept encrypted with the OS keychain where there is one.
function getKey() {
  if (!state.apiKey) return null;
  try {
    return safeStorage.decryptString(Buffer.from(state.apiKey, 'base64'));
  } catch {
    return null;
  }
}

function setKey(key) {
  const clean = String(key || '').trim();
  if (!clean) {
    state.apiKey = null;
  } else {
    if (!safeStorage.isEncryptionAvailable()) return false;
    state.apiKey = safeStorage.encryptString(clean).toString('base64');
  }
  writeState();
  return true;
}

// --- Window ----------------------------------------------------------------
let win = null;
let tray = null;
let displayId = null;
let hidden = false;
let abilities = [];

function currentDisplay() {
  return screen.getAllDisplays().find((d) => d.id === displayId) || screen.getPrimaryDisplay();
}

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function fitTo(display) {
  displayId = display.id;
  if (win && !win.isDestroyed()) win.setBounds(display.workArea);
}

function setInteractive(on) {
  if (!win || win.isDestroyed()) return;
  if (on) win.setIgnoreMouseEvents(false);
  else win.setIgnoreMouseEvents(true, { forward: true });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  displayId = display.id;
  win = new BrowserWindow({
    ...display.workArea,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: 'Reaper',
    backgroundColor: '#00000000',
    icon: asset('icon.png'),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  setInteractive(false);
  win.loadFile(path.join(here, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  // Links in his cards open in the browser, never in this window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// The cursor, in window coordinates, about 30 times a second. Forwarded mouse
// events don't work on every platform, so the page hit-tests from this.
let lastCursor = '';
function pollCursor() {
  if (!win || win.isDestroyed() || hidden) return;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const key = p.x + ',' + p.y + ',' + b.x + ',' + b.y;
  if (key === lastCursor) return;
  lastCursor = key;
  send('cursor', { x: p.x - b.x, y: p.y - b.y });
}

// Asleep while the computer is idle or locked; awake when input returns.
let away = false;
let awaySince = 0;
function pollIdle() {
  const idle = powerMonitor.getSystemIdleTime();
  if (idle < 60) {
    today().activeSec += 5;
    writeState();
  }
  if (!away && idle >= AWAY_AFTER) goAway(Date.now() - idle * 1000);
  else if (away && idle < 5) {
    away = false;
    send('away', { away: false, minutes: Math.round((Date.now() - awaySince) / 60000) });
  }
}

function goAway(since) {
  if (away) return;
  away = true;
  awaySince = since;
  send('away', { away: true });
}

// Bring him (and his window) to the display the cursor is on.
function comeHere(then) {
  const p = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(p);
  if (hidden) toggleHidden(false);
  if (display.id !== displayId) fitTo(display);
  // Give the page a moment to see its new size before it teleports him.
  setTimeout(() => send('command', then || 'come'), 120);
}

function toggleHidden(force) {
  hidden = typeof force === 'boolean' ? force : !hidden;
  if (!win || win.isDestroyed()) return;
  if (hidden) win.hide();
  else win.showInactive();
  rebuildMenu();
}

// --- Tray --------------------------------------------------------------------
function trayImage() {
  const img = nativeImage.createFromPath(asset('tray.png'));
  const big = nativeImage.createFromPath(asset('tray@2x.png'));
  if (!big.isEmpty()) img.addRepresentation({ scaleFactor: 2, buffer: big.toPNG() });
  if (process.platform === 'darwin') return img.resize({ width: 18, height: 18 });
  return img;
}

function rebuildMenu() {
  const items = [
    { label: 'Come here', accelerator: COME_KEY, click: () => comeHere() },
    { label: 'Speak…', accelerator: SPEAK_KEY, click: () => comeHere('speak') },
    {
      label: 'Abilities',
      submenu: abilities.map((a) => ({ label: a.name, click: () => send('command', 'cast:' + a.id) }))
    },
    { type: 'separator' },
    {
      label: 'Wander', type: 'checkbox', checked: state.wander,
      click: (item) => { state.wander = item.checked; writeState(); send('settings', { wander: state.wander }); }
    },
    {
      label: 'Talk on his own', type: 'checkbox', checked: state.chatty,
      click: (item) => { state.chatty = item.checked; writeState(); send('settings', { chatty: state.chatty }); }
    },
    { label: 'Hide', type: 'checkbox', checked: hidden, click: () => toggleHidden() }
  ];
  // Linux has no login-item API in Electron.
  if (process.platform !== 'linux') {
    items.push({
      label: 'Open at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    });
  }
  items.push(
    { label: 'Forget API key', enabled: !!state.apiKey, click: () => { setKey(''); rebuildMenu(); send('settings', { hasKey: false }); } },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  );
  const menu = Menu.buildFromTemplate(items);
  if (tray) tray.setContextMenu(menu);
  return menu;
}

// --- Page requests -------------------------------------------------------------
const STAT_KEYS = ['focus', 'caught', 'reaped'];

// Tool calls from Speak run in the page, which owns the abilities.
const pendingTools = new Map();
let toolSeq = 0;

function runTool(name, input) {
  return new Promise((resolve) => {
    const id = String(++toolSeq);
    pendingTools.set(id, resolve);
    send('tool-call', { id, name, input });
    setTimeout(() => {
      if (pendingTools.delete(id)) resolve({ ok: false, error: 'The reaper did not answer.' });
    }, 10000);
  });
}

const oracle = createOracle({ getKey, runTool });

function wireIpc() {
  ipcMain.on('interactive', (_e, on) => setInteractive(!!on));
  ipcMain.on('focus', (_e, on) => {
    if (!win || win.isDestroyed()) return;
    if (on) win.focus();
    else win.blur();
  });

  ipcMain.handle('state', () => ({
    soul: state.soul,
    best: state.best,
    wander: state.wander,
    chatty: state.chatty,
    ravens: state.ravens,
    hourglass: state.hourglass,
    today: today(),
    hasKey: !!state.apiKey || !!process.env.ANTHROPIC_API_KEY,
    keys: { come: COME_KEY, speak: SPEAK_KEY },
    platform: process.platform
  }));

  ipcMain.on('save', (_e, patch) => {
    if (!patch || typeof patch !== 'object') return;
    if (Number.isFinite(patch.soul)) state.soul = Math.max(0, Math.min(100, patch.soul));
    if (Number.isFinite(patch.best)) state.best = Math.max(state.best, patch.best);
    if (Array.isArray(patch.ravens)) state.ravens = patch.ravens.slice(0, 50);
    if ('hourglass' in patch) state.hourglass = patch.hourglass || null;
    writeState();
  });

  ipcMain.on('stat', (_e, { key, n } = {}) => {
    if (!STAT_KEYS.includes(key) || !Number.isFinite(n)) return;
    today()[key] += n;
    writeState();
  });

  ipcMain.on('notify', (_e, { title, body } = {}) => {
    if (!Notification.isSupported()) return;
    new Notification({ title: String(title || 'Reaper'), body: String(body || ''), icon: asset('icon.png'), silent: true }).show();
  });

  ipcMain.on('abilities', (_e, list) => {
    if (!Array.isArray(list)) return;
    abilities = list.filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string');
    rebuildMenu();
  });

  ipcMain.on('menu', () => rebuildMenu().popup({ window: win }));

  // A picture of this display's work area, for Scythe Slash. On macOS this
  // needs Screen Recording permission; without it the picture is blank or
  // wallpaper only, and the page falls back to a plain slash.
  ipcMain.handle('capture', async () => {
    try {
      const display = currentDisplay();
      const scale = display.scaleFactor || 1;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) }
      });
      const source = sources.find((s) => s.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
      if (!source || source.thumbnail.isEmpty()) return null;
      const shot = source.thumbnail;
      const size = shot.getSize();
      const sx = size.width / display.bounds.width;
      const sy = size.height / display.bounds.height;
      const area = display.workArea;
      const cropped = shot.crop({
        x: Math.round((area.x - display.bounds.x) * sx),
        y: Math.round((area.y - display.bounds.y) * sy),
        width: Math.round(area.width * sx),
        height: Math.round(area.height * sy)
      });
      return 'data:image/jpeg;base64,' + cropped.toJPEG(82).toString('base64');
    } catch {
      return null;
    }
  });

  // Reap: files dropped on him go to the Trash (recoverable), never deleted.
  ipcMain.handle('trash', async (_e, paths) => {
    if (!Array.isArray(paths)) return { ok: 0, failed: 0 };
    let ok = 0;
    let failed = 0;
    for (const p of paths.slice(0, 200)) {
      if (typeof p !== 'string' || !path.isAbsolute(p) || !fs.existsSync(p)) { failed++; continue; }
      try {
        await shell.trashItem(p);
        ok++;
      } catch {
        failed++;
      }
    }
    if (ok) {
      today().reaped += ok;
      writeState();
    }
    return { ok, failed };
  });

  ipcMain.on('tool-result', (_e, { id, outcome } = {}) => {
    const done = pendingTools.get(id);
    if (!done) return;
    pendingTools.delete(id);
    done(outcome && typeof outcome === 'object' ? outcome : { ok: false, error: 'No result.' });
  });

  ipcMain.on('speak', (_e, text) => {
    const clean = String(text || '').trim().slice(0, 4000);
    if (!clean) return;
    oracle.ask(clean, (event) => send('speech', event));
  });
  ipcMain.on('speak-stop', () => oracle.stop());
  ipcMain.on('speak-forget', () => oracle.forget());
  ipcMain.handle('set-key', (_e, key) => {
    const ok = setKey(key);
    rebuildMenu();
    return ok;
  });
}

// --- Start -----------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => comeHere());
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  app.whenReady().then(() => {
    readState();
    wireIpc();
    createWindow();

    tray = new Tray(trayImage());
    tray.setToolTip('Reaper');
    tray.on('click', () => comeHere());
    rebuildMenu();

    globalShortcut.register(COME_KEY, () => comeHere());
    globalShortcut.register(SPEAK_KEY, () => comeHere('speak'));

    setInterval(pollCursor, 33);
    setInterval(pollIdle, 5000);
    powerMonitor.on('lock-screen', () => goAway(Date.now()));

    const refit = () => fitTo(currentDisplay());
    screen.on('display-metrics-changed', refit);
    screen.on('display-removed', refit);
    screen.on('display-added', refit);
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    clearTimeout(saveTimer);
    writeNow();
  });
  // Closing the window isn't quitting; only the tray's Quit is.
  app.on('window-all-closed', () => {});
}
