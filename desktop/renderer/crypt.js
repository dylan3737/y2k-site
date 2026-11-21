// The Crypt on the page: its card, the souls counter, and the skeletons that
// dig along the bottom of the screen (their dig is a sprite sheet in
// style.css). The rules and the saved numbers live in the main process
// (../crypt.js); this draws what it is told.
import { el, chip } from './dom.js';

// How many skeletons are drawn; the rest dig out of sight.
const SHOWN = 8;

export function createCrypt(ctx) {
  const { companion, card, say, field, sound } = ctx;
  const owner = {};
  let now = { souls: 0, skeletons: 0, nextCost: 25, perHour: 0, total: 0, awayCapHours: 8 };
  let shown = true;
  const diggers = [];

  // --- The card -------------------------------------------------------------
  const box = el('div', 'crypt');
  const head = el('h2', null, 'CRYPT');
  const close = el('button', 'card-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => card.close(owner));
  head.appendChild(close);
  const souls = el('p', 'crypt-souls');
  const horde = el('p', 'muted');
  const raiseOne = chip('', () => raise(1), 'solid');
  const row = el('div', 'row end');
  row.appendChild(raiseOne);
  const how = el('p', 'muted', 'Souls come from ghosts caught (1 each), files reaped (5 each) and finished hourglasses (1 a minute). Skeletons dig for more, even while you are away.');
  box.append(head, souls, horde, how, row);

  function paint() {
    souls.textContent = now.souls + (now.souls === 1 ? ' soul' : ' souls');
    horde.textContent = now.skeletons
      ? now.skeletons + (now.skeletons === 1 ? ' skeleton digs up ' : ' skeletons dig up ') + now.perHour + ' souls an hour.'
      : 'No skeletons yet. Each costs ' + now.nextCost + ' souls.';
    raiseOne.textContent = 'Raise a skeleton · ' + now.nextCost;
    raiseOne.disabled = now.souls < now.nextCost;
    crew();
  }

  // --- The skeletons ----------------------------------------------------------
  function crew() {
    const want = shown ? Math.min(SHOWN, now.skeletons) : 0;
    while (diggers.length > want) diggers.pop().remove();
    while (diggers.length < want) {
      const i = diggers.length;
      const node = el('div', 'digger');
      // Spread along the bottom edge, each a little out of step with the next.
      node.style.left = (6 + ((i * 37) % 88)) + '%';
      node.style.animationDelay = (-(i * 0.37) % 1.2) + 's';
      if (i % 2) node.classList.add('is-flipped');
      field.appendChild(node);
      diggers.push(node);
    }
  }

  // A small "+n" over one of the diggers when they bring something up.
  function unearthed(n) {
    if (!diggers.length || n < 1) return;
    const from = diggers[Math.floor(Math.random() * diggers.length)].getBoundingClientRect();
    const pop = el('div', 'soul-pop is-souls', '+' + n);
    pop.style.left = (from.left + 14) + 'px';
    pop.style.top = (from.top - 8) + 'px';
    field.appendChild(pop);
    setTimeout(() => pop.remove(), 900);
  }

  async function raise(count = 1) {
    const out = await companion.crypt({ raise: count });
    if (out.crypt) update(out.crypt);
    if (out.ok) {
      sound.bell();
      say(out.raised === 1 ? 'Rise.' : out.raised + ' rise.', 2500);
    } else if (card.isOpen(owner)) {
      say(out.error, 4000);
    }
    return out;
  }

  function update(next, event = {}) {
    const before = now;
    now = next;
    paint();
    // Souls for a deed pop over the reaper; what the skeletons dug, over them.
    if (event.gained) ctx.pop('+' + event.gained, 'is-souls');
    else if (event.dug && next.souls > before.souls) unearthed(next.souls - before.souls);
  }

  companion.onCrypt((event) => { if (event && event.crypt) update(event.crypt, event); });

  // A skeleton fades almost away while the cursor is over it, so it never
  // hides what is underneath. (Clicks already pass through it.) The window
  // ignores the mouse here, so this goes by the cursor position the app sends.
  const SLACK = 6;
  companion.onCursor((p) => {
    for (const node of diggers) {
      const r = node.getBoundingClientRect();
      const over = p.x >= r.left - SLACK && p.x <= r.right + SLACK && p.y >= r.top - SLACK && p.y <= r.bottom + SLACK;
      node.classList.toggle('is-faded', over);
    }
  });

  return {
    open() { paint(); card.open(box, 'soul', owner); },
    close() { card.close(owner); },
    isOpen: () => card.isOpen(owner),
    update,
    raise,
    get: () => now,
    setShown(on) { shown = !!on; crew(); },
    // "The skeletons dug up 12 souls." for the away report, or '' for nothing.
    report(dug) {
      if (!(dug >= 1)) return '';
      return 'The skeletons dug up ' + dug + (dug === 1 ? ' soul.' : ' souls.');
    }
  };
}
