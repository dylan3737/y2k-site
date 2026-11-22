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
  let now = { kinds: [], souls: 0, skeletons: 0, nextCost: 25, perHour: 0, total: 0, awayCapHours: 8, goldenChance: 0.1, upgrades: [], milestones: [], bones: [], score: 0, rank: 'Gravekeeper', nextRank: null };
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
      ' hours with the app shut), and ripen as they dig: a ghost, and one more each hour, up to six. Drop him on a skeleton to reap it and hunt its ghosts; it rises again empty. Summon reaps them all at once, for one big hunt. Higher ranks open other kinds.');
    // A raise button for each kind; the ones a rank has not opened say which.
    const kinds = el('div', 'crypt-kinds');
    for (const k of now.kinds || []) {
      const item = el('div', 'crypt-item' + (k.open ? '' : ' is-locked'));
      const text = el('div');
      text.append(el('b', null, k.name + (k.count ? ' · ' + k.count : '')),
        el('span', 'muted', k.open ? k.blurb : k.blurb + ' Opens at ' + k.rank + '.'));
      const full = k.most !== null && k.count >= k.most;
      const get = chip(!k.open ? '🔒' : full ? 'Full' : String(k.cost), () => raise(1, k.id), 'solid');
      get.dataset.kind = k.id;
      get.disabled = !k.open || full || now.souls < k.cost;
      get.setAttribute('aria-label', 'Raise a ' + k.name.toLowerCase() + (k.open ? ' for ' + k.cost + ' souls' : ''));
      item.append(text, get);
      kinds.appendChild(item);
    }
    const row = el('div');
    const next = now.nextRank;
    const rank = el('p', 'crypt-rank', 'Rank: ' + (now.rank || 'Gravekeeper') + ' · ' + (now.score || 0) + ' points' +
      (next ? '. ' + next.name + ' at ' + next.at + ' (+' + next.reward + ' souls).' : '. The highest rank.'));
    page.append(horde, rank, how, kinds, row);
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
  // They live along the bottom of the screen: each digs a while, leaves a
  // mound, and wanders somewhere new; now and then one hops, looks about or
  // naps. The riper one glows brighter (--ripe is how many ghosts it holds),
  // and a full one rattles and leaks wisps. They hop when he comes near. A
  // reaped one falls and claws back up where it stood.
  const W_BONE = 36;
  const WALK_PX_S = 24;
  const SPOTS = [6, 43, 80, 25, 62, 15, 52, 90];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fallen = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const span = () => Math.max(W_BONE, innerWidth - W_BONE - 8);

  // Transitions, in order: left (walking), opacity (fading), bottom (falling).
  function setX(d, x, seconds = 0) {
    d.x = Math.max(8, Math.min(span(), x));
    d.node.style.transitionDuration = (seconds ? seconds.toFixed(2) : '0') + 's, 0.2s, 0.35s';
    d.node.style.left = Math.round(d.x) + 'px';
  }

  function face(d, left) {
    d.left = left;
    d.node.classList.toggle('is-flipped', left);
  }

  function setMode(d, mode, ms) {
    d.mode = mode;
    d.until = performance.now() + ms;
    d.node.classList.toggle('is-walking', mode === 'walk');
    d.node.classList.toggle('is-napping', mode === 'nap');
    d.node.classList.toggle('is-hopping', mode === 'hop');
  }

  // Somewhere to go: not too near the others, nor where they are headed.
  function destination(d) {
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.max(8, Math.min(span(), d.x + (Math.random() < 0.5 ? -1 : 1) * rand(80, 380)));
      if (diggers.every((o) => o === d || Math.abs((o.to ?? o.x) - x) > 46)) return x;
    }
    return rand(8, span());
  }

  // A mound of dirt where one dug. It stays until it is swept away (a click:
  // a soul each); past sixteen, the oldest wears away on its own.
  const MOST_MOUNDS = 16;
  function mound(x) {
    const m = el('div', 'mound hit');
    m.title = 'Sweep it away';
    m.style.left = Math.round(x + W_BONE / 2 - 12) + 'px';
    m.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      sweepMound(m);
    });
    field.appendChild(m);
    const all = [...field.querySelectorAll('.mound:not(.is-swept)')];
    if (all.length > MOST_MOUNDS) all[0].remove();
  }

  async function sweepMound(m) {
    if (m.classList.contains('is-swept')) return;
    m.classList.add('is-swept');
    const r = m.getBoundingClientRect();
    for (let i = 0; i < 5; i++) {
      const dust = el('div', 'dust');
      dust.style.left = Math.round(r.left + 4 + i * 4) + 'px';
      dust.style.setProperty('--dx', Math.round(rand(-14, 14)) + 'px');
      field.appendChild(dust);
      setTimeout(() => dust.remove(), 700);
    }
    setTimeout(() => m.remove(), 400);
    const out = await companion.crypt({ sweep: 1 });
    if (out.crypt) update(out.crypt);
    if (out.ok) {
      const pop = el('div', 'soul-pop is-souls', '+' + out.gained);
      pop.style.left = Math.round(r.left + 4) + 'px';
      pop.style.top = Math.round(r.top - 14) + 'px';
      field.appendChild(pop);
      setTimeout(() => pop.remove(), 900);
    }
  }

  // Picking one up: it dangles where the cursor holds it, and when let go it
  // drops back to the ground and gets back to work. A click without a drag
  // only startles it.
  let held = null;
  function grab(d, e) {
    if (e.button !== 0 || held) return;
    e.stopPropagation();
    e.preventDefault();
    const r = d.node.getBoundingClientRect();
    held = { d, offX: e.clientX - r.left, offY: e.clientY - r.top, x0: e.clientX, y0: e.clientY, moved: 0 };
    try { d.node.setPointerCapture(e.pointerId); } catch {}
  }
  function carry(d, e) {
    if (!held || held.d !== d) return;
    held.moved = Math.max(held.moved, Math.hypot(e.clientX - held.x0, e.clientY - held.y0));
    if (held.moved < 5) return;
    if (d.mode !== 'held') {
      setMode(d, 'held', Infinity);
      d.node.classList.add('is-held');
      d.node.classList.remove('is-faded');
      d.to = null;
    }
    face(d, e.movementX < 0 ? true : e.movementX > 0 ? false : d.left);
    setX(d, e.clientX - held.offX);
    const h = d.node.offsetHeight;
    d.node.style.bottom = Math.max(0, Math.min(innerHeight - h, innerHeight - (e.clientY - held.offY) - h)) + 'px';
  }
  function drop(d, e) {
    if (!held || held.d !== d) return;
    const { moved } = held;
    held = null;
    try { d.node.releasePointerCapture(e.pointerId); } catch {}
    if (moved < 5) {
      d.node.classList.remove('is-startled');
      void d.node.offsetWidth;
      d.node.classList.add('is-startled');
      return;
    }
    // Down it falls, lands with a bump, and digs where it landed.
    d.node.style.bottom = '0px';
    setTimeout(() => {
      d.node.classList.remove('is-held');
      d.node.classList.add('is-landing');
      setTimeout(() => d.node.classList.remove('is-landing'), 400);
      setMode(d, 'dig', rand(15000, 40000));
    }, 350);
  }

  // What a skeleton does next, once it is done with what it was doing.
  function next(d) {
    const was = d.mode;
    if (was === 'dig' && d.kind !== 'lantern') mound(d.x);
    const roll = Math.random();
    if (was !== 'walk' && roll < 0.6) {
      const to = destination(d);
      const seconds = Math.abs(to - d.x) / WALK_PX_S;
      face(d, to < d.x);
      d.to = to;
      setMode(d, 'walk', seconds * 1000);
      setX(d, to, seconds);
      return;
    }
    d.to = null;
    if (roll < 0.72) return setMode(d, 'hop', 1300);
    if (roll < 0.8) {
      setMode(d, 'look', 2600);
      [500, 1200, 1900].forEach((t) => setTimeout(() => { if (d.mode === 'look') face(d, !d.left); }, t));
      return;
    }
    if (roll < 0.86 && d.ripe < 6) return setMode(d, 'nap', rand(12000, 30000));
    setMode(d, 'dig', rand(15000, 50000));
  }

  function puffOf(d, kind, text = '') {
    const r = d.node.getBoundingClientRect();
    const p = el('div', kind, text);
    p.style.left = Math.round(r.left + r.width / 2 + rand(-6, 6)) + 'px';
    p.style.top = Math.round(r.top + rand(0, 10)) + 'px';
    field.appendChild(p);
    setTimeout(() => p.remove(), 2600);
  }

  function tick() {
    if (!diggers.length || document.hidden) return;
    const t = performance.now();
    for (const d of diggers) {
      if (d.mode === 'held') continue;
      if (!still && t >= d.until) next(d);
      if (d.ripe >= 6 && Math.random() < 0.35) puffOf(d, 'wisp');
      if (d.mode === 'nap' && Math.random() < 0.25) puffOf(d, 'snore', 'z');
    }
  }
  setInterval(tick, 500);

  // He came near: the skeletons by his feet hop out of the way.
  let lastNear = 0;
  function near(p, now = false) {
    const t = performance.now();
    if (!p || (!now && t - lastNear < 250)) return;
    lastNear = t;
    for (const d of diggers) {
      if (d.mode === 'walk' || d.mode === 'held' || t - (d.startled ?? -Infinity) < 4000) continue;
      const r = d.node.getBoundingClientRect();
      if (Math.abs(p.x - (r.left + r.width / 2)) < 70 && p.y > r.top - 90 && p.y < r.bottom + 20) {
        d.startled = t;
        d.node.classList.remove('is-startled');
        void d.node.offsetWidth;
        d.node.classList.add('is-startled');
      }
    }
  }

  function crew() {
    const want = shown ? (now.bones || []).slice(0, SHOWN) : [];
    const ids = new Set(want.map((b) => b.id));
    for (let i = diggers.length - 1; i >= 0; i--) {
      if (!ids.has(diggers[i].id)) {
        const [d] = diggers.splice(i, 1);
        if (held && held.d === d) held = null;
        fallen.push(d.x);
        d.node.remove();
      }
    }
    for (const bone of want) {
      let d = diggers.find((x) => x.id === bone.id);
      if (!d) {
        const node = el('div', 'digger hit');
        node.style.animationDelay = (-Math.random() * 1.2).toFixed(2) + 's';
        field.appendChild(node);
        d = { id: bone.id, node, x: 0, to: null, mode: 'dig', until: 0, left: false };
        const me = d;
        node.addEventListener('pointerdown', (e) => grab(me, e));
        node.addEventListener('pointermove', (e) => carry(me, e));
        node.addEventListener('pointerup', (e) => drop(me, e));
        node.addEventListener('pointercancel', (e) => drop(me, e));
        diggers.push(d);
        // A reaped one rises where it fell; a new one at a free spot.
        const x = fallen.length ? fallen.shift()
          : SPOTS.map((f) => f / 100 * span()).find((sx) => diggers.every((o) => o === d || Math.abs(o.x - sx) > 46)) ?? rand(8, span());
        setX(d, x);
        face(d, Math.random() < 0.5);
        setMode(d, 'dig', rand(8000, 40000));
        node.classList.add('is-rising');
        setTimeout(() => node.classList.remove('is-rising'), 900);
      }
      d.ripe = bone.ripe;
      d.kind = bone.kind || 'digger';
      d.node.classList.toggle('is-ghoul', d.kind === 'ghoul');
      d.node.classList.toggle('is-lantern', d.kind === 'lantern');
      d.node.style.setProperty('--ripe', bone.ripe);
      d.node.classList.toggle('is-ripe', bone.ripe >= 6);
      d.node.title = d.kind === 'ghoul' ? 'A ghoul: digs hard, holds no ghosts'
        : d.kind === 'lantern' ? 'A lantern bearer: the others ripen faster'
          : bone.ripe === 1 ? 'Holds a ghost' : 'Holds ' + bone.ripe + ' ghosts';
    }
    fallen.length = 0;
  }

  // Which drawn skeleton is under a point (the reaper's feet), as its place
  // among the crypt's skeletons, or -1.
  function diggerAt(p) {
    if (!p) return -1;
    const PAD = 18;
    // Only the ones that hold ghosts can be reaped.
    const hit = diggers.find(({ node, kind, mode }) => {
      if ((kind && kind !== 'digger') || mode === 'held') return false;
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

  // Where every drawn skeleton is on screen.
  function diggerBoxes() {
    return diggers.map((d) => d.node.getBoundingClientRect());
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

  async function raise(n = 1, kind = 'digger') {
    const out = await companion.crypt({ raise: n, kind });
    if (out.crypt) update(out.crypt);
    if (out.ok) {
      sound.bell();
      const what = { ghoul: 'Ghoul, rise.', lantern: 'Bearer, light the way.' }[out.kind];
      say(what && out.raised === 1 ? what : out.raised === 1 ? 'Rise.' : out.raised + ' rise.', 2500);
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

  // A skeleton half fades while the cursor is over it, to show what is
  // underneath and that it can be picked up. This goes by the cursor position
  // the app sends, which arrives whether or not the window takes the mouse.
  const SLACK = 6;
  companion.onCursor((p) => {
    for (const { node } of diggers) {
      const r = node.getBoundingClientRect();
      const over = p.x >= r.left - SLACK && p.x <= r.right + SLACK && p.y >= r.top - SLACK && p.y <= r.bottom + SLACK;
      node.classList.toggle('is-faded', over && !held);
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
    diggerBoxes,
    near,
    // One is in the hand: the window keeps taking the mouse until it is let go.
    holding: () => !!held,
    // Every skeleton moves on to whatever it does next (for the tests).
    stir() { for (const d of diggers) { d.until = 0; next(d); } },
    get: () => now,
    setShown(on) { shown = !!on; crew(); },
    // "The skeletons dug up 12 souls." for the away report, or '' for nothing.
    report(dug) {
      if (!(dug >= 1)) return '';
      return 'The skeletons dug up ' + souls(dug) + '.';
    }
  };
}
