// Every ability in the ring: what it costs, what it does, and how Speak's tools
// reach the same things.
import { el, chip } from './dom.js';
import * as effects from './effects.js';

// A ghost's size on screen; its look and swim are a sprite sheet in style.css.
const GHOST_W = 54;
const GHOST_H = 48;
const GHOST_LOOP_S = 1.6;

// How fast hunted ghosts drift (1 is the base pace).
const HUNT = { pace: 1 };
const VANISH_MS = 30 * 60000;

function cardHead(title, onClose) {
  const h = el('h2', null, title);
  const x = el('button', 'card-x', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.addEventListener('click', onClose);
  h.appendChild(x);
  return h;
}

const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function createAbilities(ctx) {
  const { say, soul, cursor, field, card, sound, companion, minutesText } = ctx;
  const sand = document.getElementById('sand');
  const huntRing = document.getElementById('huntRing');

  // --- Hourglass: a focus timer -----------------------------------------------------
  let glass = null; // { ends, total }

  function paintGlass() {
    sand.toggleAttribute('hidden', !glass); // an SVG element has no .hidden property
    if (glass) sand.style.setProperty('--left', Math.max(0, ((glass.ends - Date.now()) / glass.total) * 100).toFixed(2));
  }

  function startGlass(minutes, rest = false) {
    glass = { ends: Date.now() + minutes * 60000, total: minutes * 60000, rest };
    companion.save({ hourglass: glass });
    paintGlass();
  }

  function stopGlass() {
    glass = null;
    companion.save({ hourglass: null });
    paintGlass();
  }

  function finishGlass() {
    const minutes = Math.round(glass.total / 60000);
    const wasBreak = !!glass.rest;
    stopGlass();
    sound.bell();
    if (wasBreak) {
      companion.notify('The break is over.', 'Back to it. The dead wait for no one.');
      say('Break’s over.', 6000);
      return;
    }
    companion.notify('The sand has run out.', minutesText(minutes) + ' done. Stand up. Stretch. You are not dead yet.');
    companion.stat('focus', 1, minutes);
    // A card the user is using is left alone; the bubble and bell are enough.
    if (card.isOpen()) {
      say('Sand’s out.\nStand. Stretch.', 9000);
      return;
    }
    // After a focus run: a short break, the same again, or nothing.
    const box = el('div');
    box.append(cardHead('SAND’S OUT', () => card.close(glassOwner)), el('p', null, minutesText(minutes) + ' done. Stand. Stretch.'));
    const row = el('div', 'row');
    row.append(
      chip('Break 5', () => { card.close(glassOwner); startGlass(5, true); say('Five minutes. Breathe.'); }, 'solid'),
      chip('Again', () => { card.close(glassOwner); startGlass(minutes); say(minutes + ' more. Go.'); }),
      chip('Done', () => card.close(glassOwner))
    );
    box.appendChild(row);
    card.open(box, 'time', glassOwner);
  }

  function glassCard() {
    const box = el('div');
    box.append(cardHead('HOURGLASS', () => card.close(glassOwner)), el('p', null, 'Turn it. I’ll ring when the sand runs out.'));
    const row = el('div', 'row');
    [5, 15, 25, 50].forEach((m) => row.appendChild(chip(m + ' min', () => {
      if (!soul.spend(abilities.hourglass.cost)) return say('Empty. Set me down to rest.');
      card.close(glassOwner);
      startGlass(m);
      say(m + ' minutes. Go.');
    })));
    box.appendChild(row);
    return box;
  }
  const glassOwner = {};

  // --- Raven: reminders ----------------------------------------------------------------
  let ravens = []; // { id, at, text }
  let flock = null;

  function saveRavens() {
    companion.save({ ravens });
  }

  function sendRaven(text, minutes) {
    const raven = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: Date.now() + minutes * 60000, text };
    ravens.push(raven);
    ravens.sort((a, b) => a.at - b.at);
    saveRavens();
    return raven;
  }

  function cancelRaven(id) {
    const before = ravens.length;
    ravens = ravens.filter((r) => r.id !== id);
    if (ravens.length !== before) saveRavens();
    return ravens.length !== before;
  }

  function flyRaven(raven) {
    if (!flock) {
      flock = el('div', 'flock');
      flock.setAttribute('role', 'status');
      field.appendChild(flock);
    }
    const note = el('div', 'raven-note hit');
    const bird = el('div', 'raven');
    bird.setAttribute('aria-hidden', 'true');
    note.appendChild(bird);
    const body = el('div', 'raven-card');
    body.append(el('small', null, 'A RAVEN · ' + clock(raven.at)), el('div', null, raven.text));
    const row = el('div', 'row');
    row.append(
      chip('Snooze 10', () => { note.remove(); sendRaven(raven.text, 10); }),
      chip('Done', () => note.remove(), 'solid')
    );
    body.appendChild(row);
    note.appendChild(body);
    flock.appendChild(note);
    sound.caught();
    companion.notify('A raven', raven.text);
  }

  function ravenCard() {
    const box = el('div');
    box.append(cardHead('RAVEN', () => card.close(ravenOwner)));
    const input = el('input');
    input.type = 'text';
    input.maxLength = 140;
    input.placeholder = 'Remind me to…';
    let minutes = 15;
    const row = el('div', 'row');
    const chips = [1, 5, 15, 30, 60].map((m) => {
      const c = chip(m < 60 ? m + ' min' : '1 hour', () => {
        minutes = m;
        chips.forEach((x) => x.classList.toggle('is-on', x === c));
      }, m === minutes ? 'is-on' : '');
      return c;
    });
    row.append(...chips);
    const send = chip('Send', submit, 'solid');
    send.disabled = true;
    const end = el('div', 'row end');
    end.appendChild(send);
    input.addEventListener('input', () => { send.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    function submit() {
      const text = input.value.trim();
      if (!text) return;
      if (!soul.spend(abilities.raven.cost)) return say('Empty. Set me down to rest.');
      const r = sendRaven(text, minutes);
      card.close(ravenOwner);
      say('The raven leaves.\nBack at ' + clock(r.at) + '.');
    }
    box.append(input, row, end);
    if (ravens.length) {
      box.appendChild(el('p', 'muted', 'Waiting to fly:'));
      ravens.slice(0, 4).forEach((r) => {
        const line = el('div', 'row');
        line.append(el('span', 'muted', clock(r.at) + ' · ' + r.text.slice(0, 40)), chip('×', () => { cancelRaven(r.id); line.remove(); }));
        box.appendChild(line);
      });
    }
    return box;
  }
  const ravenOwner = {};

  // --- Reaping and the hunt ---------------------------------------------------------------
  // Dropped on a skeleton, he reaps it: its ghosts (one, plus one for every hour
  // it dug, up to six) burst out and scatter. Each caught scores points, more in
  // a quick run (the combo), and banks souls; those that get away are lost.
  const COMBO_MS = 1200;
  const COMBO_MAX = 5;
  // Hunted things fly above him: ghosts burst out right where he stands.
  const huntLayer = el('div', 'hunt-layer');
  document.body.appendChild(huntLayer);
  let hunt = null;
  let best = 0;
  let scoreEl = null;

  function spawnGhost(from) {
    const golden = Math.random() < hunt.goldenChance;
    const g = el('div', 'ghost hit' + (golden ? ' is-golden' : ''));
    // Each starts at its own point in the swim, so they don't move in step.
    g.style.animationDelay = -(Math.random() * GHOST_LOOP_S).toFixed(2) + 's';
    // Out of the skeleton, upward and away, each its own way.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = (0.09 + Math.random() * 0.08) * HUNT.pace;
    const ghost = {
      node: g, golden,
      x: from.x - GHOST_W / 2, y: from.y - GHOST_H,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      phase: Math.random() * 6
    };
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      catchGhost(ghost);
    });
    huntLayer.appendChild(g);
    hunt.ghosts.push(ghost);
  }

  function paintScore() {
    scoreEl.textContent = 'SCORE ' + hunt.points + (hunt.combo > 1 ? '  ×' + hunt.combo : '');
  }

  function catchGhost(ghost) {
    if (!hunt || hunt.wraith || ghost.caught) return;
    ghost.caught = true;
    const now = performance.now();
    hunt.combo = now - hunt.lastCatch < COMBO_MS ? Math.min(COMBO_MAX, hunt.combo + 1) : 1;
    hunt.lastCatch = now;
    const points = (ghost.golden ? 3 : 1) * 10 * hunt.combo;
    hunt.points += points;
    hunt.caught += 1;
    if (ghost.golden) hunt.golden += 1;
    soul.gain(ghost.golden ? 8 : 3);
    sound.caught();
    popAt(ghost.x + GHOST_W / 2, ghost.y, '+' + points);
    ghost.node.classList.add('is-caught');
    setTimeout(() => ghost.node.remove(), 320);
    paintScore();
  }

  // A "+n" that floats up from a point on the screen.
  function popAt(x, y, text, kind = 'is-souls') {
    const pop = el('div', 'soul-pop ' + kind, text);
    pop.style.left = (x - 8) + 'px';
    pop.style.top = (y - 6) + 'px';
    huntLayer.appendChild(pop);
    setTimeout(() => pop.remove(), 900);
  }

  function drift(g, dt, now, w, h) {
    g.x += g.vx * dt;
    g.y += g.vy * dt + Math.sin(now / 300 + g.phase) * 0.3;
    if ((g.x < 0 && g.vx < 0) || (g.x > innerWidth - w && g.vx > 0)) g.vx = -g.vx;
    if ((g.y < 0 && g.vy < 0) || (g.y > innerHeight - h && g.vy > 0)) g.vy = -g.vy;
    const at = `translate(${Math.round(g.x)}px, ${Math.round(g.y)}px)`;
    g.node.style.transform = at;
    g.node.style.setProperty('--at', at);
  }

  function moveGhosts(now) {
    if (!hunt || hunt.wraith) return;
    const dt = Math.min(50, now - hunt.last);
    hunt.last = now;
    for (const g of hunt.ghosts) if (!g.caught) drift(g, dt, now, GHOST_W, GHOST_H);
    // A combo lapses when the next catch is too slow.
    if (hunt.combo > 1 && now - hunt.lastCatch > COMBO_MS) { hunt.combo = 1; paintScore(); }
    const left = hunt.ends - Date.now();
    huntRing.style.setProperty('--left', Math.max(0, left / hunt.length).toFixed(3));
    huntRing.classList.toggle('is-late', left < 3000);
    // Over when time runs out, or when every ghost has been caught.
    if (left <= 0 || hunt.ghosts.every((g) => g.caught)) return endHunt();
    requestAnimationFrame(moveGhosts);
  }

  // The hunt for `count` ghosts bursting out at `from`.
  function startHunt(count, from) {
    // Six seconds, and a second and a half for each ghost.
    const length = 6000 + 1500 * count;
    hunt = {
      ends: Date.now() + length, length,
      // One in ten golden, or more with the Crypt's ghost lure.
      goldenChance: (ctx.crypt && ctx.crypt.get().goldenChance) || 0.1,
      caught: 0, golden: 0, points: 0, combo: 1, lastCatch: -Infinity,
      ghosts: [], last: performance.now()
    };
    scoreEl = el('div', 'score', '');
    field.appendChild(scoreEl);
    huntRing.hidden = false;
    for (let i = 0; i < count; i++) spawnGhost(from);
    paintScore();
    requestAnimationFrame(moveGhosts);
  }

  async function endHunt() {
    const { caught, golden, points } = hunt;
    const lost = hunt.ghosts.filter((g) => !g.caught).length;
    hunt.ghosts.forEach((g) => { if (!g.caught) g.node.remove(); });
    hunt = null;
    huntRing.hidden = true;
    const board = scoreEl;
    setTimeout(() => board.remove(), 2500);
    // The crypt pays for what was caught and keeps the score.
    const out = await companion.crypt({ hunt: { caught, golden, points } });
    if (out && out.crypt && ctx.crypt) ctx.crypt.update(out.crypt, { gained: out.gained });
    const lines = [];
    if (points > best) {
      best = points;
      companion.save({ best });
      lines.push(points ? 'New best: ' + points + ' points.' : 'None. Shameful.');
    } else {
      lines.push(points + ' points. Best: ' + best + '.');
    }
    if (lost) lines.push(lost + (lost === 1 ? ' got away.' : ' got away.'));
    for (const r of (out && out.ranked) || []) lines.push('Rank: ' + r.name + '. +' + r.reward + ' souls.');
    if (out && out.ranked && out.ranked.length) sound.bell();
    say(lines.join('\n'), 6000);
  }

  // Dropped on the skeleton at `index` (among the crypt's): reap it.
  async function reapAt(index) {
    if (hunt) return { ok: false, error: 'Already hunting.' };
    const box = ctx.crypt.diggerBox(index);
    const out = await companion.crypt({ reap: index });
    if (out.crypt) ctx.crypt.update(out.crypt);
    if (!out.ok) {
      say(out.error, 3000);
      return out;
    }
    const from = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : ctx.center();
    ctx.swing();
    ctx.puff(from.x, from.y);
    sound.caught();
    say(out.ghosts === 1 ? 'One ghost. Catch it.' : out.ghosts + ' ghosts. Catch them.', 2500);
    startHunt(out.ghosts, from);
    return out;
  }

  // Slash during a hunt catches every ghost still loose, and wounds a wraith.
  function reapAll() {
    if (!hunt) return 0;
    if (hunt.wraith) { hitWraith(4); return 1; }
    const loose = hunt.ghosts.filter((g) => !g.caught);
    loose.forEach((g, i) => setTimeout(() => catchGhost(g), 80 + i * 50));
    return loose.length;
  }

  // --- Summon: raise the dead, and sometimes a wraith ---------------------------------------
  // Summon raises a skeleton for his own soul instead of banked souls. About one
  // time in four the grave holds a wraith instead: hit it 12 times in 20
  // seconds and it pays souls, and a skeleton rises anyway. Never more than four
  // summons in a row without one.
  const WRAITH_CHANCE = 0.25;
  const WRAITH_HP = 12;
  const WRAITH_MS = 20000;
  const WRAITH_W = 120;
  const WRAITH_H = 106;
  let sinceWraith = 0;

  async function summonDead() {
    const c = ctx.center();
    ctx.puff(c.x, c.y + 40);
    if (Math.random() < WRAITH_CHANCE || sinceWraith >= 4) {
      sinceWraith = 0;
      return startWraith();
    }
    sinceWraith += 1;
    const out = await companion.crypt({ summon: true });
    if (out.crypt) ctx.crypt.update(out.crypt);
    say(out.ok ? 'Rise.' : out.error, 2500);
    if (out.ok) sound.bell();
    return out;
  }

  function startWraith() {
    const c = ctx.center();
    const node = el('div', 'wraith hit');
    const w = {
      node, hp: WRAITH_HP,
      x: c.x - WRAITH_W / 2, y: Math.max(20, c.y - WRAITH_H - 40),
      vx: (Math.random() < 0.5 ? -1 : 1) * 0.16, vy: -0.08, phase: 0
    };
    node.addEventListener('pointerdown', (e) => { e.stopPropagation(); hitWraith(1); });
    huntLayer.appendChild(node);
    hunt = { wraith: w, ends: Date.now() + WRAITH_MS, length: WRAITH_MS, last: performance.now(), lastTurn: performance.now() };
    scoreEl = el('div', 'score is-wraith', '');
    field.appendChild(scoreEl);
    paintWraith();
    huntRing.hidden = false;
    sound.caught();
    say('A wraith!\nStrike it ' + WRAITH_HP + ' times.', 3000);
    requestAnimationFrame(moveWraith);
    return { ok: true, wraith: true };
  }

  function paintWraith() {
    scoreEl.textContent = 'WRAITH ' + '♥'.repeat(Math.max(0, hunt.wraith.hp));
  }

  function hitWraith(n) {
    if (!hunt || !hunt.wraith) return;
    const w = hunt.wraith;
    w.hp -= n;
    sound.caught();
    popAt(w.x + WRAITH_W / 2, w.y + 10, '−' + n, 'is-cost');
    w.node.classList.remove('is-hit');
    void w.node.offsetWidth;
    w.node.classList.add('is-hit');
    // Struck, it lurches away and speeds up a little.
    w.vx = -w.vx * 1.05;
    w.vy = (Math.random() - 0.5) * 0.3;
    if (w.hp <= 0) return endWraith(true);
    paintWraith();
  }

  function moveWraith(now) {
    if (!hunt || !hunt.wraith) return;
    const w = hunt.wraith;
    const dt = Math.min(50, now - hunt.last);
    hunt.last = now;
    // Now and then it veers.
    if (now - hunt.lastTurn > 1400) {
      hunt.lastTurn = now;
      w.vy = (Math.random() - 0.5) * 0.24;
      if (Math.random() < 0.4) w.vx = -w.vx;
    }
    drift(w, dt, now, WRAITH_W, WRAITH_H);
    const left = hunt.ends - Date.now();
    huntRing.style.setProperty('--left', Math.max(0, left / hunt.length).toFixed(3));
    huntRing.classList.toggle('is-late', left < 5000);
    if (left <= 0) return endWraith(false);
    requestAnimationFrame(moveWraith);
  }

  async function endWraith(won) {
    const w = hunt.wraith;
    hunt = null;
    huntRing.hidden = true;
    w.node.classList.add(won ? 'is-banished' : 'is-gone');
    setTimeout(() => w.node.remove(), 600);
    const board = scoreEl;
    setTimeout(() => board.remove(), 1500);
    const out = await companion.crypt({ wraith: { won } });
    if (out.crypt) ctx.crypt.update(out.crypt, { gained: out.gained });
    if (won) {
      sound.bell();
      say('Banished.\n+' + out.gained + ' souls' + (out.raised ? ', and a skeleton rises.' : '.'), 5000);
    } else {
      say('It got away.', 3000);
    }
    return out;
  }

  // --- Scythe Slash: the screen is cut in two for a moment ----------------------------------------
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  // A picture of the screen without the reaper and his effects in it.
  async function photograph(opts) {
    document.body.classList.add('is-capturing');
    try {
      await nextFrame();
      await nextFrame();
      return await companion.capture(opts);
    } finally {
      document.body.classList.remove('is-capturing');
    }
  }

  async function slash() {
    const shot = ctx.reducedMotion ? null : await photograph();
    sound.slash();
    ctx.swing();
    const parts = [];
    if (shot) {
      parts.push(el('div', 'slash-void'));
      for (const side of ['top', 'bottom']) {
        const half = el('div', 'slash-half ' + side);
        half.style.backgroundImage = `url("${shot}")`;
        parts.push(half);
      }
    }
    const line = el('div', 'slash-line');
    line.style.setProperty('--angle', Math.atan2(-0.32 * innerHeight, innerWidth) + 'rad');
    parts.push(line);
    // Behind the reaper, so he stays in front of his cut.
    field.prepend(...parts);
    setTimeout(() => parts.forEach((p) => p.remove()), 1350);
    const reaped = reapAll();
    return { cut: !!shot, reaped };
  }

  // --- Shatter, Glitch, Vortex, Burn, Melt, Soul Rip: one screen effect at a time --------------------
  let wrecking = false;

  // Where he was asked to strike: the cursor, or himself if it is elsewhere.
  const aim = () => (cursor.x > -999 ? { x: cursor.x, y: cursor.y } : ctx.center());

  const WRECKS = {
    shatter(shot) {
      sound.shatter();
      ctx.swing();
      const done = effects.shatter(field, shot, aim());
      reapAll();
      return done;
    },
    glitch(shot) {
      sound.glitch();
      return effects.glitch(field, shot);
    },
    vortex(shot) {
      sound.vortex();
      const done = effects.vortex(field, shot, aim());
      // Loose ghosts are pulled in with everything else.
      setTimeout(reapAll, 700);
      return done;
    },
    burn(shot) {
      sound.burn();
      return effects.burn(field, shot);
    },
    melt(shot) {
      sound.melt();
      return effects.melt(field, shot);
    },
    soulrip(shot) {
      sound.soulRip();
      const c = ctx.center();
      return effects.soulRip(field, shot, aim(), { x: c.x, y: c.y - 10 });
    }
  };

  // Resolves to 'seen' (on the real screen), 'blind' (no screen access: over
  // dark glass) or 'nogl' (this computer can't run the shader).
  async function wreck(kind) {
    wrecking = true;
    try {
      const shot = await photograph();
      const ran = await WRECKS[kind](shot);
      if (ran === false) return 'nogl';
      return shot ? 'seen' : 'blind';
    } finally {
      wrecking = false;
    }
  }

  // The ring entry for a screen effect: what he says when it's done.
  function wrecker(id, name, cost, school, blurb, done, blind) {
    return {
      id, name, cost, school, blurb,
      ready: wreckReady,
      cast: async () => {
        const how = await wreck(id);
        if (how === 'nogl') {
          soul.gain(cost);
          say('My magic fails here.\n(This computer can’t draw it.)', 5000);
        } else {
          say(how === 'seen' ? done : blind, how === 'seen' ? 2500 : 5000);
        }
      }
    };
  }

  function wreckReady() {
    if (ctx.reducedMotion) return 'Too much motion.\n(Reduce motion is on.)';
    return wrecking ? 'One ruin at a time.' : null;
  }

  // --- Vanish ---------------------------------------------------------------------------------
  let vanishTimer = null;

  function vanish() {
    ctx.vanish();
    if (ctx.getMode() !== 'vanish') return;
    clearTimeout(vanishTimer);
    vanishTimer = setTimeout(unvanish, VANISH_MS);
  }

  function unvanish() {
    clearTimeout(vanishTimer);
    if (ctx.getMode() !== 'vanish') return;
    ctx.unvanish();
    say('Back.');
  }

  // --- Harvest ------------------------------------------------------------------------------------
  async function harvest() {
    const s = await companion.state();
    const t = s.today || {};
    return {
      activeMinutes: Math.round((t.activeSec || 0) / 60),
      hourglasses: t.focus || 0,
      ghostsCaught: t.caught || 0,
      filesReaped: t.reaped || 0,
      bestHunt: best,
      soul: Math.round(soul.get()),
      hourglassMinutesLeft: glass ? Math.ceil((glass.ends - Date.now()) / 60000) : null,
      pendingReminders: ravens.length
    };
  }

  // --- The list -------------------------------------------------------------------------------
  const list = [
    {
      id: 'speak', name: 'Speak', cost: 0, school: 'voice', blurb: 'Ask him anything. He can set reminders and timers for you.',
      active: () => ctx.speak.isOpen(),
      stop: () => ctx.speak.close(),
      cast: () => ctx.speak.open()
    },
    {
      id: 'slash', name: 'Slash', cost: 20, school: 'death', blurb: 'Cut the screen in two. Only a picture is cut.',
      cast: async () => {
        const { cut } = await slash();
        say(cut ? 'Cut.' : 'Cut.\n(Give me screen access to cut deeper.)', cut ? 2500 : 5000);
      }
    },
    wrecker('shatter', 'Shatter', 25, 'death', 'The screen breaks like glass where your cursor is, falls away, and comes back together.',
      'Broken. Mended.', 'Broken.\n(Give me screen access to break the real thing.)'),
    wrecker('glitch', 'Glitch', 15, 'glitch', 'Y2K corruption: the screen tears, splits and stutters for a moment.',
      'Signal restored.', 'Static.\n(Give me screen access for the full effect.)'),
    wrecker('vortex', 'Vortex', 25, 'curse', 'A black hole opens at your cursor and swallows the screen, then spits it back.',
      'It always gives it back.', 'Swallowed.\n(Give me screen access to take the real thing.)'),
    wrecker('burn', 'Burn', 30, 'fire', 'The screen burns away from the edges like paper, then un-burns.',
      'Ashes to pixels.', 'Burned.\n(Give me screen access to burn the real thing.)'),
    wrecker('melt', 'Melt', 20, 'light', 'The screen drips down like hot wax, then snaps back.',
      'Set again.', 'Melted.\n(Give me screen access to melt the real thing.)'),
    wrecker('soulrip', 'Soul Rip', 20, 'spirit', 'He tears loose the patch of screen at your cursor and swallows it as a ghost.',
      'Delicious.', 'Swallowed a shadow.\n(Give me screen access for a real soul.)'),
    {
      id: 'summon', name: 'Summon', cost: 40, school: 'spirit', blurb: 'He raises a skeleton for his own soul. Sometimes the grave holds a wraith.',
      ready: () => (hunt ? 'Already hunting.' : null),
      cast: () => { summonDead(); }
    },
    {
      id: 'hourglass', name: 'Hourglass', cost: 10, school: 'time', blurb: 'A focus timer. He rings when the sand runs out.',
      active: () => !!glass,
      stop: () => { stopGlass(); say('Sand stopped.'); },
      // The card charges when a length is picked.
      free: true,
      cast: () => card.open(glassCard(), 'time', glassOwner)
    },
    {
      id: 'raven', name: 'Raven', cost: 5, school: 'message', blurb: 'A reminder, carried back to you later.',
      free: true,
      cast: () => card.open(ravenCard(), 'message', ravenOwner, { focus: true })
    },
    {
      id: 'crypt', name: 'Crypt', cost: 0, school: 'soul', blurb: 'Your banked souls, and the skeletons they raise.',
      free: true,
      active: () => ctx.crypt.isOpen(),
      stop: () => ctx.crypt.close(),
      cast: () => ctx.crypt.open()
    },
    {
      id: 'hum', name: 'Hum', cost: 5, school: 'music', blurb: 'An old tune from a music box.',
      active: () => sound.humming(),
      ready: () => (sound.isMuted() ? 'My voice is muted.\n(Tray → Sounds.)' : null),
      stop: () => { sound.stopHum(); say('Quiet.'); },
      cast: () => { sound.startHum(); say('Something old.', 2500); }
    },
    {
      id: 'vanish', name: 'Vanish', cost: 0, school: 'soul', blurb: 'He fades into the corner for half an hour. Click him to call him back.',
      active: () => ctx.getMode() === 'vanish',
      stop: unvanish,
      cast: () => {
        say('Call if you need me.', 1500);
        clearTimeout(vanishTimer);
        vanishTimer = setTimeout(vanish, 900);
      }
    }
  ];

  const byId = Object.fromEntries(list.map((a) => [a.id, a]));

  // Cast from the ring, the tray or Speak. A running ability stops for free.
  function cast(id) {
    const a = byId[id];
    if (!a) return { ok: false, error: 'No such ability.' };
    ctx.closeRing();
    if (a.active && a.active()) {
      a.stop();
      return { ok: true, result: 'stopped' };
    }
    const why = a.ready && a.ready();
    if (why) {
      say(why);
      return { ok: false, error: why };
    }
    if (!a.free && !soul.spend(a.cost)) {
      say('Empty. Set me down to rest.');
      return { ok: false, error: 'Not enough soul. Dragging the reaper and setting him down lets him rest.' };
    }
    a.cast();
    return { ok: true, result: 'cast' };
  }

  // Speak's tools. Inputs are checked here: they arrive as streamed JSON.
  const CASTABLE = ['slash', 'shatter', 'glitch', 'vortex', 'burn', 'melt', 'soulrip', 'summon', 'hum', 'vanish'];

  async function runTool(name, input) {
    switch (name) {
      case 'set_hourglass': {
        const m = input.minutes;
        if (!Number.isInteger(m) || m < 1 || m > 180) return { ok: false, error: 'minutes must be a whole number from 1 to 180' };
        startGlass(m);
        return { ok: true, result: { minutes: m, endsAt: clock(glass.ends) } };
      }
      case 'stop_hourglass': {
        const had = !!glass;
        if (had) stopGlass();
        return { ok: true, result: { stopped: had } };
      }
      case 'send_raven': {
        const text = typeof input.text === 'string' ? input.text.trim() : '';
        const m = input.minutes;
        if (!text || text.length > 280) return { ok: false, error: 'text must be 1 to 280 characters' };
        if (typeof m !== 'number' || !Number.isFinite(m) || m < 1 || m > 10080) return { ok: false, error: 'minutes must be from 1 to 10080' };
        const r = sendRaven(text, m);
        return { ok: true, result: { id: r.id, due: new Date(r.at).toLocaleString() } };
      }
      case 'list_ravens':
        return { ok: true, result: ravens.map((r) => ({ id: r.id, text: r.text, due: new Date(r.at).toLocaleString() })) };
      case 'cancel_raven': {
        if (typeof input.id !== 'string') return { ok: false, error: 'id must be a string' };
        return { ok: true, result: { cancelled: cancelRaven(input.id) } };
      }
      case 'cast': {
        if (!CASTABLE.includes(input.ability)) return { ok: false, error: 'ability must be one of ' + CASTABLE.join(', ') };
        return cast(input.ability);
      }
      case 'get_harvest':
        return { ok: true, result: await harvest() };
      case 'get_crypt': {
        const out = await companion.crypt();
        ctx.crypt.update(out.crypt);
        // Milestones as a count and what is next, not the whole list.
        const { milestones, goldenChance, ...rest } = out.crypt;
        return {
          ok: true,
          result: {
            ...rest, goldenChance,
            milestonesReached: milestones.filter((m) => m.done).length + ' of ' + milestones.length,
            nextMilestones: milestones.filter((m) => !m.done).slice(0, 3).map((m) => m.how + ' (+' + m.reward + ' souls)')
          }
        };
      }
      case 'buy_upgrade': {
        if (typeof input.upgrade !== 'string') return { ok: false, error: 'upgrade must be a string' };
        const out = await ctx.crypt.buy(input.upgrade);
        return out.ok ? { ok: true, result: { bought: out.name, level: out.level, souls: out.crypt.souls } } : { ok: false, error: out.error };
      }
      case 'raise_skeleton': {
        const count = input.count === undefined ? 1 : input.count;
        if (!Number.isInteger(count) || count < 1 || count > 50) return { ok: false, error: 'count must be a whole number from 1 to 50' };
        const out = await ctx.crypt.raise(count);
        return out.ok
          ? { ok: true, result: { raised: out.raised, souls: out.crypt.souls, skeletons: out.crypt.skeletons, perHour: out.crypt.perHour, nextCost: out.crypt.nextCost } }
          : { ok: false, error: out.error };
      }
      case 'look_at_screen': {
        if (!(await ctx.speak.ask('Let him look at your screen?'))) return { ok: false, error: 'The user said no.' };
        const shot = await photograph({ forModel: true });
        if (!shot) return { ok: false, error: 'Could not take a picture of the screen. On macOS the app needs Screen Recording permission.' };
        return { ok: true, result: { seen: 'the screen, attached' }, image: shot };
      }
      case 'read_clipboard': {
        if (!(await ctx.speak.ask('Let him read what you copied?'))) return { ok: false, error: 'The user said no.' };
        const text = await companion.clipboardRead();
        return { ok: true, result: text ? { text } : { text: '', note: 'The clipboard is empty or holds no text.' } };
      }
      case 'copy_to_clipboard': {
        if (typeof input.text !== 'string' || !input.text) return { ok: false, error: 'text must be a non-empty string' };
        companion.clipboardWrite(input.text);
        return { ok: true, result: { copied: input.text.length + ' characters' } };
      }
      default:
        return { ok: false, error: 'Unknown tool ' + name };
    }
  }

  // Once a second: the sand, and ravens that are due.
  setInterval(() => {
    if (glass) {
      if (Date.now() >= glass.ends) finishGlass();
      else paintGlass();
    }
    const now = Date.now();
    const due = ravens.filter((r) => r.at <= now);
    if (due.length) {
      ravens = ravens.filter((r) => r.at > now);
      saveRavens();
      due.forEach(flyRaven);
    }
  }, 1000);

  const abilities = {
    list,
    byId,
    cast,
    runTool,
    hourglass: byId.hourglass,
    raven: byId.raven,
    get hunting() { return !!hunt; },
    reapAt,
    dueToday() {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      return ravens.filter((r) => r.at <= end.getTime()).length;
    },
    onHover() {
      if (glass) say(mmss(glass.ends - Date.now()) + ' left', 2000);
    },
    restore(s) {
      best = s.best || 0;
      ravens = Array.isArray(s.ravens) ? s.ravens : [];
      // A timer that ran out while he was closed is let go quietly.
      if (s.hourglass && s.hourglass.ends > Date.now()) glass = s.hourglass;
      else if (s.hourglass) companion.save({ hourglass: null });
      paintGlass();
    }
  };
  return abilities;
}
