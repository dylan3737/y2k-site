// The desktop app's API (from preload.cjs), or a stand-in so the page also runs
// in a plain browser tab for development and tests.
import * as rules from '../crypt.js';

function browserStandIn() {
  const KEY = 'reaper-companion';
  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const write = (patch) => {
    try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch {}
  };
  const listeners = {};
  const listen = (channel) => (fn) => {
    (listeners[channel] = listeners[channel] || []).push(fn);
    return () => { listeners[channel] = listeners[channel].filter((f) => f !== fn); };
  };
  const emit = (channel, data) => (listeners[channel] || []).forEach((fn) => fn(data));
  const stats = { activeSec: 0, focus: 0, caught: 0, reaped: 0 };
  const freeStatus = () => window.__companion.free || { name: 'Qwen3 4B', bytes: 2497281120, installed: false, downloading: null, loaded: false };
  // The crypt, kept in localStorage here; the app keeps it in the main process.
  const crypt = read().crypt ? rules.clean(read().crypt) : rules.fresh();
  const saveCrypt = () => write({ crypt });

  // In a tab the page gets real mouse events, so the cursor comes from them.
  window.addEventListener('mousemove', (e) => emit('cursor', { x: e.clientX, y: e.clientY }));
  // Tests drive the rest through this.
  window.__companion = { emit, stats, read, on: (channel, fn) => listen(channel)(fn), clipboard: '', shot: null };

  return {
    desktop: false,
    async state() {
      const s = read();
      // Counted before it is shown, as the app does when it starts.
      const dug = Math.floor(rules.settle(crypt));
      saveCrypt();
      return {
        soul: s.soul ?? 100, best: s.best ?? 0, wander: s.wander ?? true, chatty: s.chatty ?? true,
        ravens: s.ravens || [], hourglass: s.hourglass || null, muted: !!s.muted, greeted: s.greeted || null, guided: !!s.guided, today: stats, hasKey: false, brain: s.brain || 'free',
        minions: s.minions !== false, roam: s.roam !== false, doors: window.__companion.doors || [], crypt: { ...rules.view(crypt), dug },
        keys: { come: 'Ctrl+Alt+R', speak: 'Ctrl+Alt+Space' }, platform: 'browser'
      };
    },
    save: write,
    stat(key, n = 1, worth) {
      if (!(key in stats)) return;
      stats[key] += n;
      const { gained, reached } = rules.deed(crypt, key, Number.isFinite(worth) ? worth : n);
      saveCrypt();
      if (gained) emit('crypt', { crypt: rules.view(crypt), gained, reached });
    },
    // Tests stand in for other monitors with window.__companion.crossTo.
    async cross(through) {
      window.__companion.crossed = (window.__companion.crossed || []).concat([through]);
      return window.__companion.crossTo ? window.__companion.crossTo(through) : null;
    },
    async crypt(action = {}) {
      const { reached, ...out } = rules.act(crypt, action);
      if (out.caught) stats.caught += out.caught;
      saveCrypt();
      emit('crypt', { crypt: rules.view(crypt), reached });
      return { ...out, crypt: rules.view(crypt) };
    },
    interactive() {},
    focus() {},
    notify() {},
    capture: async () => window.__companion.shot || null,
    clipboardRead: async () => window.__companion.clipboard,
    clipboardWrite(text) { window.__companion.clipboard = text; },
    // The web and the computer are the app's; the page records what it was asked to do.
    async webSearch(query) { return (window.__companion.reach || {}).search || { ok: true, result: { query, results: [{ title: 'A page', url: 'https://example.com/', snippet: 'Words.' }] } }; },
    async webRead(url) { return { ok: true, result: { url, title: 'A page', text: 'Words on ' + url } }; },
    async openUrl(url) { (window.__companion.opened ||= []).push(url); return { ok: true, result: { opened: url } }; },
    async openApp(name) { (window.__companion.opened ||= []).push('app:' + name); return { ok: true, result: { opened: name } }; },
    async findFiles(query) { return { ok: true, result: { query, files: [{ path: '~/Documents/' + query + '.txt', kind: 'file', modified: '2026-01-01' }] } }; },
    async github(mode, input) {
      const g = window.__companion.github ||= { done: [] };
      if (mode === 'describe') return input.action && (input.title || input.number || input.branch) ? 'Do ' + input.action + (input.number ? ' #' + input.number : '') + '?' : null;
      if (mode === 'act') { g.done.push(input); return { ok: true, result: { done: input.action } }; }
      return { ok: true, result: { pullRequests: [{ number: 7, title: 'A bone hound', branch: 'reaper/bone-hound' }] } };
    },
    async selfWork(input) { (window.__companion.selfWork ||= []).push(input); return { ok: true, result: { opened: 'Terminal', engine: input.engine === 'claude' ? 'Claude Code' : 'OpenCode on Qwen3-Coder 30B', branch: 'reaper/test' } }; },
    async spotify(input) { (window.__companion.spotify ||= []).push(input); return { ok: true, result: input.action === 'pause' ? { paused: true } : { playing: input.query ? input.query + ' by Someone' : 'A song by Someone' } }; },
    async openFile(file, reveal) { (window.__companion.opened ||= []).push((reveal ? 'show:' : 'file:') + file); return { ok: true, result: { opened: file } }; },
    trash: async (paths) => ({ ok: 0, failed: paths.length }),
    pathForFile: () => '',
    setAbilities() {},
    menu() {},
    speak() {
      // As the app answers with nothing to think with: the free mind, or a key, is missing.
      const free = (read().brain || 'free') === 'free';
      setTimeout(() => emit('speech', free
        ? { type: 'error', code: 'free', message: 'Speak thinks in the desktop app.' }
        : { type: 'error', code: 'key', message: 'Speak works in the desktop app.' }), 50);
    },
    speakStop() {},
    speakForget() {},
    setKey: async () => false,
    // Tests set window.__companion.local to stand for Ollama.
    async brain(patch = {}) {
      if (patch.kind) write({ brain: patch.kind });
      const kind = read().brain || 'free';
      const local = kind === 'ollama' ? window.__companion.local || { running: false, models: [], using: null } : null;
      emit('settings', { brain: kind, hasKey: false });
      return { kind, model: null, hasKey: false, local, free: freeStatus() };
    },
    // The free mind's download, pretended: tests set window.__companion.free.
    async freeFetch() {
      const total = 2497281120;
      for (const done of [0.25, 0.6, 1]) {
        await new Promise((r) => setTimeout(r, 40));
        emit('free-progress', { done: done * total, total });
      }
      window.__companion.free = { ...freeStatus(), installed: true };
      emit('free-progress', { finished: true, installed: true });
      return { ok: true, free: freeStatus() };
    },
    freeCancel() {},
    toolResult(id, outcome) { emit('tool-result', { id, outcome }); },
    onCursor: listen('cursor'),
    onAway: listen('away'),
    onCommand: listen('command'),
    onSettings: listen('settings'),
    onCrypt: listen('crypt'),
    onDoors: listen('doors'),
    onFreeProgress: listen('free-progress'),
    onSpeech: listen('speech'),
    onToolCall: listen('tool-call'),
    onToolCancel: listen('tool-cancel')
  };
}

export const companion = window.companion || browserStandIn();
