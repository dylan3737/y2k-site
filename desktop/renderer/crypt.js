// The Crypt on the page: its card, the souls counter, and the skeletons that
// dig along the bottom of the screen. The rules and the saved numbers live in
// the main process (../crypt.js); this draws what it is told.
import { el, chip } from './dom.js';

// How many skeletons are drawn; the rest dig out of sight.
const SHOWN = 8;

// Two frames of a small skeleton with a shovel, as pixels. w bone, g shade,
// k dark, s shovel handle, m shovel blade.
const FRAMES = [
  [
    '....wwww........',
    '...wwwwww.....m.',
    '...wkwwkw....mm.',
    '...wwwwww....s..',
    '....wkkw....s...',
    '.....ww....s....',
    '...wwwwwwwws....',
    '..w.wggw..s.....',
    '..w.wwww........',
    '..w.wggw........',
    '....wwww........',
    '....w..w........',
    '....w..w........',
    '....w..w........',
    '...ww..ww.......'
  ],
  [
    '................',
    '....wwww........',
    '...wwwwww.......',
    '...wkwwkw.......',
    '...wwwwww.......',
    '....wkkw........',
    '.....ww.........',
    '...wwwwwww......',
    '..w.wggw.ws.....',
    '..w.wwww..s.....',
    '..w.wggw...s....',
    '....wwww....s...',
    '....w..w....mm..',
    '....w..w....mm..',
    '...ww..ww.......'
  ]
];
const INK = { w: '#ece7da', g: '#a59f8c', k: '#1a1028', s: '#8a5a3a', m: '#9fb0c0' };

function drawFrame(rows) {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const g = canvas.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!INK[ch]) return;
    g.fillStyle = INK[ch];
    g.fillRect(x, y, 1, 1);
  }));
  return canvas.toDataURL();
}

export function createCrypt(ctx) {
  const { companion, card, say, field, sound } = ctx;
  const owner = {};
  let now = { souls: 0, skeletons: 0, nextCost: 25, perHour: 0, total: 0, awayCapHours: 8 };
  let shown = true;
  let frames = null;
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
      : 'No skeletons yet. The first costs ' + now.nextCost + ' souls.';
    raiseOne.textContent = 'Raise a skeleton · ' + now.nextCost;
    raiseOne.disabled = now.souls < now.nextCost;
    crew();
  }

  // --- The skeletons ----------------------------------------------------------
  function crew() {
    const want = shown ? Math.min(SHOWN, now.skeletons) : 0;
    while (diggers.length > want) diggers.pop().remove();
    while (diggers.length < want) {
      if (!frames) frames = FRAMES.map(drawFrame);
      const i = diggers.length;
      const node = el('div', 'digger');
      node.style.setProperty('--a', 'url(' + frames[0] + ')');
      node.style.setProperty('--b', 'url(' + frames[1] + ')');
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
