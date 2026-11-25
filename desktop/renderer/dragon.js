// The reaper's dragon on the page: the egg in the garden, the dragon that
// follows him about, and its card (growing, training, ascension). The rules
// are in ../dragon.js and live in the garden's state; this draws what the
// garden is told, and asks it to act.
import { el, chip } from './dom.js';

// On-screen size of each stage (its pixel art at twice the size).
// (Frames of 40x38, 46x46, 64x56 and 78x66 art pixels, from hatchling to elder.)
const SIZE = {
  egg: [40, 48], hatchling: [80, 76], drake: [92, 92], wyvern: [128, 112], elder: [156, 132], ancient: [156, 132]
};
const NAMES = { ember: 'Ember', frost: 'Frost', shadow: 'Shadow', storm: 'Storm' };
const BRANCH = { hunter: 'Hunter: breathes on ghosts in hunts', guardian: 'Guardian: the garden grows faster', trickster: 'Trickster: its play is worth souls' };
const TRAIN = [['hunt', 'Hunt'], ['garden', 'Garden'], ['tricks', 'Tricks']];
const rand = (a, b) => a + Math.random() * (b - a);

export function createDragon(ctx) {
  const { companion, card, say, field, sound } = ctx;
  const owner = {};
  let now = null;           // the garden's view of the dragon, or null
  let node = null;
  let shown = '';           // what the node is drawn as: '<stage>-<element>'
  let x = innerWidth * 0.72;
  let y = innerHeight - 60;
  let mode = 'follow';
  let until = 0;

  // --- What the garden says it is ---------------------------------------------
  async function act(what) {
    const out = await companion.crypt({ dragon: what });
    if (out.crypt) ctx.crypt.update(out.crypt, { gained: out.gained });
    return out;
  }

  function update(view) {
    const before = now;
    now = view || null;
    draw();
    if (card.isOpen(owner)) paint();
    if (!before || !now) return;
    if (before.stage === 'egg' && now.stage !== 'egg') {
      sound.bell();
      say('The egg hatched.\nA ' + NAMES[now.element].toLowerCase() + ' hatchling.', 5000);
    } else if (before.stage !== now.stage && now.stage !== 'egg') {
      sound.bell();
      say('Your dragon grew: ' + now.stage + '.' + (now.stage === 'wyvern' && now.branch ? '\n' + BRANCH[now.branch].split(':')[0] + '.' : ''), 5000);
    }
  }

  // --- On screen -----------------------------------------------------------------
  function place(seconds = 0) {
    const [w, h] = SIZE[now.stage];
    x = Math.max(4, Math.min(innerWidth - w - 4, x));
    y = Math.max(4, Math.min(innerHeight - h, y));
    node.style.transitionDuration = seconds.toFixed(2) + 's';
    node.style.left = Math.round(x) + 'px';
    node.style.top = Math.round(y) + 'px';
  }

  function draw() {
    if (!now) {
      if (node) { node.remove(); node = null; shown = ''; }
      return;
    }
    const look = now.stage + '-' + now.element;
    if (!node) {
      node = el('div', 'dragon hit');
      // A click pets it; pressed and dragged, it is carried. Dropped on a
      // snail, it eats it.
      node.addEventListener('pointerdown', grab);
      node.addEventListener('pointermove', carry);
      node.addEventListener('pointerup', drop);
      node.addEventListener('pointercancel', drop);
      node.addEventListener('dblclick', (e) => { e.stopPropagation(); open(); });
      field.appendChild(node);
    }
    if (look !== shown) {
      shown = look;
      const [w, h] = SIZE[now.stage];
      node.style.width = w + 'px';
      node.style.height = h + 'px';
      node.style.backgroundImage = "url('../assets/dragon-" + now.stage.replace('ancient', 'elder') + '-' + now.element + ".png')";
      node.style.backgroundSize = (w * 4) + 'px ' + h + 'px';
      node.style.setProperty('--sheet-w', (w * 4) + 'px');
      node.className = 'dragon hit is-' + now.stage + ' is-' + now.element + (now.aura ? ' has-aura-' + now.aura : '');
      if (now.stage === 'egg') {
        // The egg rests in the garden.
        x = innerWidth * 0.72;
        y = innerHeight - h;
      }
      place(0);
    }
    node.classList.toggle('is-cracking', now.stage === 'egg' && now.warmth >= 70);
    node.title = now.stage === 'egg'
      ? 'A ' + NAMES[now.element].toLowerCase() + ' egg, ' + now.warmth + '% warm. Click it to warm it; double-click for its card.'
      : 'Your ' + NAMES[now.element].toLowerCase() + ' ' + now.stage + '. Click to pet; double-click for its card.';
  }

  // --- Carrying it -----------------------------------------------------------------
  let held = null; // { id, offX, offY, startX, startY, moved }
  function grab(e) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const r = node.getBoundingClientRect();
    held = { id: e.pointerId, offX: e.clientX - r.left, offY: e.clientY - r.top, startX: e.clientX, startY: e.clientY, moved: false };
    try { node.setPointerCapture(e.pointerId); } catch {}
  }
  function carry(e) {
    if (!held || e.pointerId !== held.id) return;
    if (!held.moved && Math.hypot(e.clientX - held.startX, e.clientY - held.startY) < 6) return;
    // Eggs are rubbed, not carried.
    if (now.stage === 'egg') return;
    held.moved = true;
    mode = 'held';
    node.classList.add('is-held');
    node.classList.remove('is-napping');
    x = e.clientX - held.offX;
    y = e.clientY - held.offY;
    place(0);
    ctx.crypt.snailUnder(node.getBoundingClientRect());
  }
  async function drop(e) {
    if (!held || e.pointerId !== held.id) return;
    const was = held;
    held = null;
    try { node.releasePointerCapture(e.pointerId); } catch {}
    if (!was.moved) return petted(e);
    node.classList.remove('is-held');
    const snail = ctx.crypt.snailUnder(node.getBoundingClientRect());
    ctx.crypt.snailUnder(null);
    // Down to the ground, then back to following him a while later.
    const [, h] = SIZE[now.stage];
    y = innerHeight - h;
    place(0.35);
    mode = 'stare';
    until = performance.now() + 6000;
    if (snail < 0) return;
    const out = await act({ snail });
    if (!out.ok) return say(out.error, 3000);
    sound.bell();
    say(['Crunch.', 'Its favourite. It will not stop purring.', 'Gone in one bite.'][Math.floor(Math.random() * 3)], 3000);
  }

  async function petted(e) {
    const out = await act({ pet: true });
    const r = node.getBoundingClientRect();
    for (let k = 0; k < (out.ok ? 3 : 1); k++) {
      const p = el('div', 'dragon-heart', now && now.stage === 'egg' ? '✦' : '♥');
      p.style.left = Math.round((e ? e.clientX : r.left + r.width / 2) + rand(-10, 10)) + 'px';
      p.style.top = Math.round(r.top + rand(0, 10)) + 'px';
      field.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
    if (out.ok && out.gained) ctx.pop('+' + out.gained, 'is-souls');
  }

  // Where it goes: after the reaper, a little behind him; now and then off to
  // nap by the garden or to perch at the top of the screen.
  function wander() {
    if (!now || now.stage === 'egg' || document.hidden || mode === 'drill' || mode === 'held') return;
    const t = performance.now();
    const [w, h] = SIZE[now.stage];
    if (t < until && mode !== 'follow') return;
    const roll = Math.random();
    // Now and then it goes and stares, hungrily, at a snail.
    const snail = ctx.crypt.workerBox && ctx.crypt.workerBox('snail');
    if (mode === 'follow' && t >= until && snail && roll < 0.12) {
      mode = 'stare';
      until = t + rand(8000, 15000);
      x = snail.left + (snail.left > innerWidth / 2 ? -w - 6 : snail.width + 6);
      y = innerHeight - h;
      node.classList.toggle('is-right', x < snail.left);
      place(2);
      return;
    }
    if (mode === 'follow' && t >= until && roll < 0.25) {
      mode = roll < 0.15 ? 'nap' : 'perch';
      until = t + rand(20000, 50000);
      x = mode === 'nap' ? rand(40, innerWidth - w - 40) : rand(40, innerWidth - w - 40);
      y = mode === 'nap' ? innerHeight - h : 0;
      node.classList.toggle('is-napping', mode === 'nap');
      place(2.5);
      return;
    }
    if (mode !== 'follow') {
      mode = 'follow';
      until = t + rand(15000, 40000);
      node.classList.remove('is-napping');
    }
    const c = ctx.center();
    const side = c.x > innerWidth / 2 ? -1 : 1;
    const tx = c.x + side * (60 + w / 2) - w / 2;
    const ty = c.y - h / 2 + 20;
    const dist = Math.hypot(tx - x, ty - y);
    if (dist > 30) {
      node.classList.toggle('is-right', tx > x);
      x = tx;
      y = ty;
      place(Math.min(2.2, dist / 300 + 0.9));
    }
  }
  setInterval(wander, 900);

  // --- In a hunt -------------------------------------------------------------------
  // A hunter breathes on a ghost: a burst of its element from its mouth to it.
  // Each element breathes its own way: Ember a stream of fire and embers,
  // Frost a spray of ice shards, Shadow rolling smoke, Storm a lightning bolt.
  function breathe(tx, ty) {
    if (!node) return;
    const r = node.getBoundingClientRect();
    // Its art faces left; turned (is-right), its mouth is on the right.
    const fx = node.classList.contains('is-right') ? r.right - 10 : r.left + 10;
    const fy = r.top + r.height * 0.3;
    const len = Math.hypot(tx - fx, ty - fy);
    const along = (t) => ({ x: fx + (tx - fx) * t, y: fy + (ty - fy) * t });
    const bit = (cls, t, life, style = {}) => {
      const p = along(t);
      const b = el('div', cls);
      b.style.left = Math.round(p.x) + 'px';
      b.style.top = Math.round(p.y) + 'px';
      Object.assign(b.style, style);
      field.appendChild(b);
      setTimeout(() => b.remove(), life);
    };
    if (now.element === 'storm') {
      // A jagged bolt, drawn as a line that jumps about the straight path.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'breath-bolt');
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const p = along(i / 8);
        const n = i === 0 || i === 8 ? 0 : rand(-14, 14);
        const nx = -(ty - fy) / (len || 1), ny = (tx - fx) / (len || 1);
        pts.push((p.x + nx * n).toFixed(1) + ',' + (p.y + ny * n).toFixed(1));
      }
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.setAttribute('points', pts.join(' '));
      svg.appendChild(line);
      field.appendChild(svg);
      setTimeout(() => svg.remove(), 380);
      return;
    }
    const beam = el('div', 'dragon-breath is-' + now.element);
    beam.style.left = fx + 'px';
    beam.style.top = fy + 'px';
    beam.style.width = len + 'px';
    beam.style.rotate = Math.atan2(ty - fy, tx - fx) + 'rad';
    field.appendChild(beam);
    setTimeout(() => beam.remove(), 450);
    if (now.element === 'ember') for (let i = 0; i < 9; i++) bit('breath-ember', rand(0.2, 1), 900, { '--dx': Math.round(rand(-14, 14)) + 'px' });
    if (now.element === 'frost') for (let i = 0; i < 7; i++) bit('breath-shard', rand(0.25, 1), 700, { rotate: Math.round(rand(0, 360)) + 'deg' });
    if (now.element === 'shadow') for (let i = 0; i < 6; i++) bit('breath-smoke', rand(0.2, 1), 1000);
  }

  // Dragonbreath (a ring ability): it breathes right across the screen.
  function breathAcross() {
    if (!node) return;
    const r = node.getBoundingClientRect();
    const right = r.left < innerWidth / 2;
    node.classList.toggle('is-right', right);
    for (let i = 0; i < 4; i++) setTimeout(() => breathe(right ? innerWidth - 20 : 20, r.top + r.height * 0.3 + (i - 1.5) * 50), i * 120);
  }
  // A dive at a wraith (the Lore perk): it swoops through it.
  function dive(tx, ty) {
    if (!node) return Promise.resolve();
    const from = { x, y };
    x = tx - SIZE[now.stage][0] / 2;
    y = ty - SIZE[now.stage][1] / 2;
    place(0.35);
    return new Promise((resolve) => setTimeout(() => { x = from.x; y = from.y; place(0.6); resolve(); }, 380));
  }

  // Fireworks (the Lore perk, for a finished hourglass): bursts of its element above it.
  function fireworks() {
    if (!node) return;
    const r = node.getBoundingClientRect();
    for (let k = 0; k < 4; k++) {
      setTimeout(() => {
        const cx = r.left + r.width / 2 + rand(-120, 120);
        const cy = Math.max(40, r.top - rand(60, 180));
        for (let i = 0; i < 12; i++) {
          const spark = el('div', 'dragon-spark is-' + now.element);
          spark.style.left = cx + 'px';
          spark.style.top = cy + 'px';
          const a = (i / 12) * Math.PI * 2;
          spark.style.setProperty('--dx', Math.round(Math.cos(a) * rand(30, 60)) + 'px');
          spark.style.setProperty('--dy', Math.round(Math.sin(a) * rand(30, 60)) + 'px');
          field.appendChild(spark);
          setTimeout(() => spark.remove(), 1100);
        }
      }, k * 350);
    }
  }

  // --- Training you play ------------------------------------------------------------
  // Each kind of training is a little game; how well it went is the quality the
  // rules weigh it by (a better drill, more growth).
  let drilling = false;
  let heldBall = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const spot = (pad = 80) => ({ x: rand(pad, innerWidth - pad), y: rand(pad, innerHeight - pad - 80) });

  // Hunt: lights appear about the screen; click one and it breathes on it.
  async function targetPractice() {
    const n = 6;
    let hit = 0;
    say('Target practice.\nClick the lights.', 3000);
    for (let i = 0; i < n; i++) {
      const p = spot();
      const orb = el('div', 'drill-orb hit');
      orb.style.left = Math.round(p.x - 14) + 'px';
      orb.style.top = Math.round(p.y - 14) + 'px';
      orb.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (orb.classList.contains('is-popped')) return;
        hit += 1;
        breathe(p.x, p.y);
        orb.classList.add('is-popped');
        setTimeout(() => orb.remove(), 400);
      });
      field.appendChild(orb);
      setTimeout(() => orb.isConnected && !orb.classList.contains('is-popped') && orb.remove(), 3200);
      await wait(900);
    }
    await wait(3000);
    return hit / n;
  }

  // Garden: it follows your cursor for a while; fly it through the rings.
  async function flightLesson() {
    const rings = Array.from({ length: 4 }, () => {
      const p = spot(110);
      const ring = el('div', 'drill-ring');
      ring.style.left = Math.round(p.x - 30) + 'px';
      ring.style.top = Math.round(p.y - 30) + 'px';
      field.appendChild(ring);
      return { ...p, ring, passed: false };
    });
    say('Flight lesson.\nLead it through the rings with your cursor.', 3500);
    const [w, h] = SIZE[now.stage];
    const end = performance.now() + 11000;
    while (performance.now() < end && rings.some((r) => !r.passed)) {
      const c = ctx.cursor;
      if (c && c.x > -999) {
        node.classList.toggle('is-right', c.x > x + w / 2);
        x = c.x - w / 2;
        y = c.y - h / 2;
        place(0.12);
      }
      for (const r of rings) {
        if (!r.passed && Math.hypot(x + w / 2 - r.x, y + h / 2 - r.y) < 40) {
          r.passed = true;
          r.ring.classList.add('is-passed');
        }
      }
      await wait(60);
    }
    rings.forEach((r) => setTimeout(() => r.ring.remove(), 300));
    return rings.filter((r) => r.passed).length / rings.length;
  }

  // Tricks: fetch. Throw the ball (drag it and let go); it brings it back.
  async function fetchGame() {
    const throws = 3;
    let distance = 0;
    say('Fetch.\nThrow the ball: drag it, and let go.', 3500);
    for (let k = 0; k < throws; k++) {
      const [w, h] = SIZE[now.stage];
      const ball = el('div', 'drill-ball hit');
      let bx = Math.min(innerWidth - 40, x + w + 10);
      let by = Math.max(10, y + h / 2);
      const put = () => { ball.style.left = Math.round(bx) + 'px'; ball.style.top = Math.round(by) + 'px'; };
      put();
      field.appendChild(ball);
      // Wait for a throw: a drag and a let-go, or give up after a while.
      const thrown = await new Promise((resolve) => {
        const trail = [];
        const give = setTimeout(() => resolve(null), 9000);
        ball.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          heldBall = ball;
          try { ball.setPointerCapture(e.pointerId); } catch {}
        });
        ball.addEventListener('pointermove', (e) => {
          if (heldBall !== ball) return;
          bx = e.clientX - 12; by = e.clientY - 12; put();
          trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
          if (trail.length > 6) trail.shift();
        });
        ball.addEventListener('pointerup', () => {
          if (heldBall !== ball) return;
          heldBall = null;
          clearTimeout(give);
          const a = trail[0] || { x: bx, y: by, t: 0 }, b = trail[trail.length - 1] || a;
          const dt = Math.max(16, b.t - a.t);
          resolve({ vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt });
        });
      });
      if (!thrown) { ball.remove(); continue; }
      // It flies, slowing, bouncing off the edges.
      const from = { x: bx, y: by };
      let { vx, vy } = thrown;
      for (let i = 0; i < 40 && Math.hypot(vx, vy) > 0.05; i++) {
        bx += vx * 16; by += vy * 16;
        if (bx < 0 || bx > innerWidth - 24) vx = -vx;
        if (by < 0 || by > innerHeight - 24) vy = -vy;
        bx = Math.max(0, Math.min(innerWidth - 24, bx)); by = Math.max(0, Math.min(innerHeight - 24, by));
        vx *= 0.9; vy *= 0.9;
        put();
        await wait(16);
      }
      distance += Math.hypot(bx - from.x, by - from.y);
      // After it! It catches it and brings it back.
      node.classList.toggle('is-right', bx > x);
      x = bx - w / 2; y = by - h / 2;
      place(0.5);
      await wait(550);
      ball.remove();
      await wait(250);
    }
    return Math.min(1, distance / 1500);
  }

  const DRILLS = { hunt: targetPractice, garden: flightLesson, tricks: fetchGame };
  async function drill(kind) {
    if (drilling || !now || now.stage === 'egg') return { ok: false, error: 'Not now.' };
    if (!now.canTrain) { say('It is tired. Let it rest a while.', 3000); return { ok: false, error: 'tired' }; }
    drilling = true;
    card.close(owner);
    mode = 'drill';
    node.classList.remove('is-napping');
    let quality = 0;
    try {
      quality = await DRILLS[kind]();
    } finally {
      drilling = false;
      heldBall = null;
      mode = 'follow';
    }
    const out = await act({ train: kind, quality });
    if (out.ok) {
      sound.bell();
      const words = quality >= 0.9 ? 'Flawless.' : quality >= 0.5 ? 'Good.' : quality > 0 ? 'It will learn.' : 'It watched you, mostly.';
      say(words + '\n+' + out.gained + ' growth.', 3500);
    } else {
      say(out.error, 3000);
    }
    return out;
  }

  // --- Its card ---------------------------------------------------------------------
  // Two tabs: Care (how it is, feeding, training) and Ascend (ascension and
  // the perks scales buy). The longer words are in tooltips, to keep it small.
  const box = el('div', 'dragon-card');
  const head = el('h2', null, 'DRAGON');
  const close = el('button', 'card-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => card.close(owner));
  head.appendChild(close);
  let tab = 'care';
  const tabs = el('div', 'row crypt-tabs');
  const tabChips = [['care', 'Care'], ['ascend', 'Ascend']].map(([id, label]) => {
    const c = chip(label, () => { tab = id; paint(); });
    c.dataset.tab = id;
    tabs.appendChild(c);
    return c;
  });
  const page = el('div', 'dragon-page');
  box.append(head, tabs, page);

  const meter = (label, value, max, kind, tip) => {
    const row = el('div', 'dragon-meter');
    const bar = el('div', 'dragon-bar ' + (kind || ''));
    const fill = el('span');
    fill.style.width = Math.max(0, Math.min(100, value / max * 100)).toFixed(1) + '%';
    bar.appendChild(fill);
    row.append(el('b', null, label), bar);
    if (tip) row.title = tip;
    return row;
  };
  const tipped = (c, tip) => { c.title = tip; return c; };

  function carePage(d) {
    if (d.stage === 'egg') {
      page.append(meter('Warmth', d.warmth, 100, 'is-warm'),
        el('p', 'muted', 'It warms slowly on its own. Click it in the garden to warm it; every finished hourglass warms it more.'));
      return;
    }
    const ap = d.appetite;
    const meters = el('div', 'dragon-meters');
    meters.append(
      meter(d.nextAt ? 'Growth' : 'Grown', d.nextAt ? d.xp : 1, d.nextAt || 1, 'is-xp', d.nextAt ? d.xp + ' of ' + d.nextAt + ' to grow' : 'Fully grown'),
      meter('Bond', d.bond, 100, 'is-bond', 'Bond ' + d.bond + ': care makes it grow faster; it fades if left alone for days'),
      meter('Energy', d.energy, 100, 'is-energy', 'Energy ' + d.energy + ': a drill takes 25, and it comes back with time'),
      meter(ap.left ? 'Hunger' : 'Full', ap.left, ap.of, 'is-hunger', ap.left ? 'It can eat ' + ap.left + ' more growth today (ghosts from hunts fill half)' : 'Full till tomorrow'));
    page.appendChild(meters);
    if (!d.branch) page.appendChild(el('p', 'muted dragon-hint', 'What you train it in most picks its path when it becomes a wyvern.'));

    const feed = el('div', 'row dragon-row');
    feed.appendChild(el('span', 'muted', 'Feed'));
    if (ap.left) {
      const bite = Math.min(10, ap.left);
      const ate = (o) => (o.ok ? say(o.full ? 'It is full.' : 'Nom.', 2000) : say(o.error, 3000));
      const b = tipped(chip('Bite · ' + bite * ap.souls, () => act({ feed: bite * ap.souls }).then(ate)), 'A bite: ' + bite * ap.souls + ' souls');
      b.dataset.feed = 'bite';
      feed.appendChild(b);
      if (ap.left > bite) {
        const f = tipped(chip('Fill · ' + ap.left * ap.souls, () => act({ feed: ap.left * ap.souls }).then(ate)), 'Fill it up: ' + ap.left * ap.souls + ' souls');
        f.dataset.feed = 'fill';
        feed.appendChild(f);
      }
    } else {
      feed.appendChild(el('span', 'muted', 'full till tomorrow'));
    }
    // Its favourite food: a snail from the garden, once a day.
    const snails = ((ctx.crypt.get().kinds || []).find((k) => k.id === 'snail') || { count: 0 }).count;
    if (snails) {
      const treat = tipped(chip(d.snailToday ? 'Snail ♥' : 'Had its snail', async () => {
        const o = await act({ snail: true });
        if (!o.ok) return say(o.error, 3000);
        sound.bell();
        say(['Crunch.', 'Its favourite. It will not stop purring.', 'Gone in one bite.'][Math.floor(Math.random() * 3)], 3000);
      }, d.snailToday ? 'solid' : undefined), d.snailToday
        ? 'Its favourite food, once a day: one of your ' + snails + ' snails. Worth more than a day of meals.'
        : 'It has had its snail today. Tomorrow.');
      treat.dataset.feed = 'snail';
      treat.disabled = !d.snailToday;
      feed.appendChild(treat);
    }
    const train = el('div', 'row dragon-row');
    train.append(el('span', 'muted', 'Train'), ...TRAIN.map(([k, label]) => {
      const c = tipped(chip(label + ' · ' + d.train[k], () => drill(k)), { hunt: 'Target practice: click the lights', garden: 'A flight lesson: lead it through the rings', tricks: 'Fetch: throw the ball' }[k]);
      c.dataset.train = k;
      c.disabled = !d.canTrain;
      return c;
    }));
    page.append(feed, train);
  }

  function ascendPage(d) {
    const asc = el('div', 'dragon-ascend');
    if (d.ascend.scales) {
      const go = tipped(chip('Ascend · +' + d.ascend.scales + ' scales', async () => {
        const out = await act({ ascend: true });
        if (out.ok) { sound.bell(); say('It ascends.\nA new egg: ' + NAMES[out.element].toLowerCase() + '. Lineage ' + (out.lineage + 1) + '.', 6000); }
      }, 'solid'), 'It returns as an egg of a new element, a lineage higher, and leaves Dragon Scales, which you keep');
      asc.append(el('p', 'muted', 'Ready to ascend.'), go);
    } else {
      asc.appendChild(el('p', 'muted', d.stage === 'egg' ? 'An elder, grown and loved, can ascend.' : d.ascend.why));
    }
    page.append(asc, el('p', 'dragon-scales', 'Dragon Scales: ' + d.scales));
    for (const p of d.perks) {
      const item = el('div', 'crypt-item dragon-perk');
      item.title = p.blurb;
      const text = el('div');
      text.append(el('b', null, p.name + ' ' + p.level + '/' + p.max), el('span', 'muted', p.now));
      const get = chip(p.cost === null ? 'Done' : String(p.cost), () => act({ perk: p.id }).then((o) => (o.ok ? sound.bell() : say(o.error, 3000))), 'solid');
      get.dataset.perk = p.id;
      get.disabled = p.cost === null || d.scales < p.cost;
      item.append(text, get);
      page.appendChild(item);
    }
  }

  function paint() {
    page.replaceChildren();
    tabs.hidden = !now;
    if (!now) {
      const row = el('div', 'row end');
      row.appendChild(chip('Take the egg', async () => {
        const out = await act({ adopt: true });
        if (out.ok) { sound.bell(); say('An egg. ' + NAMES[out.adopted] + ', by the look of it.', 4000); }
      }, 'solid'));
      page.append(el('p', 'muted', 'An egg has turned up in the garden, warm to the touch. Take it, keep it warm, and it will hatch: a dragon, to raise and train.'), row);
      card.refit();
      return;
    }
    const d = now;
    tabChips.forEach((c) => c.classList.toggle('is-on', c.dataset.tab === tab));
    const path = d.branch ? ' · ' + d.branch : '';
    page.appendChild(el('p', 'dragon-title', NAMES[d.element] + ' ' + d.stage + path + (d.lineage ? ' · line ' + (d.lineage + 1) : '')));
    if (d.branch && tab === 'care') page.lastChild.title = BRANCH[d.branch];
    if (tab === 'ascend') ascendPage(d);
    else carePage(d);
    card.refit();
  }

  // Its own ring (opened from Dragon on his ring): what you do with it most,
  // one click each. `note` is the small line under a name; `off` greys it
  // out, with why in its tooltip.
  function ringItems() {
    const d = now;
    if (!d) return [];
    const item = (id, name, blurb, run, note = '', off = false) => ({ id: 'dragon-' + id, name, blurb, run, note, off, school: 'spirit' });
    const items = [item('card', 'Card', 'Its card: how it is, feeding, training, ascension and perks.', () => open('care'), 'all of it')];
    if (d.stage === 'egg') {
      items.push(item('pet', 'Warm it', 'Rub the egg to warm it (a little a day).', () => petted(), d.warmth + '% warm'));
      return items;
    }
    items.push(item('pet', 'Pet', 'A scratch: bond, and a little growth.', () => petted(), 'bond ' + d.bond));
    const ap = d.appetite;
    const bite = Math.min(10, ap.left);
    items.push(item('feed', 'Bite', ap.left ? 'A bite: ' + bite * ap.souls + ' souls.' : 'It is full till tomorrow.',
      () => act({ feed: bite * ap.souls }).then((o) => say(o.ok ? (o.full ? 'It is full.' : 'Nom.') : o.error, 2500)),
      ap.left ? bite * ap.souls + ' souls' : 'full', !ap.left));
    const snails = ((ctx.crypt.get().kinds || []).find((k) => k.id === 'snail') || { count: 0 }).count;
    if (snails && d.snailToday) {
      items.push(item('snail', 'Snail ♥', 'Its favourite, once a day: one of your snails.', () => act({ snail: true }).then((o) => {
        if (!o.ok) return say(o.error, 3000);
        sound.bell();
        say('Crunch. Its favourite.', 2500);
      }), snails + ' in the garden'));
    }
    const tired = d.canTrain ? '' : 'Too tired: energy comes back with time.';
    items.push(item('hunt', 'Hunt', tired || 'Target practice: click the lights.', () => drill('hunt'), 'drill · ' + d.train.hunt, !d.canTrain));
    items.push(item('garden', 'Flight', tired || 'A flight lesson: lead it through the rings.', () => drill('garden'), 'drill · ' + d.train.garden, !d.canTrain));
    items.push(item('tricks', 'Fetch', tired || 'Fetch: throw the ball.', () => drill('tricks'), 'drill · ' + d.train.tricks, !d.canTrain));
    if (d.ascend.scales) items.push(item('ascend', 'Ascend', 'Ready to ascend: +' + d.ascend.scales + ' scales.', () => open('ascend'), '+' + d.ascend.scales + ' scales'));
    return items;
  }

  function open(which) {
    if (which === 'care' || which === 'ascend') tab = which;
    paint();
    card.open(box, 'spirit', owner);
  }

  return {
    update,
    open,
    close() { card.close(owner); },
    isOpen: () => card.isOpen(owner),
    get: () => now,
    breathe,
    breathAcross,
    dive,
    fireworks,
    drill,
    ringItems,
    // The fetch ball is in the hand: the window keeps the mouse till it is let go.
    holding: () => !!heldBall || !!held,
    // How many ghosts a hunter breathes on in a hunt; the Lore perk's level.
    breaths: () => (now ? now.breaths : 0),
    lore: () => (now ? (now.perks.find((p) => p.id === 'tricks') || { level: 0 }).level : 0),
    // Where it is, for a breath or a dive to start from.
    box: () => (node ? node.getBoundingClientRect() : null)
  };
}
