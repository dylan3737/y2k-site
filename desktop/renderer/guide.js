// The first-run guide: the reaper shows a newcomer around, a step at a time.
//
// Each step says what to do and waits until it is done (dragging him, opening
// his ring, the Garden, raising a first moss sprite, taking the dragon egg),
// or offers Next where there is nothing to do. Skip ends it. Once finished or
// skipped it is saved as seen, and comes back only when asked for ("guide"
// in Speak).
import { el, chip } from './dom.js';

export function createGuide(ctx, { ringOpen, speakKey = 'Ctrl+Alt+Space' }) {
  const STEPS = [
    { text: 'Hello. I am your reaper, and I live on your desktop.\nDrag me somewhere, and let go.', until: 'drag' },
    { text: 'Click me to open my ring of abilities.', until: () => ringOpen() },
    { text: 'Now click Garden, on the ring.', until: () => ctx.crypt.isOpen() || ctx.crypt.get().skeletons > 0 },
    { text: 'You have just enough souls for a moss sprite.\nRaise one.', until: () => ctx.crypt.get().skeletons > 0 },
    { text: 'Its sprout grows a ghost every hour, six at most. In full bloom, drag me onto it to reap it, then click the ghosts before they get away. Each one is worth souls, and souls raise more of the garden.', next: 'Next' },
    { text: 'A dragon egg is waiting for you.\nOpen Dragon on my ring, and take it.', until: () => !!ctx.dragon.get() },
    { text: 'Keep it warm: click it, and finish hourglasses. Raise it well.\n\nLast thing: Speak, on my ring (or ' + speakKey + '), is how you talk to me. Ask me anything, or say "guide" to see this again.', next: 'Done' }
  ];

  let step = -1;
  let panel = null;
  let poll = null;
  const seen = new Set();

  function show() {
    const s = STEPS[step];
    panel.replaceChildren(
      el('p', 'guide-step', (step + 1) + ' of ' + STEPS.length),
      el('p', 'guide-text', s.text)
    );
    const row = el('div', 'row');
    if (s.next) row.append(chip(s.next, () => advance(), 'solid'));
    if (step < STEPS.length - 1) row.append(chip('Skip the guide', () => finish()));
    panel.appendChild(row);
    ctx.sound.chime();
  }

  function advance() {
    step += 1;
    if (step >= STEPS.length) return finish();
    seen.delete('drag');
    show();
  }

  function check() {
    const s = STEPS[step];
    if (!s || s.next) return;
    if (s.until === 'drag' ? seen.has('drag') : s.until()) advance();
  }

  function start() {
    if (panel) return { ok: true, result: 'already showing' };
    panel = el('div', 'guide hit');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Getting started');
    document.body.appendChild(panel);
    step = -1;
    seen.clear();
    advance();
    poll = setInterval(check, 300);
    return { ok: true, result: 'showing the guide' };
  }

  function finish() {
    clearInterval(poll);
    poll = null;
    if (panel) panel.remove();
    panel = null;
    step = -1;
    ctx.companion.save({ guided: true });
  }

  return {
    start,
    finish,
    // Something the guide waits for happened: 'drag' (he was dragged and let go).
    saw(what) {
      seen.add(what);
      if (panel) check();
    },
    get step() { return panel ? step : null; },
    get showing() { return !!panel; }
  };
}
