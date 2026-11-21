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
  let now = { souls: 0, skeletons: 0, nextCost: 25, spirits: 0, spiritRoom: 25, digPerHour: 0, spiritsPerHour: 0, perHour: 0, total: 0, awayCapHours: 8, upgrades: [], hunt: null };
  let shown = true;
  // Whether the crypt has been heard from yet: the first news isn't a change.
  let seen = false;
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
  const haunt = el('p', 'muted');
  const deep = el('p', 'crypt-depth');
  const raiseOne = chip('', () => raise(1), 'solid');
  // As many as the souls cover, when that is more than one.
  const raiseAll = chip('', () => raise(Math.min(50, Math.floor(now.souls / now.nextCost))));
  // Summon from here: the hunt that fills the crypt, which the crypt improves.
  const huntChip = chip('Hunt ghosts', () => {
    card.close(owner);
    if (ctx.abilities) ctx.abilities.cast('summon');
  });
  const row = el('div', 'row end');
  row.append(raiseOne, raiseAll, huntChip);
  const how = el('p', 'muted', 'A ghost caught banks a soul (golden: 3) and binds a spirit. A file reaped banks 5; a finished hourglass, 1 a minute.');
  const shop = el('div', 'crypt-shop');
  const huntNote = el('p', 'muted');
  box.append(head, souls, deep, horde, haunt, row, how, el('h3', null, 'UPGRADES'), shop, huntNote);

  // One line per upgrade: its name and level, what it does, and a buy button.
  const lines = {};
  function shopLine(u) {
    const line = el('div', 'upgrade');
    const what = el('div', 'what');
    const name = el('b');
    what.append(name, el('small', 'muted', u.blurb));
    const buyChip = chip('', () => buy(u.id));
    line.append(what, buyChip);
    shop.appendChild(line);
    return (lines[u.id] = { name, buyChip });
  }

  function paintShop() {
    for (const u of now.upgrades || []) {
      const line = lines[u.id] || shopLine(u);
      line.name.textContent = u.name + ' ' + u.level + '/' + u.max;
      line.buyChip.textContent = u.cost === null ? 'Best' : 'Buy · ' + u.cost;
      line.buyChip.disabled = u.cost === null || now.souls < u.cost;
    }
    const h = now.hunt;
    huntNote.textContent = h ? 'Summon: ' + h.seconds + ' seconds, ' + Math.round(h.golden * 100) + '% of ghosts golden.' : '';
  }

  function paint() {
    souls.textContent = now.souls + (now.souls === 1 ? ' soul' : ' souls');
    horde.textContent = now.skeletons
      ? now.skeletons + (now.skeletons === 1 ? ' skeleton digs up ' : ' skeletons dig up ') + now.digPerHour + ' souls an hour.'
      : 'No skeletons yet. Each costs ' + now.nextCost + ' souls.';
    const full = now.spirits >= now.spiritRoom ? ' Full: buy urns for more room.' : '';
    haunt.textContent = now.spirits
      ? now.spirits + (now.spirits === 1 ? ' spirit haunts' : ' spirits haunt') + ' the crypt, room for ' + now.spiritRoom + ': ' +
        now.spiritsPerHour + (now.spiritsPerHour === 1 ? ' soul' : ' souls') + ' an hour.' + full
      : 'No spirits yet. Catch ghosts in Summon to bind them here.';
    raiseOne.textContent = 'Raise a skeleton · ' + now.nextCost;
    raiseOne.disabled = now.souls < now.nextCost;
    const afford = Math.min(50, Math.floor(now.souls / now.nextCost));
    raiseAll.hidden = afford < 2;
    raiseAll.textContent = 'Raise ' + afford;
    deep.textContent = 'Depth ' + (now.depth || 0) + (now.depth ? ': +' + now.depthBonus + '% to all it earns.' : '.') +
      (now.nextDepthAt ? ' Deeper at ' + now.nextDepthAt.toLocaleString() + ' souls gathered (' + Math.floor(now.total).toLocaleString() + ' so far).' : ' As deep as it goes.');
    paintShop();
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

  async function buy(id) {
    const out = await companion.crypt({ buy: id });
    if (out.crypt) update(out.crypt);
    if (out.ok) {
      sound.bell();
      const u = (out.crypt.upgrades || []).find((x) => x.id === id);
      say((u ? u.name : 'It') + ', level ' + out.level + '.', 2500);
    } else if (card.isOpen(owner)) {
      say(out.error, 4000);
    }
    return out;
  }

  function update(next, event = {}) {
    const before = now;
    now = next;
    paint();
    // A new depth is worth a word.
    if (seen && (next.depth || 0) > (before.depth || 0)) {
      sound.bell();
      say('The crypt goes deeper.\nDepth ' + next.depth + ': +' + next.depthBonus + '% to all it earns.', 5000);
    }
    seen = true;
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
    buy,
    get: () => now,
    setShown(on) { shown = !!on; crew(); },
    // "The crypt took in 12 souls." for the away report, or '' for nothing:
    // what the skeletons dug and the spirits earned meanwhile.
    report(dug) {
      if (!(dug >= 1)) return '';
      return 'The crypt took in ' + dug + (dug === 1 ? ' soul.' : ' souls.');
    }
  };
}
