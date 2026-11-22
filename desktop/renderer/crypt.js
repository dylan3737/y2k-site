// The Crypt on the page: its card (the dig, upgrades, milestones), and the
// skeletons that dig along the bottom of the screen. The rules and the saved
// numbers live in the main process (../crypt.js); this draws what it is told.
import { el, chip } from './dom.js';

// How many skeletons are drawn; the rest dig out of sight.
const SHOWN = 8;

const souls = (n) => n + (n === 1 ? ' soul' : ' souls');

export function createCrypt(ctx) {
  const { companion, card, say, field, sound } = ctx;
  const owner = {};
  let now = { souls: 0, skeletons: 0, nextCost: 25, perHour: 0, total: 0, awayCapHours: 8, goldenChance: 0.1, upgrades: [], milestones: [], bones: [], score: 0, rank: 'Gravekeeper', nextRank: null };
  let shown = true;
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
    const how = el('p', 'muted', 'Skeletons dig souls, even while you are away (up to ' + now.awayCapHours +
      ' hours with the app shut), and ripen as they dig: a ghost, and one more each hour, up to six. Drop him on a skeleton to reap it and hunt its ghosts. Summon raises one for his own soul.');
    const raiseOne = chip('Raise a skeleton · ' + now.nextCost, () => raise(1), 'solid');
    raiseOne.disabled = now.souls < now.nextCost;
    const row = el('div', 'row end');
    row.appendChild(raiseOne);
    const next = now.nextRank;
    const rank = el('p', 'crypt-rank', 'Rank: ' + (now.rank || 'Gravekeeper') + ' · ' + (now.score || 0) + ' points' +
      (next ? '. ' + next.name + ' at ' + next.at + ' (+' + next.reward + ' souls).' : '. The highest rank.'));
    page.append(horde, rank, how, row);
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
  // Each drawn skeleton keeps its own spot along the bottom while it lives, so
  // reaping one leaves the others where they are. They glow brighter the riper
  // they are (the more ghosts they hold).
  const SPOTS = [6, 43, 80, 25, 62, 15, 52, 90];
  function crew() {
    const want = shown ? (now.bones || []).slice(0, SHOWN) : [];
    const ids = new Set(want.map((b) => b.id));
    for (let i = diggers.length - 1; i >= 0; i--) {
      if (!ids.has(diggers[i].id)) diggers.splice(i, 1)[0].node.remove();
    }
    for (const bone of want) {
      let d = diggers.find((x) => x.id === bone.id);
      if (!d) {
        const taken = new Set(diggers.map((x) => x.spot));
        const spot = SPOTS.findIndex((_, k) => !taken.has(k));
        const node = el('div', 'digger');
        node.style.left = SPOTS[spot] + '%';
        node.style.animationDelay = (-(spot * 0.37) % 1.2) + 's';
        if (spot % 2) node.classList.add('is-flipped');
        field.appendChild(node);
        d = { id: bone.id, node, spot };
        diggers.push(d);
      }
      d.node.style.setProperty('--ripe', bone.ripe);
      d.node.classList.toggle('is-ripe', bone.ripe >= 6);
      d.node.title = bone.ripe === 1 ? 'Holds a ghost' : 'Holds ' + bone.ripe + ' ghosts';
    }
  }

  // Which drawn skeleton is under a point (the reaper's feet), as its place
  // among the crypt's skeletons, or -1.
  function diggerAt(p) {
    if (!p) return -1;
    const PAD = 18;
    const hit = diggers.find(({ node }) => {
      const r = node.getBoundingClientRect();
      return p.x >= r.left - PAD && p.x <= r.right + PAD && p.y >= r.top - PAD && p.y <= r.bottom + PAD;
    });
    return hit ? (now.bones || []).findIndex((b) => b.id === hit.id) : -1;
  }

  // Light up the skeleton under a point; null puts the light out.
  function aim(p) {
    const i = diggerAt(p);
    const id = i >= 0 ? now.bones[i].id : null;
    for (const d of diggers) d.node.classList.toggle('is-aimed', d.id === id);
    return i;
  }

  // Where a drawn skeleton is on screen, by its place among the crypt's.
  function diggerBox(index) {
    const bone = (now.bones || [])[index];
    const d = bone && diggers.find((x) => x.id === bone.id);
    return d ? d.node.getBoundingClientRect() : null;
  }

  // A small "+n" over one of the diggers when they bring something up.
  function unearthed(n) {
    if (!diggers.length || n < 1) return;
    const from = diggers[Math.floor(Math.random() * diggers.length)].node.getBoundingClientRect();
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

  // A skeleton fades almost away while the cursor is over it, so it never
  // hides what is underneath. (Clicks already pass through it.) The window
  // ignores the mouse here, so this goes by the cursor position the app sends.
  const SLACK = 6;
  companion.onCursor((p) => {
    for (const { node } of diggers) {
      const r = node.getBoundingClientRect();
      const over = p.x >= r.left - SLACK && p.x <= r.right + SLACK && p.y >= r.top - SLACK && p.y <= r.bottom + SLACK;
      node.classList.toggle('is-faded', over);
    }
  });

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
    diggerAt,
    aim,
    diggerBox,
    get: () => now,
    setShown(on) { shown = !!on; crew(); },
    // "The skeletons dug up 12 souls." for the away report, or '' for nothing.
    report(dug) {
      if (!(dug >= 1)) return '';
      return 'The skeletons dug up ' + souls(dug) + '.';
    }
  };
}
