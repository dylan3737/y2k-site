// The Crypt on the page: its card (the dig, upgrades, milestones), and the
// skeletons that dig along the bottom of the screen. The rules and the saved
// numbers live in the main process (../crypt.js); this draws what it is told.
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

const souls = (n) => n + (n === 1 ? ' soul' : ' souls');

export function createCrypt(ctx) {
  const { companion, card, say, field, sound } = ctx;
  const owner = {};
  let now = { souls: 0, skeletons: 0, nextCost: 25, perHour: 0, total: 0, awayCapHours: 8, goldenChance: 0.1, upgrades: [], milestones: [] };
  let shown = true;
  let frames = null;
  let tab = 'dig';
  const diggers = [];

  // --- The card -------------------------------------------------------------
  const box = el('div', 'crypt');
  const head = el('h2', null, 'CRYPT');
  const close = el('button', 'card-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => card.close(owner));
  head.appendChild(close);
  const count = el('p', 'crypt-souls');
  const tabs = el('div', 'row crypt-tabs');
  const TABS = [['dig', 'Dig'], ['upgrades', 'Upgrades'], ['milestones', 'Milestones']];
  const tabChips = TABS.map(([id, label]) => {
    const c = chip(label, () => { tab = id; paint(); card.refit(); });
    c.dataset.tab = id;
    tabs.appendChild(c);
    return c;
  });
  const page = el('div', 'crypt-page');
  box.append(head, count, tabs, page);

  function digPage() {
    const horde = el('p', 'muted', now.skeletons
      ? now.skeletons + (now.skeletons === 1 ? ' skeleton digs up ' : ' skeletons dig up ') + now.perHour + ' souls an hour.'
      : 'No skeletons yet. The first costs ' + now.nextCost + ' souls.');
    const how = el('p', 'muted', 'Souls come from ghosts caught, files reaped and finished hourglasses. Skeletons dig for more, even while you are away (up to ' +
      now.awayCapHours + ' hours with the app shut).');
    const raiseOne = chip('Raise a skeleton · ' + now.nextCost, () => raise(1), 'solid');
    raiseOne.disabled = now.souls < now.nextCost;
    const row = el('div', 'row end');
    row.appendChild(raiseOne);
    page.append(horde, how, row);
  }

  function upgradesPage() {
    for (const u of now.upgrades) {
      const item = el('div', 'crypt-item');
      const text = el('div');
      text.append(el('b', null, u.name + ' ' + u.level + '/' + u.max), el('span', 'muted', u.blurb + ' Now: ' + u.now + (u.next ? ', next: ' + u.next + '.' : '.')));
      const get = chip(u.cost === null ? 'Done' : String(u.cost), () => buy(u.id), 'solid');
      get.disabled = u.cost === null || now.souls < u.cost;
      get.setAttribute('aria-label', u.cost === null ? u.name + ' is complete' : 'Buy ' + u.name + ' for ' + u.cost + ' souls');
      item.append(text, get);
      page.appendChild(item);
    }
  }

  function milestonesPage() {
    const done = now.milestones.filter((m) => m.done).length;
    page.appendChild(el('p', 'muted', done + ' of ' + now.milestones.length + ' reached. Each pays souls once.'));
    // What is still ahead first; what is done, dimmed, after.
    for (const m of [...now.milestones.filter((x) => !x.done), ...now.milestones.filter((x) => x.done)]) {
      const item = el('div', 'crypt-item' + (m.done ? ' is-done' : ''));
      const text = el('div');
      text.append(el('b', null, m.name), el('span', 'muted', m.how));
      item.append(text, el('span', 'crypt-reward', (m.done ? '✓ ' : '+') + m.reward));
      page.appendChild(item);
    }
  }

  function paint() {
    count.textContent = souls(now.souls);
    tabChips.forEach((c) => c.classList.toggle('is-on', c.dataset.tab === tab));
    const top = page.scrollTop;
    page.replaceChildren();
    if (tab === 'upgrades') upgradesPage();
    else if (tab === 'milestones') milestonesPage();
    else digPage();
    page.scrollTop = top;
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

  async function raise(n = 1) {
    const out = await companion.crypt({ raise: n });
    if (out.crypt) update(out.crypt);
    if (out.ok) {
      sound.bell();
      say(out.raised === 1 ? 'Rise.' : out.raised + ' rise.', 2500);
    } else if (card.isOpen(owner)) {
      say(out.error, 4000);
    }
    return out;
  }

  async function buy(id) {
    const out = await companion.crypt({ buy: id });
    if (out.crypt) update(out.crypt);
    if (out.ok) {
      sound.bell();
      say(out.name + '.\nLevel ' + out.level + '.', 2500);
    } else if (card.isOpen(owner)) {
      say(out.error, 4000);
    }
    return out;
  }

  // Milestones reached: a bell, and his word for it. Several at once share a bubble.
  function celebrate(reached) {
    if (!reached || !reached.length) return;
    sound.bell();
    const total = reached.reduce((sum, m) => sum + m.reward, 0);
    const names = reached.length <= 2 ? reached.map((m) => m.name).join(' and ') : reached.length + ' milestones';
    // After whatever he is saying about the deed that got there.
    setTimeout(() => {
      say('Milestone: ' + names + '.\n+' + souls(total) + '.', 6000);
      ctx.pop('+' + total, 'is-souls');
    }, 1200);
  }

  function update(next, event = {}) {
    const before = now;
    now = { ...now, ...next };
    paint();
    // Souls for a deed pop over the reaper; what the skeletons dug, over them.
    if (event.gained) ctx.pop('+' + event.gained, 'is-souls');
    else if (event.dug && next.souls > before.souls) unearthed(next.souls - before.souls);
    celebrate(event.reached);
  }

  companion.onCrypt((event) => { if (event && event.crypt) update(event.crypt, event); });

  return {
    open(which) {
      if (which) tab = which;
      paint();
      card.open(box, 'soul', owner);
    },
    close() { card.close(owner); },
    isOpen: () => card.isOpen(owner),
    update,
    raise,
    buy,
    get: () => now,
    setShown(on) { shown = !!on; crew(); },
    // "The skeletons dug up 12 souls." for the away report, or '' for nothing.
    report(dug) {
      if (!(dug >= 1)) return '';
      return 'The skeletons dug up ' + souls(dug) + '.';
    }
  };
}
