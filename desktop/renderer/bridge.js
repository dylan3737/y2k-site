// The desktop app's API (from preload.cjs), or a stand-in so the page also runs
// in a plain browser tab for development and tests.
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

  // In a tab the page gets real mouse events, so the cursor comes from them.
  window.addEventListener('mousemove', (e) => emit('cursor', { x: e.clientX, y: e.clientY }));
  // Tests drive the rest through this.
  window.__companion = { emit, stats, read, on: (channel, fn) => listen(channel)(fn) };

  return {
    desktop: false,
    async state() {
      const s = read();
      return {
        soul: s.soul ?? 100, best: s.best ?? 0, wander: s.wander ?? true, chatty: s.chatty ?? true,
        ravens: s.ravens || [], hourglass: s.hourglass || null, today: stats, hasKey: false,
        keys: { come: 'Ctrl+Alt+R', speak: 'Ctrl+Alt+Space' }, platform: 'browser'
      };
    },
    save: write,
    stat(key, n = 1) { if (key in stats) stats[key] += n; },
    interactive() {},
    focus() {},
    notify() {},
    capture: async () => null,
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
    toolResult(id, outcome) { emit('tool-result', { id, outcome }); },
    onCursor: listen('cursor'),
    onAway: listen('away'),
    onCommand: listen('command'),
    onSettings: listen('settings'),
    onSpeech: listen('speech'),
    onToolCall: listen('tool-call')
  };
}

export const companion = window.companion || browserStandIn();
