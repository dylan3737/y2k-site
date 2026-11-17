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
  // The crypt, kept in localStorage here; the app keeps it in the main process.
  const crypt = rules.clean(read().crypt);
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
        ravens: s.ravens || [], hourglass: s.hourglass || null, muted: !!s.muted, greeted: s.greeted || null, today: stats, hasKey: false, brain: s.brain || 'claude',
        minions: s.minions !== false, crypt: { ...rules.view(crypt), dug },
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
    async crypt(action = {}) {
      const { reached, ...out } = rules.act(crypt, action);
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
    trash: async (paths) => ({ ok: 0, failed: paths.length }),
    pathForFile: () => '',
    setAbilities() {},
    menu() {},
    speak() {
      setTimeout(() => emit('speech', { type: 'error', code: 'key', message: 'Speak works in the desktop app.' }), 50);
    },
    speakStop() {},
    speakForget() {},
    setKey: async () => false,
    // Tests set window.__companion.local to stand for Ollama.
    async brain(patch = {}) {
      if (patch.kind) write({ brain: patch.kind });
      const kind = read().brain || 'claude';
      const local = kind === 'ollama' ? window.__companion.local || { running: false, models: [], using: null } : null;
      emit('settings', { brain: kind, hasKey: false });
      return { kind, model: null, hasKey: false, local };
    },
    toolResult(id, outcome) { emit('tool-result', { id, outcome }); },
    onCursor: listen('cursor'),
    onAway: listen('away'),
    onCommand: listen('command'),
    onSettings: listen('settings'),
    onCrypt: listen('crypt'),
    onSpeech: listen('speech'),
    onToolCall: listen('tool-call'),
    onToolCancel: listen('tool-cancel')
  };
}

export const companion = window.companion || browserStandIn();
