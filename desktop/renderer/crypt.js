// The Crypt on the page: its card (the dig, upgrades, milestones), and the
// sprites that work along the bottom of the screen. The rules and the saved
// numbers live in the main process (../crypt.js); this draws what it is told.
import { el, chip } from './dom.js';
// How many sprites are drawn (the rules' number); the rest work out of sight.
import { SHOWN } from '../crypt.js';

const souls = (n) => n + (n === 1 ? ' soul' : ' souls');

export function createCrypt(ctx) {
  const { companion, card, say, field, sound } = ctx;
  const owner = {};
  let now = { kinds: [], souls: 0, skeletons: 0, nextCost: 25, perHour: 0, total: 0, awayCapHours: 8, goldenChance: 0.1, upgrades: [], milestones: [], bones: [], score: 0, rank: 'Gravekeeper', nextRank: null };
  let shown = true;
  // Kinds the user keeps off the screen (they still work, and a Gathering
  // still reaps them).
  let hidden = new Set();
  let tab = 'dig';
  const diggers = [];

  // --- The card -------------------------------------------------------------
  const box = el('div', 'crypt');
  const head = el('h2', null, 'GARDEN');
  const close = el('button', 'card-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => card.close(owner));
  head.appendChild(close);
  const count = el('p', 'crypt-souls');
  const tabs = el('div', 'row crypt-tabs');
  const TABS = [['dig', 'Garden'], ['upgrades', 'Upgrades'], ['milestones', 'Milestones']];
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
      ? (now.skeletons === 1 ? 'One worker gathers ' : now.skeletons + ' workers gather ') + now.perHour + ' souls an hour.'
      : 'Nothing grows here yet. The first moss sprite costs ' + now.nextCost + ' souls.');
    const how = el('p', 'muted', 'Moss sprites gather souls, even while you are away (up to ' + now.awayCapHours +
      ' hours with the app shut), and tend a sprout that grows as they work: a ghost, and one more each hour, up to six at full bloom. Drop him on a sprite to reap it and hunt its ghosts; it leaves a seed that sprouts back in 30 minutes. Summon reaps them all at once, for one big hunt. Higher ranks open other workers.');
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
      // Shown on screen, or kept out of sight (it works all the same).
      const buttons = el('div', 'crypt-buttons');
      if (k.count) {
        const off = hidden.has(k.id);
        const eye = chip(off ? 'Hidden' : 'Shown', () => {
          if (hidden.has(k.id)) hidden.delete(k.id); else hidden.add(k.id);
          companion.save({ hiddenKinds: [...hidden] });
          crew();
          paint();
        });
        eye.dataset.eye = k.id;
        eye.classList.toggle('is-off', off);
        eye.title = off ? 'Kept off the screen; it still works. Click to show it.' : 'On the screen. Click to hide it (it still works).';
        buttons.appendChild(eye);
      }
      buttons.appendChild(get);
      item.append(text, buttons);
      kinds.appendChild(item);
    }
    const row = el('div');
    const next = now.nextRank;
    const rank = el('p', 'crypt-rank', 'Rank: ' + (now.rank || 'Groundskeeper') + ' · ' + (now.score || 0) + ' points' +
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

  // --- The sprites ----------------------------------------------------------
  // They live along the bottom of the screen: each digs a while, leaves a
  // mound, and wanders somewhere new; now and then one hops, looks about or
  // naps. The riper one glows brighter (--ripe is how many ghosts it holds),
  // and a full one rattles and leaks wisps. They hop when he comes near. A
  // reaped one falls and claws back up where it stood.
  const W_BONE = 36;
  // How each walks: its pace (pixels a second), and whether it is drawn
  // facing left (so it is flipped to go right).
  const PACE = { digger: 24, snail: 6, frog: 70, caterpillar: 8, robin: 60, ladybug: 10 };
  const FACES_LEFT = new Set(['snail', 'robin', 'ladybug']);
  // Those that crawl keep moving their legs (frames) as they go; frogs and
  // robins hop; sprites bob.
  const CRAWLS = new Set(['snail', 'caterpillar', 'ladybug']);
  // Which can be reaped: the ones that grow ghosts.
  const REAPABLE = new Set(['digger', 'snail', 'frog']);
  const SPOTS = [6, 43, 80, 25, 62, 15, 52, 90, 34, 71, 11, 57, 86, 20, 47, 75];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fallen = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const span = () => Math.max(W_BONE, innerWidth - W_BONE - 8);

  // Transitions, in order: left (walking), opacity (fading), bottom (falling).
  // The left edge they keep to: clear of the dragon's hoard, when there is one.
  const leftEdge = () => {
    const h = document.querySelector('.hoard');
    return h ? Math.round(h.getBoundingClientRect().right + 8) : 8;
  };
  function setX(d, x, seconds = 0) {
    d.x = Math.max(leftEdge(), Math.min(span(), x));
    d.node.style.transitionDuration = (seconds ? seconds.toFixed(2) : '0') + 's, 0.2s, 0.35s';
    d.node.style.left = Math.round(d.x) + 'px';
  }

  function face(d, left) {
    d.left = left;
    d.node.classList.toggle('is-flipped', left !== FACES_LEFT.has(d.kind));
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

  // What a sprite does next, once it is done with what it was doing.
  function next(d) {
    const was = d.mode;

    const roll = Math.random();
    // A frog mostly sits; a crawler mostly crawls.
    const goes = d.kind === 'frog' ? 0.25 : CRAWLS.has(d.kind) ? 0.75 : 0.6;
    if (was !== 'walk' && roll < goes) {
      const to = d.kind === 'frog' ? Math.max(8, Math.min(span(), d.x + (Math.random() < 0.5 ? -1 : 1) * rand(40, 110))) : destination(d);
      const seconds = Math.abs(to - d.x) / (PACE[d.kind] || PACE.digger);
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
    if (roll < 0.86 && d.kind === 'digger' && d.ripe < 6) return setMode(d, 'nap', rand(12000, 30000));
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
    if (document.hidden) return;
    const t = performance.now();
    for (const f of flyers) if (t >= f.until) nextFlight(f);
    if (!diggers.length) return;
    for (const d of diggers) {
      if (d.mode === 'held') continue;
      if (!still && t >= d.until) next(d);
      if (d.most && d.ripe >= d.most && Math.random() < 0.35) puffOf(d, 'wisp');
      // A robin sings now and then.
      if (d.kind === 'robin' && d.mode === 'dig' && Math.random() < 0.06) puffOf(d, 'note', Math.random() < 0.5 ? '♪' : '♫');
      if (d.mode === 'nap' && Math.random() < 0.25) puffOf(d, 'snore', 'z');
    }
  }
  setInterval(tick, 500);

  // He came near: the sprites by his feet hop out of the way.
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

  // --- Seeds, moths and wisps --------------------------------------------------
  // A reaped sprite leaves a seed where it was, until it sprouts back there.
  // Moths flutter about the top of the screen and rest against it;
  // will-o'-wisps drift above the sprites. Neither takes clicks.
  const graves = new Map();    // bone id -> { node, x }: its seed
  const flyers = [];           // { id, kind, node, mode, until }

  function grave(bone, x) {
    let g = graves.get(bone.id);
    const moth = bone.kind === 'moth';
    if (!g) {
      // A moth rests as a cocoon hanging from the top; the others as a seed.
      const node = el('div', moth ? 'cocoon' : 'seed');
      node.style.left = Math.round(Math.max(8, Math.min(innerWidth - 40, x)) + (moth ? 0 : W_BONE / 2 - 9)) + 'px';
      field.appendChild(node);
      g = { node, x };
      graves.set(bone.id, g);
    }
    g.node.title = (moth ? 'A cocoon. It opens in ' : 'A seed. It sprouts in ') + bone.rest + (bone.rest === 1 ? ' minute.' : ' minutes.');
    return g;
  }

  function flyer(bone) {
    let f = flyers.find((x) => x.id === bone.id);
    if (f) return f;
    const node = el('div', bone.kind === 'moth' ? 'moth hit' : bone.kind === 'bee' ? 'bee' : 'wisp-worker');
    node.style.animationDelay = (-Math.random()).toFixed(2) + 's';
    field.appendChild(node);
    f = { id: bone.id, kind: bone.kind, node, mode: '', until: 0, x: rand(40, innerWidth - 80), y: 0 };
    flyers.push(f);
    if (bone.kind === 'moth') {
      // Picked up, it flutters in the hand; let go, it flies on from there.
      const me = f;
      node.addEventListener('pointerdown', (e) => grabMoth(me, e));
      node.addEventListener('pointermove', (e) => carryMoth(me, e));
      node.addEventListener('pointerup', (e) => dropMoth(me, e));
      node.addEventListener('pointercancel', (e) => dropMoth(me, e));
    }
    node.title = { moth: 'A moth: in a hunt, it catches ghosts that would get away', bee: 'A bee: it pollinates, and a worker grows a ghost' }[bone.kind] ||
      "A will-o'-wisp: the sprouts grow faster";
    place(f, f.x, bone.kind === 'moth' ? 0 : innerHeight - 140, 0);
    nextFlight(f);
    return f;
  }

  function place(f, x, y, seconds) {
    f.x = Math.max(4, Math.min(innerWidth - 70, x));
    f.y = Math.max(0, Math.min(innerHeight - 60, y));
    f.node.style.transitionDuration = seconds.toFixed(2) + 's';
    f.node.style.left = Math.round(f.x) + 'px';
    f.node.style.top = Math.round(f.y) + 'px';
  }

  // What a moth or a wisp does next.
  function nextFlight(f) {
    const t = performance.now();
    if (f.kind === 'moth') {
      if (f.mode !== 'fly' && !still) {
        // Off it flits, somewhere in the top of the screen.
        const seconds = rand(2.5, 5);
        f.node.classList.add('is-flying');
        f.node.classList.toggle('is-left', Math.random() < 0.5);
        place(f, rand(20, innerWidth - 90), rand(10, innerHeight * 0.35), seconds);
        f.mode = 'fly';
        f.until = t + seconds * 1000;
      } else {
        // Up to the top edge, to rest there a while, wings open.
        f.node.classList.remove('is-flying');
        place(f, f.x, 0, still ? 0 : 0.8);
        f.mode = 'hang';
        f.until = t + rand(15000, 45000);
      }
      return;
    }
    if (f.kind === 'bee') return beeFlight(f, t);
    // A wisp drifts over to hover above one of the sprites.
    const ground = diggers.filter((d) => d.kind === 'digger' && d.mode !== 'held');
    const over = ground.length ? ground[Math.floor(Math.random() * ground.length)] : null;
    const x = over ? over.x + W_BONE / 2 - 16 + rand(-10, 10) : rand(40, innerWidth - 80);
    place(f, x, innerHeight - 62 - 58 + rand(-8, 8), still ? 0 : rand(2.5, 4.5));
    f.mode = 'drift';
    f.until = t + rand(12000, 28000);
  }

  // A moth in the hand: it follows the cursor, wings going; let go, it flies on.
  let heldMoth = null;
  function grabMoth(f, e) {
    if (e.button !== 0 || heldMoth || held) return;
    e.stopPropagation();
    e.preventDefault();
    const r = f.node.getBoundingClientRect();
    heldMoth = { f, offX: e.clientX - r.left, offY: e.clientY - r.top, moved: 0, x0: e.clientX, y0: e.clientY };
    try { f.node.setPointerCapture(e.pointerId); } catch {}
  }
  function carryMoth(f, e) {
    if (!heldMoth || heldMoth.f !== f) return;
    heldMoth.moved = Math.max(heldMoth.moved, Math.hypot(e.clientX - heldMoth.x0, e.clientY - heldMoth.y0));
    if (heldMoth.moved < 5) return;
    f.mode = 'held';
    f.until = Infinity;
    f.node.classList.add('is-flying', 'is-held');
    if (e.movementX) f.node.classList.toggle('is-left', e.movementX < 0);
    place(f, e.clientX - heldMoth.offX, e.clientY - heldMoth.offY, 0);
  }
  function dropMoth(f, e) {
    if (!heldMoth || heldMoth.f !== f) return;
    heldMoth = null;
    try { f.node.releasePointerCapture(e.pointerId); } catch {}
    f.node.classList.remove('is-held');
    // Off it goes again, from where it was let go.
    f.mode = 'hang';
    nextFlight(f);
  }

  // How a worker shows: on the ground (its kind, or a caterpillar for a moth
  // still turning), resting (a seed, or a moth's cocoon), or in the air.
  function shape(bone) {
    if (bone.kind === 'moth') return bone.rest ? (bone.rest > 30 ? 'caterpillar' : 'rest') : 'air';
    if (bone.rest) return 'rest';
    return bone.kind === 'wisp' || bone.kind === 'bee' ? 'air' : bone.kind;
  }

  // A bee buzzes from worker to worker. Now and then it settles on one that
  // grows ghosts and pollinates it (the rules say whether it may).
  function beeFlight(f, t) {
    const growing = diggers.filter((d) => REAPABLE.has(d.kind) && d.mode !== 'held' && d.most && d.ripe < d.most);
    const over = growing.length ? growing[Math.floor(Math.random() * growing.length)] : null;
    const x = over ? over.x + 8 + rand(-6, 6) : rand(40, innerWidth - 80);
    const y = innerHeight - (over ? over.node.offsetHeight : 40) - 30 + rand(-10, 6);
    const seconds = still ? 0 : rand(1.2, 2.4);
    f.node.classList.toggle('is-left', x < f.x);
    place(f, x, y, seconds);
    f.mode = 'buzz';
    f.until = t + seconds * 1000 + rand(2500, 6000);
    if (over && t >= (f.pollenTry || 0)) {
      f.pollenTry = t + rand(60000, 180000);
      setTimeout(async () => {
        const index = (now.bones || []).findIndex((b) => b.id === over.id);
        if (index < 0 || !diggers.includes(over)) return;
        const out = await companion.crypt({ pollinate: index });
        if (out && out.crypt) update(out.crypt);
        if (out && out.ok) for (let k = 0; k < 5; k++) setTimeout(() => puffOf(over, 'pollen'), k * 90);
      }, seconds * 1000 + 300);
    }
  }

  function crew() {
    const want = shown ? (now.bones || []).filter((b) => !hidden.has(b.kind)).slice(0, SHOWN) : [];
    const as = new Map(want.map((b) => [b.id, shape(b)]));
    for (let i = diggers.length - 1; i >= 0; i--) {
      const look = as.get(diggers[i].id);
      if (look !== diggers[i].kind) {
        const [d] = diggers.splice(i, 1);
        if (held && held.d === d) held = null;
        fallen.push(d.x);
        d.node.remove();
      }
    }
    for (const [id, g] of graves) {
      if (as.get(id) !== 'rest') {
        g.node.remove();
        graves.delete(id);
        // Back: it comes up where its seed (or cocoon) was.
        if (as.has(id)) fallen.unshift(g.x);
      }
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      if (as.get(flyers[i].id) !== 'air') {
        const [f] = flyers.splice(i, 1);
        if (heldMoth && heldMoth.f === f) heldMoth = null;
        // A reaped moth's cocoon hangs where it was.
        if (f.kind === 'moth') fallen.push(f.x);
        f.node.remove();
      }
    }
    for (const bone of want) {
      const look = as.get(bone.id);
      if (look === 'rest') { grave(bone, graves.has(bone.id) ? graves.get(bone.id).x : fallen.length ? fallen.shift() : rand(8, span())); continue; }
      if (look === 'air') { flyer(bone); continue; }
      let d = diggers.find((x) => x.id === bone.id);
      if (!d) {
        const node = el('div', 'digger hit is-' + look);
        node.style.animationDelay = (-Math.random() * 1.2).toFixed(2) + 's';
        // What shows how ripe it is: a sprout beside a sprite, a bloom on a
        // snail's shell or a frog's lily pad.
        if (look === 'digger') node.appendChild(el('div', 'sprout'));
        if (look === 'snail' || look === 'frog') node.appendChild(el('div', 'bloom'));
        field.appendChild(node);
        d = { id: bone.id, node, x: 0, to: null, mode: 'dig', until: 0, left: false, kind: look };
        const me = d;
        node.addEventListener('pointerdown', (e) => grab(me, e));
        node.addEventListener('pointermove', (e) => carry(me, e));
        node.addEventListener('pointerup', (e) => drop(me, e));
        node.addEventListener('pointercancel', (e) => drop(me, e));
        diggers.push(d);
        // A reaped one comes back where it was; a new one at a free spot.
        const x = fallen.length ? fallen.shift()
          : SPOTS.map((f) => f / 100 * span()).find((sx) => diggers.every((o) => o === d || Math.abs(o.x - sx) > 46)) ?? rand(8, span());
        setX(d, x);
        face(d, Math.random() < 0.5);
        setMode(d, 'dig', rand(8000, 40000));
        node.classList.add('is-rising');
        setTimeout(() => node.classList.remove('is-rising'), 900);
      }
      d.ripe = bone.ripe;
      d.most = bone.most || 0;
      d.node.style.setProperty('--ripe', bone.ripe);
      // Six pictures of growing, whatever the most it can hold.
      d.node.style.setProperty('--stage', d.most ? Math.max(1, Math.min(6, Math.ceil(bone.ripe / d.most * 6))) : 1);
      d.node.classList.toggle('is-ripe', d.most > 0 && bone.ripe >= d.most);
      d.node.title = {
        snail: 'A snail: gathers twice as much; ' + bone.ripe + ' of 3 ghosts',
        frog: 'A frog: gathers half as much again; ' + bone.ripe + ' of 4 ghosts',
        caterpillar: 'A caterpillar: a moth in ' + Math.max(0, bone.rest - 30) + ' minutes, after a cocoon',
        robin: 'A robin: reaped workers come back sooner',
        ladybug: 'A ladybug: more spirit-lights in hunts'
      }[look] || (bone.ripe >= 6 ? 'In full bloom: 6 ghosts' : bone.ripe === 1 ? 'A seedling: 1 ghost' : 'Growing: ' + bone.ripe + ' ghosts');
    }
    fallen.length = 0;
  }


  // Seeds sprout on their own time: look again each minute while there are any.
  setInterval(async () => {
    if (!graves.size || document.hidden) return;
    const out = await companion.crypt({});
    if (out && out.crypt) update(out.crypt);
  }, 60000);

  // A moth flutters from wherever it is to a point (a ghost getting away) and
  // back. Resolves when it gets there. One flies in from the top if none is drawn.
  function swoop(x, y) {
    return new Promise((resolve) => {
      const moths = flyers.filter((f) => f.kind === 'moth');
      const from = moths.length ? moths[Math.floor(Math.random() * moths.length)] : null;
      const node = el('div', 'moth is-flying is-swooping');
      const start = from ? { x: from.x, y: from.y } : { x: x < innerWidth / 2 ? -60 : innerWidth, y: 0 };
      if (from) from.node.style.visibility = 'hidden';
      node.style.left = Math.round(start.x) + 'px';
      node.style.top = Math.round(start.y) + 'px';
      node.classList.toggle('is-left', x < start.x);
      field.appendChild(node);
      requestAnimationFrame(() => {
        node.style.transitionDuration = '0.42s';
        node.style.left = Math.round(x - 32) + 'px';
        node.style.top = Math.round(y - 20) + 'px';
      });
      setTimeout(() => {
        resolve();
        node.style.transitionDuration = '0.5s';
        node.style.left = Math.round(start.x) + 'px';
        node.style.top = Math.round(start.y) + 'px';
        setTimeout(() => { node.remove(); if (from) from.node.style.visibility = ''; }, 520);
      }, 440);
    });
  }


  // Which drawn sprite is under a point (the reaper's feet), as its place
  // among the garden's sprites, or -1.
  // What he would reap: a worker on the ground under his feet `p`, or a moth
  // anywhere he touches (`box`, his whole figure: moths keep to the top of the
  // screen, out of reach of his feet). As its place among the garden's, or -1.
  function diggerAt(p, box) {
    if (!p) return -1;
    const PAD = 18;
    const hit = diggers.find(({ node, mode, kind }) => {
      if (mode === 'held' || !REAPABLE.has(kind)) return false;
      const r = node.getBoundingClientRect();
      return p.x >= r.left - PAD && p.x <= r.right + PAD && p.y >= r.top - PAD && p.y <= r.bottom + PAD;
    }) || (box && flyers.find(({ node, kind, mode }) => {
      if (kind !== 'moth' || mode === 'held') return false;
      const r = node.getBoundingClientRect();
      return box.left < r.right - 8 && box.right > r.left + 8 && box.top < r.bottom - 6 && box.bottom > r.top + 6;
    }));
    return hit ? (now.bones || []).findIndex((b) => b.id === hit.id) : -1;
  }

  // A snail the dragon (its box) is over, as its place among the garden's, or
  // -1; it lights up (null puts the light out).
  function snailUnder(box) {
    const hit = box && diggers.find(({ node, mode, kind }) => {
      if (kind !== 'snail' || mode === 'held') return false;
      const r = node.getBoundingClientRect();
      return box.left < r.right && box.right > r.left && box.top < r.bottom + 10 && box.bottom > r.top - 10;
    });
    for (const d of diggers) d.node.classList.toggle('is-aimed', !!hit && d === hit);
    return hit ? (now.bones || []).findIndex((b) => b.id === hit.id && !b.rest) : -1;
  }

  // Light up the sprite under a point; null puts the light out.
  function aim(p, box) {
    const i = diggerAt(p, box);
    const id = i >= 0 ? now.bones[i].id : null;
    for (const d of diggers) d.node.classList.toggle('is-aimed', d.id === id);
    for (const f of flyers) f.node.classList.toggle('is-aimed', f.id === id);
    return i;
  }

  // Where a drawn sprite is on screen, by its place among the garden's.
  function diggerBox(index) {
    const bone = (now.bones || [])[index];
    const d = bone && (diggers.find((x) => x.id === bone.id) || flyers.find((x) => x.id === bone.id));
    return d ? d.node.getBoundingClientRect() : null;
  }

  // Where every drawn sprite is on screen.
  // (The Gathering's ghosts come out of the ones that grow them.)
  function diggerBoxes() {
    return diggers.filter((d) => REAPABLE.has(d.kind)).map((d) => d.node.getBoundingClientRect());
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
      const what = { snail: 'A snail. Take your time.', frog: 'A frog. It approves of nothing.', bee: 'Busy, busy.',
        moth: 'A caterpillar. Give it a few hours.', robin: 'A robin. It sings at dawn. And noon.', wisp: 'A light that is not yours to follow.',
        ladybug: 'A ladybug. For luck.' }[out.kind];
      say(what && out.raised === 1 ? what : out.raised === 1 ? 'Grow.' : out.raised + ' sprout.', 2500);
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
    // The dragon lives in the garden's state. (First: its hoard is a place the
    // workers keep clear of.)
    if (ctx.dragon && 'dragon' in next) ctx.dragon.update(next.dragon);
    paint();
    // Souls for a deed pop over the reaper; what the garden gathered, over them.
    if (event.gained) ctx.pop('+' + event.gained, 'is-souls');
    else if (event.dug && next.souls > before.souls) unearthed(next.souls - before.souls);
    celebrate(event.reached);
  }

  companion.onCrypt((event) => { if (event && event.crypt) update(event.crypt, event); });

  // A sprite half fades while the cursor is over it, to show what is
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
    snailUnder,
    // The ripest sprout on screen (for a crow to go after): its id and where it is.
    ripest() {
      let best = null;
      for (const d of diggers) {
        const b = (now.bones || []).find((x) => x.id === d.id);
        if (!b || b.rest || !REAPABLE.has(d.kind) || d.mode === 'held' || b.ripe < 1) continue;
        if (!best || b.ripe > best.ripe) best = { id: b.id, ripe: b.ripe, box: d.node.getBoundingClientRect() };
      }
      return best;
    },
    // The sprouts within `r` of a point, as their places in the garden.
    sproutsNear(x, y, r) {
      const out = [];
      for (const d of diggers) {
        if (!REAPABLE.has(d.kind) || d.mode === 'held') continue;
        const b = d.node.getBoundingClientRect();
        const i = (now.bones || []).findIndex((x2) => x2.id === d.id && !x2.rest);
        if (i >= 0 && Math.hypot(b.left + b.width / 2 - x, b.top + b.height / 2 - y) <= r) out.push(i);
      }
      return out;
    },
    // Where a worker is now, by its id, and its place in the garden (or null).
    whereIs(id) {
      const d = diggers.find((x) => x.id === id);
      const i = (now.bones || []).findIndex((b) => b.id === id && !b.rest);
      return d && i >= 0 ? { index: i, box: d.node.getBoundingClientRect() } : null;
    },
    aim,
    diggerBox,
    diggerBoxes,
    // Where a worker of a kind is (the dragon likes to watch the snails).
    workerBox: (kind) => { const d = diggers.find((x) => x.kind === kind); return d ? d.node.getBoundingClientRect() : null; },
    near,
    swoop,
    // How many moths are about, not cocoons (each saves two ghosts a hunt).
    moths: () => now.moths || 0,
    // One is in the hand: the window keeps taking the mouse until it is let go.
    holding: () => !!held || !!heldMoth,
    // Every sprite moves on to whatever it does next (for the tests).
    stir() { for (const d of diggers) { d.until = 0; next(d); } },
    get: () => now,
    setShown(on) { shown = !!on; crew(); },
    setHidden(list) { hidden = new Set(Array.isArray(list) ? list : []); crew(); },
    // "The sprites gathered 12 souls." for the away report, or '' for nothing.
    report(dug) {
      if (!(dug >= 1)) return '';
      return 'The garden gathered ' + souls(dug) + '.';
    }
  };
}
