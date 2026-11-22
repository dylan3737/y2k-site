// The reaper on the desktop: one transparent, always-on-top window over a
// display's work area. Clicks pass through it except where the reaper and his
// effects are; the page decides that from the cursor position sent from here.
import {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, powerMonitor, Notification,
  globalShortcut, nativeImage, desktopCapturer, shell, safeStorage, clipboard
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createOracle, SYSTEM, SMALL_MODEL_NOTE, TOOL_DEFS, FREE_TOOLS_EXCLUDE } from './oracle.js';
import { createFreeMind, serverPath } from './freemind.js';
import * as reach from './reach.js';
import { spotify } from './spotify.js';
import { listModels } from './ollama.js';
import * as crypt from './crypt.js';
import { doorsOf, SIDES, OPPOSITE } from './screens.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const asset = (name) => path.join(here, 'assets', name);

const COME_KEY = 'CommandOrControl+Alt+R';
const SPEAK_KEY = 'CommandOrControl+Alt+Space';
const AWAY_AFTER = 180; // seconds without input before he falls asleep

// Transparent windows on Linux need this before the app is ready.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-transparent-visuals');
// Vortex, Burn and Melt are WebGL shaders. Where the GPU is missing or
// blocklisted, let Chromium draw WebGL in software instead of refusing.
// ("Unsafe" is about untrusted web pages; this window only loads our own.)
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// --- Saved state ---------------------------------------------------------
const state = {
  soul: 100, best: 0, wander: true, chatty: true, muted: false,
  ravens: [], hourglass: null, stats: {}, apiKey: null, memories: [], greeted: null,
  // Whose mind Speak borrows: 'free' (built in, on this computer), 'claude' (an
  // API key), 'ollama' (the user's own Ollama) or 'offline' (plain commands only).
  brain: 'free', localModel: null,
  // The idle game: banked souls and the skeletons that dig for more.
  crypt: crypt.fresh(), minions: true,
  // Whether he walks (and can be flung) from one monitor to the next.
  roam: true
};

// What Speak remembers about the user, kept with the rest of the state.
const MAX_MEMORIES = 50;
const memory = {
  list: () => state.memories,
  add(text) {
    if (state.memories.length >= MAX_MEMORIES) return null;
    const note = { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), text };
    state.memories.push(note);
    writeState();
    rebuildMenu();
    return note;
  },
  remove(id) {
    const before = state.memories.length;
    state.memories = state.memories.filter((n) => n.id !== id);
    writeState();
    rebuildMenu();
    return state.memories.length !== before;
  }
};

const statePath = () => path.join(app.getPath('userData'), 'companion.json');

function readState() {
  try { Object.assign(state, JSON.parse(fs.readFileSync(statePath(), 'utf8'))); } catch {}
  // Before the free mind, Claude was the default whether or not there was a key.
  // Without one it was never really chosen: give those the free mind.
  if (state.brain === 'claude' && !hasKey()) state.brain = 'free';
}

// What the skeletons dug while the app was shut, told to the page once.
let dugWhileShut = 0;

function openCrypt() {
  state.crypt = crypt.clean(state.crypt);
  dugWhileShut = Math.floor(crypt.settle(state.crypt));
}

function takeDug() {
  const dug = dugWhileShut;
  dugWhileShut = 0;
  return dug;
}

// Count what the skeletons dug since the last look, and tell the page.
function tendCrypt(event = {}) {
  crypt.settle(state.crypt);
  // Digging alone can reach a milestone; one reached by a deed is passed in.
  const reached = [...(event.reached || []), ...crypt.reach(state.crypt)];
  writeState();
  send('crypt', { ...event, crypt: crypt.view(state.crypt), reached });
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

const BRAINS = ['free', 'claude', 'ollama', 'offline'];
const getBrain = () => ({ kind: BRAINS.includes(state.brain) ? state.brain : 'free', model: state.localModel || null });

// The free mind: its model is downloaded into the app's data folder on first use.
const freeMind = createFreeMind({
  // REAPER_MODELS_DIR lets the tests point it at a model they already have.
  dir: process.env.REAPER_MODELS_DIR || path.join(app.getPath('userData'), 'models'),
  system: SYSTEM + SMALL_MODEL_NOTE,
  tools: TOOL_DEFS.filter((t) => !FREE_TOOLS_EXCLUDE.includes(t.name)),
  // llama.cpp's llama-server, which runs the model in its own process.
  // REAPER_LLAMA_SERVER lets the tests use another one.
  server: process.env.REAPER_LLAMA_SERVER || serverPath({ packaged: app.isPackaged, resources: process.resourcesPath, here })
});
const hasKey = () => !!state.apiKey || !!process.env.ANTHROPIC_API_KEY;

// The models Ollama has, as last seen; the tray menu lists them.
let localModels = [];

// Change whose mind Speak borrows (and which local model), then report where
// things stand. Ollama is only asked when it is the one in use.
async function setBrain(patch = {}) {
  if (BRAINS.includes(patch.kind)) state.brain = patch.kind;
  if ('model' in patch) state.localModel = typeof patch.model === 'string' && patch.model ? patch.model.slice(0, 200) : null;
  writeState();
  const { kind, model } = getBrain();
  let local = null;
  if (kind === 'ollama') {
    try {
      localModels = await listModels();
      local = { running: true, models: localModels, using: model && localModels.includes(model) ? model : localModels[0] || null };
    } catch {
      local = { running: false, models: [], using: null };
    }
  }
  rebuildMenu();
  const status = { kind, model, hasKey: hasKey(), local, free: freeMind.status() };
  send('settings', { brain: kind, hasKey: status.hasKey });
  return status;
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
  send('doors', doors());
}

// --- Other monitors ---------------------------------------------------------------
// He lives in one window the size of one monitor. Where an edge of that monitor
// touches another, there is a door: he can walk or be flung through it, and the
// window moves to the other monitor with him. (One window across every monitor
// would not work on macOS, and breaks with mixed scaling on Windows.)
function doors() {
  if (!state.roam) return [];
  return doorsOf(currentDisplay(), screen.getAllDisplays());
}

// Through a door: the window moves to the other monitor, and the page is told
// where he comes in (the opposite side, at the same place on the desktop).
function cross({ id, side, along } = {}) {
  const from = currentDisplay();
  const to = screen.getAllDisplays().find((d) => d.id === id);
  if (!state.roam || !to || to.id === from.id || !SIDES.includes(side) || !Number.isFinite(along)) return null;
  if (!doors().some((door) => door.id === id && door.side === side)) return null;
  const upright = side === 'left' || side === 'right';
  const onDesktop = (upright ? from.workArea.y : from.workArea.x) + along;
  fitTo(to);
  const w = to.workArea;
  return {
    side: OPPOSITE[side],
    along: onDesktop - (upright ? w.y : w.x),
    width: w.width,
    height: w.height,
    doors: doors()
  };
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
  // Shown on first paint, or once the page has loaded if no paint is reported:
  // some Linux setups never send ready-to-show for a transparent window, and
  // he would stay hidden.
  const reveal = (why) => {
    if (!win || win.isDestroyed() || win.isVisible() || hidden) return;
    globalThis.reaperShownBy = why; // read by the launch test
    win.showInactive();
  };
  win.once('ready-to-show', () => reveal('ready-to-show'));
  win.webContents.once('did-finish-load', () => setTimeout(() => reveal('did-finish-load'), 300));
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
let awayTotal = 0;
function pollIdle() {
  const idle = powerMonitor.getSystemIdleTime();
  if (idle < 60) {
    const tally = today();
    tally.activeSec += 5;
    // Saved once a minute, not on every tick; quitting saves the rest.
    if (tally.activeSec % 60 === 0) writeState();
  }
  if (!away && idle >= AWAY_AFTER) goAway(Date.now() - idle * 1000);
  else if (away && idle < 5) {
    away = false;
    tendCrypt();
    send('away', {
      away: false, minutes: Math.round((Date.now() - awaySince) / 60000),
      dug: Math.floor(state.crypt.total - awayTotal)
    });
  }
}

function goAway(since) {
  if (away) return;
  away = true;
  awaySince = since;
  // What the crypt has ever held, so the return can say what was dug meanwhile.
  crypt.settle(state.crypt);
  awayTotal = state.crypt.total;
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
    {
      label: 'Mind',
      submenu: [
        { label: 'Free, on this computer', type: 'radio', checked: getBrain().kind === 'free', click: () => setBrain({ kind: 'free' }) },
        { label: 'Claude (your API key)', type: 'radio', checked: getBrain().kind === 'claude', click: () => setBrain({ kind: 'claude' }) },
        { label: 'Your own Ollama', type: 'radio', checked: getBrain().kind === 'ollama', click: () => setBrain({ kind: 'ollama' }) },
        { label: 'None (plain commands)', type: 'radio', checked: getBrain().kind === 'offline', click: () => setBrain({ kind: 'offline' }) },
        ...(getBrain().kind === 'ollama' && localModels.length ? [
          { type: 'separator' },
          { label: 'Pick the model for me', type: 'radio', checked: !localModels.includes(state.localModel), click: () => setBrain({ model: null }) },
          ...localModels.map((name) => ({
            label: name, type: 'radio', checked: state.localModel === name, click: () => setBrain({ model: name })
          }))
        ] : [])
      ]
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
    {
      label: 'Sounds', type: 'checkbox', checked: !state.muted,
      click: (item) => { state.muted = !item.checked; writeState(); send('settings', { muted: state.muted }); }
    },
    {
      label: 'Roam between screens', type: 'checkbox', checked: state.roam,
      enabled: screen.getAllDisplays().length > 1,
      click: (item) => { state.roam = item.checked; writeState(); send('settings', { roam: state.roam }); send('doors', doors()); }
    },
    {
      label: 'Skeletons on screen', type: 'checkbox', checked: state.minions,
      click: (item) => { state.minions = item.checked; writeState(); send('settings', { minions: state.minions }); }
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
    {
      label: state.memories.length ? `Forget what he remembers (${state.memories.length})` : 'He remembers nothing',
      enabled: state.memories.length > 0,
      click: () => { state.memories = []; writeState(); rebuildMenu(); }
    },
    {
      label: 'Forget API key', enabled: !!state.apiKey,
      // A key in the environment still works after the saved one is gone.
      click: () => { setKey(''); rebuildMenu(); send('settings', { hasKey: hasKey() }); }
    },
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

// Tools that wait for the user to allow them get longer to answer.
const ASKS_FIRST = ['look_at_screen', 'read_clipboard', 'open_url', 'open_app', 'find_files', 'open_file'];
// Tools that go out to the web get longer too.
const SLOW = ['web_search', 'read_webpage', 'spotify'];

function runTool(name, input, signal) {
  return new Promise((resolve) => {
    const id = String(++toolSeq);
    pendingTools.set(id, resolve);
    send('tool-call', { id, name, input });
    const timer = setTimeout(() => {
      if (pendingTools.delete(id)) resolve({ ok: false, error: 'No answer from the user or the reaper in time.' });
    }, ASKS_FIRST.includes(name) ? 90000 : SLOW.includes(name) ? 40000 : 10000);
    // Hush or ↺: stop waiting, and withdraw any question the page is asking.
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        if (!pendingTools.delete(id)) return;
        send('tool-cancel', { id });
        resolve({ ok: false, error: 'Stopped by the user.' });
      }, { once: true });
    }
  });
}

const oracle = createOracle({ getKey, runTool, memory, getBrain, freeMind });

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
    muted: state.muted,
    greeted: state.greeted,
    ravens: state.ravens,
    hourglass: state.hourglass,
    today: today(),
    hasKey: hasKey(),
    brain: getBrain().kind,
    minions: state.minions,
    roam: state.roam,
    free: freeMind.status(),
    doors: doors(),
    // `dug` is what the skeletons brought up while the app was shut; told once.
    crypt: { ...crypt.view(state.crypt), dug: takeDug() },
    keys: { come: COME_KEY, speak: SPEAK_KEY },
    platform: process.platform
  }));

  ipcMain.on('save', (_e, patch) => {
    if (!patch || typeof patch !== 'object') return;
    if (Number.isFinite(patch.soul)) state.soul = Math.max(0, Math.min(100, patch.soul));
    if (Number.isFinite(patch.best)) state.best = Math.max(state.best, patch.best);
    if (Array.isArray(patch.ravens)) state.ravens = patch.ravens.slice(0, 50);
    if ('hourglass' in patch) state.hourglass = patch.hourglass || null;
    if (typeof patch.greeted === 'string') state.greeted = patch.greeted.slice(0, 20);
    writeState();
  });

  // A deed for the tally, which also pays souls into the crypt. A finished
  // hourglass is worth its minutes, sent as `worth`.
  ipcMain.on('stat', (_e, { key, n, worth } = {}) => {
    if (!STAT_KEYS.includes(key) || !Number.isFinite(n)) return;
    today()[key] += n;
    const { gained, reached } = crypt.deed(state.crypt, key, Number.isFinite(worth) ? worth : n);
    if (gained) tendCrypt({ gained, reached });
    writeState();
  });

  ipcMain.handle('cross', (_e, through) => cross(through));

  ipcMain.handle('crypt', (_e, action = {}) => {
    const { reached, ...out } = crypt.act(state.crypt, action);
    // Ghosts caught in a hunt count toward today's tally too.
    if (out.caught) today().caught += out.caught;
    // The page hears too, so the skeletons on screen always match the crypt,
    // and that is where it learns of milestones.
    tendCrypt({ reached });
    return { ...out, crypt: crypt.view(state.crypt) };
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

  // Speak's clipboard tools. Reading happens only after the user allows it in the card.
  // Newer Electron returns promises here; awaiting covers both.
  ipcMain.handle('clipboard-read', async () => String((await clipboard.readText()) || '').slice(0, 20000));
  ipcMain.on('clipboard-write', async (_e, text) => {
    if (typeof text !== 'string') return;
    try { await clipboard.writeText(text.slice(0, 100000)); } catch {}
  });

  // Speak's reach. Reading the web needs no asking; opening things and looking
  // through files are asked in the page before these are called.
  ipcMain.handle('web-search', (_e, query) => reach.search(query));
  ipcMain.handle('web-read', (_e, url) => reach.read(url));
  ipcMain.handle('open-url', async (_e, url) => {
    const u = reach.publicUrl(url);
    if (!u) return { ok: false, error: 'Only public http or https addresses can be opened.' };
    await shell.openExternal(u.href);
    return { ok: true, result: { opened: u.href } };
  });
  ipcMain.handle('open-app', (_e, name) => reach.openApp(name));
  ipcMain.handle('spotify', (_e, input) => spotify(input && typeof input === 'object' ? input : {}));
  ipcMain.handle('find-files', (_e, query) => reach.findFiles(query));
  ipcMain.handle('open-file', async (_e, { file, reveal } = {}) => {
    const p = reach.realPath(file);
    if (!p) return { ok: false, error: 'No such file: ' + file };
    if (reveal) {
      shell.showItemInFolder(p);
      return { ok: true, result: { shown: p } };
    }
    const err = await shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true, result: { opened: p } };
  });

  // A picture of this display's work area, for Scythe Slash. On macOS this
  // needs Screen Recording permission; without it the picture is blank or
  // wallpaper only, and the page falls back to a plain slash.
  ipcMain.handle('capture', async (_e, opts = {}) => {
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
      // For Look, small enough for the model: at most 1568px on the long edge.
      let picture = cropped;
      if (opts && opts.forModel) {
        const { width, height } = cropped.getSize();
        const scale = Math.min(1, 1568 / Math.max(width, height));
        if (scale < 1) picture = cropped.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'good' });
      }
      return 'data:image/jpeg;base64,' + picture.toJPEG(82).toString('base64');
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
    // A key just pasted is the mind he should use.
    if (ok && String(key || '').trim()) {
      state.brain = 'claude';
      writeState();
    }
    rebuildMenu();
    return ok;
  });
  ipcMain.handle('brain', (_e, patch) => setBrain(patch && typeof patch === 'object' ? patch : {}));

  // The free mind's one-time download, with progress for the card.
  ipcMain.handle('free-fetch', async () => {
    let last = 0;
    try {
      const ok = await freeMind.fetchModel((p) => {
        // A few updates a second is plenty for a progress bar.
        if (Date.now() - last < 250) return;
        last = Date.now();
        send('free-progress', p);
      });
      send('free-progress', { finished: true, installed: ok });
      return { ok, free: freeMind.status() };
    } catch (err) {
      const error = String((err && err.message) || err).slice(0, 200);
      send('free-progress', { finished: true, installed: false, error });
      return { ok: false, error, free: freeMind.status() };
    }
  });
  ipcMain.on('free-cancel', () => freeMind.cancelDownload());
}

// --- Start -----------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => comeHere());
  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  app.whenReady().then(() => {
    readState();
    openCrypt();
    wireIpc();
    createWindow();

    tray = new Tray(trayImage());
    tray.setToolTip('Reaper');
    tray.on('click', () => comeHere());
    rebuildMenu();
    // With a local mind, the tray lists the models Ollama has.
    if (getBrain().kind === 'ollama') setBrain();

    globalShortcut.register(COME_KEY, () => comeHere());
    globalShortcut.register(SPEAK_KEY, () => comeHere('speak'));

    setInterval(pollCursor, 33);
    setInterval(pollIdle, 5000);
    setInterval(() => tendCrypt({ dug: true }), 60000);
    powerMonitor.on('lock-screen', () => goAway(Date.now()));

    // A monitor added, removed or rearranged: the doors change, and the menu's roam item.
    const refit = () => { fitTo(currentDisplay()); rebuildMenu(); };
    screen.on('display-metrics-changed', refit);
    screen.on('display-removed', refit);
    screen.on('display-added', refit);
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    freeMind.cancelDownload();
    freeMind.unload();
    clearTimeout(saveTimer);
    writeNow();
  });
  // Closing the window isn't quitting; only the tray's Quit is.
  app.on('window-all-closed', () => {});
}
