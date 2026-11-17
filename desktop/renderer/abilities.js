// Every ability in the ring: what it costs, what it does, and how Speak's tools
// reach the same things.
import { el, chip } from './dom.js';
import * as effects from './effects.js';

const GHOST_SVG = '<svg viewBox="0 0 40 48" aria-hidden="true"><path d="M4 46 V20 A16 16 0 0 1 36 20 V46 L30 40 L24 46 L20 40 L16 46 L10 40 Z"/>' +
  '<circle cx="14" cy="20" r="3"/><circle cx="26" cy="20" r="3"/></svg>';
const RAVEN_SVG = '<svg class="raven" viewBox="0 0 64 40" aria-hidden="true"><path d="M2 21 C12 13 21 13 28 17 L33 6 L38 17 ' +
  'C46 14 55 16 62 23 C52 21 45 23 39 27 L35 37 L31 27 C21 28 11 26 2 21 Z"/><circle cx="35" cy="20" r="1.4"/></svg>';

const HUNT_MS = 10000;
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
    note.innerHTML = RAVEN_SVG;
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
    const chips = [5, 15, 30, 60].map((m) => {
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

  // --- Summon: catch ghosts across the screen ---------------------------------------------
  let hunt = null;
  let best = 0;
  let scoreEl = null;

  function spawnGhost() {
    // One in ten, or more with the Crypt's ghost lure.
    const golden = Math.random() < (ctx.crypt.get().goldenChance || 0.1);
    const g = el('div', 'ghost hit' + (golden ? ' is-golden' : ''));
    g.innerHTML = GHOST_SVG;
    const side = Math.random() < 0.5;
    const ghost = {
      node: g, golden,
      x: side ? -40 : innerWidth + 10,
      y: 40 + Math.random() * (innerHeight - 140),
      vx: (side ? 1 : -1) * (0.08 + Math.random() * 0.16),
      vy: (Math.random() - 0.5) * 0.14,
      phase: Math.random() * 6
    };
    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      catchGhost(ghost);
    });
    field.appendChild(g);
    hunt.ghosts.push(ghost);
  }

  function catchGhost(ghost) {
    if (!hunt || ghost.caught) return;
    ghost.caught = true;
    hunt.score += ghost.golden ? 3 : 1;
    soul.gain(ghost.golden ? 8 : 3);
    sound.caught();
    ghost.node.classList.add('is-caught');
    setTimeout(() => ghost.node.remove(), 320);
    scoreEl.textContent = 'SOULS ' + hunt.score;
  }

  function moveGhosts(now) {
    if (!hunt) return;
    const dt = Math.min(50, now - hunt.last);
    hunt.last = now;
    for (const g of hunt.ghosts) {
      if (g.caught) continue;
      // They shy away from the cursor.
      const dx = g.x + 21 - cursor.x;
      const dy = g.y + 25 - cursor.y;
      const d = Math.hypot(dx, dy);
      if (d < 120 && d > 0) {
        g.vx += (dx / d) * 0.004 * dt;
        g.vy += (dy / d) * 0.004 * dt;
      }
      const speed = Math.hypot(g.vx, g.vy);
      if (speed > 0.35) { g.vx *= 0.35 / speed; g.vy *= 0.35 / speed; }
      g.x += g.vx * dt;
      g.y += g.vy * dt + Math.sin(now / 300 + g.phase) * 0.3;
      if ((g.x < 0 && g.vx < 0) || (g.x > innerWidth - 42 && g.vx > 0)) g.vx = -g.vx;
      if ((g.y < 0 && g.vy < 0) || (g.y > innerHeight - 50 && g.vy > 0)) g.vy = -g.vy;
      const at = `translate(${Math.round(g.x)}px, ${Math.round(g.y)}px)`;
      g.node.style.transform = at;
      g.node.style.setProperty('--at', at);
    }
    const left = hunt.ends - Date.now();
    huntRing.style.setProperty('--left', Math.max(0, left / HUNT_MS).toFixed(3));
    huntRing.classList.toggle('is-late', left < 3000);
    if (left <= 0) return endHunt();
    if (now - hunt.lastSpawn > 900 && hunt.ghosts.filter((g) => !g.caught).length < 12) {
      hunt.lastSpawn = now;
      spawnGhost();
    }
    requestAnimationFrame(moveGhosts);
  }

  function startHunt() {
    hunt = { ends: Date.now() + HUNT_MS, score: 0, ghosts: [], last: performance.now(), lastSpawn: performance.now() };
    scoreEl = el('div', 'score', 'SOULS 0');
    field.appendChild(scoreEl);
    huntRing.hidden = false;
    for (let i = 0; i < 6; i++) spawnGhost();
    requestAnimationFrame(moveGhosts);
  }

  function endHunt() {
    const score = hunt.score;
    hunt.ghosts.forEach((g) => g.node.remove());
    hunt = null;
    huntRing.hidden = true;
    const board = scoreEl;
    setTimeout(() => board.remove(), 2500);
    companion.stat('caught', score);
    if (score > best) {
      best = score;
      companion.save({ best });
      say(score ? 'New mark: ' + score + ' souls.' : 'None. Shameful.', 5000);
    } else {
      say(score + ' souls.\nBest: ' + best + '.', 5000);
    }
  }

  function reapAll() {
    if (!hunt) return 0;
    const loose = hunt.ghosts.filter((g) => !g.caught);
    loose.forEach((g, i) => setTimeout(() => catchGhost(g), 80 + i * 50));
    return loose.length;
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
      id: 'summon', name: 'Summon', cost: 25, school: 'spirit', blurb: 'Ten seconds. Catch the ghosts.',
      ready: () => (hunt ? 'Already hunting.' : null),
      cast: () => { startHunt(); say('Ten seconds. Catch them.', 3000); }
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
