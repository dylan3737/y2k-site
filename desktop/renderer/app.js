// The reaper on the desktop: how he moves, rests, sleeps and talks, the ring of
// abilities around him, and which parts of the window take clicks.
import { companion } from './bridge.js';
import * as sound from './sound.js';
import { createAbilities } from './abilities.js';
import { createSpeak } from './speak.js';
import { createCrypt } from './crypt.js';

const $ = (id) => document.getElementById(id);
const reaper = $('reaper');
const body = $('body');
const bubble = $('bubble');
const card = $('card');
const ring = $('ring');
const field = $('field');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const W = 92;
const H = 114;
const pos = { x: innerWidth - 150, y: innerHeight - 190 };
const vel = { x: 0, y: 0 };
const cursor = { x: -9999, y: -9999 };
const settings = { wander: true, chatty: true, hasKey: false, roam: true };

// wander | drag | fly | rest | sleep | vanish
let mode = 'wander';
let target = null;
let waitUntil = 0;
let facingLeft = true;
// Asleep because the computer went idle; cleared when the main process says
// the user is back, even if a click woke him first.
let napping = false;

const clamp = (v, lo, hi) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function center() {
  return { x: pos.x + W / 2, y: pos.y + H / 2 };
}

function bounds() {
  return { minX: 6, minY: 6, maxX: innerWidth - W - 6, maxY: innerHeight - H - 18 };
}

function keepOnScreen() {
  const b = bounds();
  pos.x = clamp(pos.x, b.minX, b.maxX);
  pos.y = clamp(pos.y, b.minY, b.maxY);
}

// Draw him, and keep his bubble and card on screen.
function place() {
  reaper.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
  reaper.classList.toggle('is-left', facingLeft);
  const above = card.hidden ? (bubble.hidden ? 0 : bubble.offsetHeight) : card.offsetHeight;
  reaper.classList.toggle('is-low', pos.y < above + 24);
  const cx = pos.x + W / 2;
  const shift = (half) => {
    const left = cx - half;
    return clamp(left, 8, innerWidth - half * 2 - 8) - left;
  };
  reaper.style.setProperty('--card-shift', `calc(-50% + ${shift(card.offsetWidth / 2 || 150)}px)`);
  reaper.style.setProperty('--bubble-shift', `calc(-50% + ${shift((bubble.offsetWidth || 120) / 2)}px)`);
}

function setMode(next) {
  mode = next;
  reaper.classList.toggle('is-resting', mode === 'rest');
  reaper.classList.toggle('is-sleeping', mode === 'sleep');
  reaper.classList.toggle('is-vanished', mode === 'vanish');
  if (mode !== 'wander' && mode !== 'fly') reaper.classList.remove('is-moving');
}

// --- Speech ------------------------------------------------------------------------
let bubbleTimer = null;

function say(text, ms = 4500) {
  if (mode === 'vanish') return;
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(bubbleTimer);
  if (ms) bubbleTimer = setTimeout(() => { bubble.hidden = true; place(); }, ms);
  place();
}

// Lines he says unprompted: not while quiet, busy, hidden or asleep.
function sayIdle(text) {
  if (!settings.chatty || mode !== 'wander' || !card.hidden || !bubble.hidden || !ring.hidden) return;
  say(text, 5000);
}

function timeLine() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late.';
  if (h < 9) return 'Early. The dead sleep in.';
  if (h < 12) return 'Morning. Still here.';
  if (h < 17) return pick(['Long day?', 'Drink some water.', 'Still working. Good.']);
  if (h < 21) return 'Dusk. My hour.';
  return 'Night. Stay a while.';
}

function minutesText(m) {
  m = Math.round(m);
  if (m < 60) return m + ' min';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

// --- Soul ----------------------------------------------------------------------------
let soulLevel = 100;
let saveSoulTimer = null;

function pop(text, kind) {
  const c = center();
  const el = document.createElement('div');
  el.className = 'soul-pop' + (kind ? ' ' + kind : '');
  el.textContent = text;
  el.style.left = (c.x - 12) + 'px';
  el.style.top = (pos.y - 4) + 'px';
  field.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function paintSoul() {
  $('soulFill').style.width = soulLevel + '%';
  reaper.classList.toggle('is-faint', soulLevel < 20);
  reaper.querySelector('.soul').setAttribute('aria-valuenow', String(Math.round(soulLevel)));
  ring.querySelectorAll('.ring-btn').forEach((btn) => {
    btn.classList.toggle('is-locked', soulLevel < Number(btn.dataset.cost));
  });
  clearTimeout(saveSoulTimer);
  saveSoulTimer = setTimeout(() => companion.save({ soul: Math.round(soulLevel) }), 1000);
}

const soul = {
  get: () => soulLevel,
  gain(n) {
    if (soulLevel >= 100) return;
    soulLevel = Math.min(100, soulLevel + n);
    paintSoul();
  },
  spend(n) {
    if (soulLevel < n) return false;
    soulLevel -= n;
    paintSoul();
    if (n) pop('-' + n, 'is-cost');
    return true;
  }
};

// --- Small effects -------------------------------------------------------------------
function puff(x, y) {
  if (reducedMotion) return;
  const el = document.createElement('div');
  el.className = 'puff';
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  field.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

function swing() {
  const c = center();
  const el = document.createElement('div');
  el.className = 'scythe-swing';
  el.style.left = c.x + 'px';
  el.style.top = c.y + 'px';
  field.appendChild(el);
  setTimeout(() => el.remove(), 550);
}

let lastWisp = 0;
function wisp(now) {
  if (reducedMotion || now - lastWisp < 40) return;
  lastWisp = now;
  const c = center();
  const el = document.createElement('div');
  el.className = 'wisp';
  el.style.left = (c.x + (Math.random() - 0.5) * 30) + 'px';
  el.style.top = (c.y + 10 + (Math.random() - 0.5) * 30) + 'px';
  field.appendChild(el);
  setTimeout(() => el.remove(), 720);
}

// Shadow Step: gone in a puff, back in a puff at the cursor.
function shadowStep() {
  const from = center();
  puff(from.x, from.y);
  const to = cursor.x > -999 ? cursor : { x: innerWidth / 2, y: innerHeight / 2 };
  pos.x = to.x - W / 2;
  pos.y = to.y - H / 2 + 40;
  keepOnScreen();
  target = null;
  waitUntil = performance.now() + 8000;
  setMode('wander');
  place();
  const c = center();
  puff(c.x, c.y);
}

// --- Card (Speak, Raven, Hourglass) ----------------------------------------------------
let cardOwner = null;

const cardApi = {
  open(el, school, owner, { focus = false } = {}) {
    closeRing();
    bubble.hidden = true;
    cardOwner = owner || null;
    card.replaceChildren(el);
    card.style.setProperty('--school', `var(--${school})`);
    card.hidden = false;
    if (mode === 'vanish' || mode === 'sleep' || mode === 'rest') setMode('wander');
    place();
    if (focus) {
      companion.focus(true);
      setTimeout(() => {
        const input = el.querySelector('textarea, input');
        if (input) input.focus();
      }, 40);
    }
  },
  close(owner) {
    if (owner && cardOwner !== owner) return;
    if (card.hidden) return;
    card.hidden = true;
    card.replaceChildren();
    cardOwner = null;
    companion.focus(false);
    place();
  },
  isOpen: (owner) => !card.hidden && (!owner || cardOwner === owner),
  refit: () => place()
};

// --- Abilities and the ring -------------------------------------------------------------
const ctx = {
  say, soul, pop, center, cursor, field, card: cardApi, sound, companion, puff, swing,
  reducedMotion, minutesText,
  getMode: () => mode,
  vanish() {
    // Thrown or held in the meantime: he stays.
    if (mode === 'drag' || mode === 'fly') return;
    cardApi.close();
    closeRing();
    const c = center();
    puff(c.x, c.y);
    const b = bounds();
    pos.x = b.maxX;
    pos.y = b.maxY;
    target = null;
    bubble.hidden = true;
    setMode('vanish');
    place();
  },
  unvanish() {
    setMode('wander');
    waitUntil = performance.now() + 4000;
    const c = center();
    puff(c.x, c.y);
  }
};

const crypt = createCrypt(ctx);
ctx.crypt = crypt;
const speak = createSpeak(ctx);
ctx.speak = speak;
const abilities = createAbilities(ctx);
ctx.abilities = abilities;

companion.setAbilities(abilities.list.map((a) => ({ id: a.id, name: a.name })));

let ringAt = null;

function openRing() {
  ring.replaceChildren();
  const list = abilities.list;
  // Wide enough that the buttons don't overlap, however many there are.
  const radius = Math.max(116, Math.round((list.length * 78) / (Math.PI * 2)));
  ring.style.setProperty('--r', radius + 'px');
  const c = center();
  ringAt = { x: clamp(c.x, radius + 50, innerWidth - radius - 50), y: clamp(c.y, radius + 24, innerHeight - radius - 24) };
  ring.style.left = ringAt.x + 'px';
  ring.style.top = ringAt.y + 'px';
  list.forEach((a, i) => {
    const angle = -Math.PI / 2 + (i / list.length) * Math.PI * 2;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ring-btn hit';
    btn.dataset.id = a.id;
    btn.dataset.cost = a.cost;
    btn.setAttribute('role', 'menuitem');
    btn.style.setProperty('--school', `var(--${a.school})`);
    btn.style.setProperty('--x', Math.round(Math.cos(angle) * radius) + 'px');
    btn.style.setProperty('--y', Math.round(Math.sin(angle) * radius) + 'px');
    btn.style.setProperty('--delay', (i * 18) + 'ms');
    const active = a.active && a.active();
    btn.classList.toggle('is-active', !!active);
    btn.title = a.blurb;
    btn.innerHTML = '<span></span><small></small>';
    btn.firstChild.textContent = a.name;
    btn.lastChild.textContent = active ? 'stop' : (a.cost ? a.cost + ' soul' : 'free');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      abilities.cast(a.id);
    });
    ring.appendChild(btn);
  });
  paintSoul();
  ring.hidden = false;
  requestAnimationFrame(() => ring.classList.add('is-open'));
  bubble.hidden = true;
}

function closeRing() {
  if (ring.hidden) return;
  ring.classList.remove('is-open');
  ring.hidden = true;
  ringAt = null;
}

ctx.closeRing = closeRing;

// --- Clicks: the window passes them through except over .hit -------------------------------
let interactive = false;
let dragging = null;

function hitTest() {
  const el = cursor.x > -999 ? document.elementFromPoint(cursor.x, cursor.y) : null;
  const want = !!dragging || !!(el && el.closest('.hit'));
  if (want !== interactive) {
    interactive = want;
    companion.interactive(want);
  }
}

// Petting: rub the cursor back and forth over him.
const rub = { dir: 0, lastX: 0, flips: [], said: 0 };

function feelRub(now) {
  if (mode !== 'wander' || dragging) return;
  const over = Math.abs(cursor.x - center().x) < W / 2 && Math.abs(cursor.y - center().y) < H / 2;
  if (!over) { rub.flips = []; return; }
  const dir = Math.sign(cursor.x - rub.lastX);
  if (dir && rub.dir && dir !== rub.dir) rub.flips.push(now);
  if (dir) rub.dir = dir;
  rub.lastX = cursor.x;
  rub.flips = rub.flips.filter((t) => now - t < 1600);
  if (rub.flips.length >= 6 && now - rub.said > 8000) {
    rub.said = now;
    rub.flips = [];
    say(pick(['…Fine. Once more.', 'I am not a cat.', 'Careful. Sharp.', 'Mm.', 'The dead do not purr.']));
    soul.gain(2);
  }
}

companion.onCursor((p) => {
  cursor.x = p.x;
  cursor.y = p.y;
  hitTest();
  feelRub(performance.now());
  if (ringAt && dist(cursor, ringAt) > 250) closeRing();
});
setInterval(hitTest, 150);

// --- Dragging, clicking, throwing ------------------------------------------------------------
body.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  body.setPointerCapture(e.pointerId);
  dragging = {
    offX: e.clientX - pos.x, offY: e.clientY - pos.y, moved: 0, was: mode,
    lastX: e.clientX, lastY: e.clientY, samples: [{ x: e.clientX, y: e.clientY, t: performance.now() }]
  };
  hitTest();
});

body.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragging.moved += Math.hypot(e.clientX - dragging.lastX, e.clientY - dragging.lastY);
  dragging.lastX = e.clientX;
  dragging.lastY = e.clientY;
  if (dragging.moved < 6) return;
  if (mode !== 'drag') {
    closeRing();
    setMode('drag');
    reaper.classList.add('is-moving');
  }
  const now = performance.now();
  dragging.samples.push({ x: e.clientX, y: e.clientY, t: now });
  if (dragging.samples.length > 8) dragging.samples.shift();
  if (Math.abs(e.clientX - (pos.x + dragging.offX)) > 1) facingLeft = e.clientX < pos.x + dragging.offX;
  pos.x = e.clientX - dragging.offX;
  pos.y = e.clientY - dragging.offY;
  keepOnScreen();
  place();
});

function endDrag(e) {
  if (!dragging) return;
  const d = dragging;
  dragging = null;
  try { body.releasePointerCapture(e.pointerId); } catch {}
  if (d.moved < 6) {
    clicked(d.was);
  } else if (dropThrough(d)) {
    // Carried off the edge onto another monitor.
  } else {
    const now = performance.now();
    const recent = d.samples.filter((s) => now - s.t < 110);
    const first = recent[0];
    const last = d.samples[d.samples.length - 1];
    const dt = first && last ? Math.max(16, last.t - first.t) : 1;
    const vx = first ? (last.x - first.x) / dt : 0;
    const vy = first ? (last.y - first.y) / dt : 0;
    if (Math.hypot(vx, vy) > 0.6) {
      vel.x = clamp(vx, -4, 4);
      vel.y = clamp(vy, -4, 4);
      setMode('fly');
      reaper.classList.add('is-moving');
    } else if (soulLevel < 100) {
      setMode('rest');
      say('Scythe down.', 2500);
    } else {
      setMode('wander');
      target = null;
      waitUntil = performance.now() + 5000;
    }
  }
  hitTest();
}

body.addEventListener('pointerup', endDrag);
body.addEventListener('pointercancel', endDrag);

function clicked(was) {
  if (was === 'vanish') {
    abilities.cast(was);
    return;
  }
  if (was === 'sleep') {
    setMode('wander');
    say(pick(['Hm? Awake.', 'I was not asleep.']));
    return;
  }
  if (was === 'rest') setMode('wander');
  if (!ring.hidden) closeRing();
  else openRing();
}

body.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  companion.menu();
});

body.addEventListener('mouseenter', () => abilities.onHover());

// Reap: files dropped on him go to the Trash.
let hungerTimer = null;
body.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  reaper.classList.add('is-hungry');
  clearTimeout(hungerTimer);
  hungerTimer = setTimeout(() => reaper.classList.remove('is-hungry'), 400);
});

body.addEventListener('drop', async (e) => {
  e.preventDefault();
  reaper.classList.remove('is-hungry');
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  const paths = files.map((f) => { try { return companion.pathForFile(f); } catch { return ''; } }).filter(Boolean);
  if (!paths.length) {
    say('Nothing here I can eat.');
    return;
  }
  swing();
  sound.slash();
  const { ok, failed } = await companion.trash(paths);
  if (ok) {
    sound.gulp();
    soul.gain(5 * ok);
    pop('+' + 5 * ok);
  }
  if (ok && !failed) say(`Reaped ${ok} file${ok === 1 ? '' : 's'}.\nThey wait in the Trash.`, 5000);
  else if (ok) say(`Reaped ${ok}. ${failed} would not go.`, 5000);
  else say('They would not go.');
});

// Dropping anywhere else must not navigate the window.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!ring.hidden) closeRing();
  else cardApi.close();
});

// --- Other monitors ---------------------------------------------------------------------------
// Doors are the stretches of this monitor's edges that lead to another one, in
// page coordinates; the main process sends them whenever they change.
let doors = [];
let crossing = false;
companion.onDoors((list) => { doors = Array.isArray(list) ? list : []; });

const upright = (side) => side === 'left' || side === 'right';
const doorAt = (side, along) => doors.find((d) => d.side === side && along >= d.from && along <= d.to);

// Not in the middle of something that belongs to this monitor.
function canRoam() {
  return settings.roam !== false && !crossing && doors.length > 0 && !abilities.hunting && !document.querySelector('.fx-canvas');
}

// The window waits for the main process to resize it; this waits for the page to see it.
function sized(width, height) {
  return new Promise((resolve) => {
    const until = performance.now() + 700;
    const look = () => {
      if ((innerWidth === width && innerHeight === height) || performance.now() > until) resolve();
      else requestAnimationFrame(look);
    };
    look();
  });
}

// Through a door, walking, flying or carried. He fades out, the window moves to
// the next monitor, and he comes in from the matching edge.
async function cross(door, how) {
  crossing = true;
  const c = center();
  const along = clamp(upright(door.side) ? c.y : c.x, door.from, door.to);
  closeRing();
  reaper.classList.add('is-crossing');
  let res = null;
  try {
    res = await companion.cross({ id: door.id, side: door.side, along });
  } catch {}
  if (!res) {
    // The door closed meanwhile (a monitor unplugged, roaming switched off).
    crossing = false;
    reaper.classList.remove('is-crossing');
    target = null;
    keepOnScreen();
    place();
    return false;
  }
  await sized(res.width, res.height);
  if (Array.isArray(res.doors)) doors = res.doors;
  const b = bounds();
  if (upright(res.side)) {
    pos.y = clamp(res.along - H / 2, b.minY, b.maxY);
    pos.x = res.side === 'left' ? b.minX : b.maxX;
  } else {
    pos.x = clamp(res.along - W / 2, b.minX, b.maxX);
    pos.y = res.side === 'top' ? b.minY : b.maxY;
  }
  if (how === 'walk') {
    // A few steps in from the edge, so he doesn't stand in the doorway.
    const inward = 120 + Math.random() * 260;
    target = {
      x: clamp(pos.x + (res.side === 'left' ? inward : res.side === 'right' ? -inward : 0), b.minX, b.maxX),
      y: clamp(pos.y + (res.side === 'top' ? inward : res.side === 'bottom' ? -inward : 0), b.minY, b.maxY)
    };
  } else if (how === 'drop') {
    setMode('wander');
    target = null;
    waitUntil = performance.now() + 5000;
  }
  // A flight keeps its speed: he carries on into the new monitor.
  crossing = false;
  reaper.classList.remove('is-crossing');
  place();
  return true;
}

// Let go past an edge with a door: he goes through, where the cursor is.
function dropThrough(d) {
  if (!canRoam()) return false;
  const side = d.lastX < 0 ? 'left' : d.lastX > innerWidth ? 'right' : d.lastY < 0 ? 'top' : d.lastY > innerHeight ? 'bottom' : null;
  const door = side && doorAt(side, upright(side) ? d.lastY : d.lastX);
  if (!door) return false;
  cross(door, 'drop');
  return true;
}

// Now and then a wander leads to a door instead of somewhere on this monitor.
function pickDoor() {
  if (!canRoam() || Math.random() > 0.25) return false;
  const door = pick(doors);
  const b = bounds();
  // Where his middle can be and still be in the doorway.
  const lo = Math.max(door.from, upright(door.side) ? b.minY + H / 2 : b.minX + W / 2);
  const hi = Math.min(door.to, upright(door.side) ? b.maxY + H / 2 : b.maxX + W / 2);
  if (hi <= lo) return false;
  const along = lo + Math.random() * (hi - lo);
  target = upright(door.side)
    ? { x: door.side === 'left' ? b.minX : b.maxX, y: along - H / 2, door }
    : { x: along - W / 2, y: door.side === 'top' ? b.minY : b.maxY, door };
  return true;
}

// --- Movement ------------------------------------------------------------------------------
function pickTarget() {
  if (pickDoor()) return;
  const b = bounds();
  // Mostly the lower part of the screen, where he is less in the way.
  target = {
    x: b.minX + Math.random() * (b.maxX - b.minX),
    y: b.minY + (0.35 + 0.65 * Math.random()) * (b.maxY - b.minY)
  };
}

function moveToward(dt, speed) {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  const stepLen = Math.min(d, speed * dt);
  if (d < 2) return true;
  pos.x += (dx / d) * stepLen;
  pos.y += (dy / d) * stepLen;
  if (Math.abs(dx) > 2) facingLeft = dx < 0;
  return false;
}

function step(dt, now) {
  if (crossing) return;
  if (mode === 'fly') {
    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    const drag = Math.pow(0.9965, dt);
    vel.x *= drag;
    vel.y *= drag;
    const b = bounds();
    // Flung at an edge with a door: he flies through it instead of bouncing.
    const wall = pos.x < b.minX ? 'left' : pos.x > b.maxX ? 'right' : pos.y < b.minY ? 'top' : pos.y > b.maxY ? 'bottom' : null;
    const c = center();
    const door = wall && canRoam() && doorAt(wall, upright(wall) ? c.y : c.x);
    if (door) {
      cross(door, 'fly');
      return;
    }
    if (pos.x < b.minX || pos.x > b.maxX) { vel.x = -vel.x * 0.6; pos.x = clamp(pos.x, b.minX, b.maxX); }
    if (pos.y < b.minY || pos.y > b.maxY) { vel.y = -vel.y * 0.6; pos.y = clamp(pos.y, b.minY, b.maxY); }
    if (Math.abs(vel.x) > 0.05) facingLeft = vel.x < 0;
    wisp(now);
    if (Math.hypot(vel.x, vel.y) < 0.04) {
      setMode('wander');
      target = null;
      waitUntil = now + 3000;
      if (Math.random() < 0.5) say(pick(['Again.', 'Undignified.', 'I felt that.', 'Wheee. (Deadpan.)']));
    }
    place();
    return;
  }

  if (mode !== 'wander') return;
  const near = dist(cursor, center()) < 150;
  const hold = !settings.wander || reducedMotion || !ring.hidden || !card.hidden || near || !!dragging;
  if (hold) {
    reaper.classList.remove('is-moving');
    if (near && Math.abs(cursor.x - center().x) > 8) {
      const left = cursor.x < center().x;
      if (left !== facingLeft) { facingLeft = left; place(); }
    }
    return;
  }
  if (!target) {
    reaper.classList.remove('is-moving');
    if (now < waitUntil) return;
    pickTarget();
  }
  reaper.classList.add('is-moving');
  if (moveToward(dt, 0.045)) {
    const door = target.door;
    target = null;
    waitUntil = now + 2500 + Math.random() * 6000;
    // At the doorway: through, if it is still open.
    if (door && canRoam() && doors.some((d) => d.id === door.id && d.side === door.side)) {
      cross(door, 'walk');
      return;
    }
  }
  place();
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(50, now - lastFrame);
  lastFrame = now;
  step(dt, now);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  // A crossing places him itself once the window has its new size.
  if (crossing) return;
  keepOnScreen();
  target = null;
  place();
});

// --- Rest, regeneration, sleep -----------------------------------------------------------------
let tick = 0;
setInterval(() => {
  tick++;
  if (mode === 'rest') {
    soul.gain(6);
    if (soulLevel >= 100) {
      setMode('wander');
      waitUntil = performance.now() + 3000;
      say('Rested.');
    }
  } else if (tick % 13 === 0) {
    soul.gain(1);
  }
}, 450);

companion.onAway(({ away, minutes, dug }) => {
  if (away) {
    if (dragging || mode === 'vanish') return;
    closeRing();
    bubble.hidden = true;
    setMode('sleep');
    napping = true;
    return;
  }
  if (!napping) return;
  napping = false;
  if (mode === 'sleep') setMode('wander');
  waitUntil = performance.now() + 4000;
  soul.gain(Math.min(100, (minutes || 0) * 4));
  const gone = [minutes >= 1 ? 'Gone ' + minutesText(minutes) + '.' : '', crypt.report(dug)].filter(Boolean).join('\n');
  if (greet(gone)) return;
  if (gone) say('Back. ' + gone, 6000);
});

companion.onCommand((command) => {
  if (command === 'come') {
    if (mode === 'vanish' || mode === 'sleep') setMode('wander');
    shadowStep();
  } else if (command === 'speak') {
    if (mode === 'vanish' || mode === 'sleep') setMode('wander');
    shadowStep();
    speak.open();
  } else if (command.startsWith('cast:')) {
    abilities.cast(command.slice(5));
  }
});

companion.onSettings((s) => {
  Object.assign(settings, s);
  if ('brain' in s) speak.setMind(s.brain);
  if ('hasKey' in s) speak.setHasKey(s.hasKey);
  if ('muted' in s) sound.setMuted(s.muted);
  if ('minions' in s) crypt.setShown(s.minions);
  if ('roam' in s) settings.roam = s.roam !== false;
});

// The first time he sees you each day (from 5am): a greeting, and what the
// ravens carry today.
function greet(lead) {
  const now = new Date();
  const day = now.toDateString();
  if (settings.greeted === day || now.getHours() < 5) return false;
  settings.greeted = day;
  companion.save({ greeted: day });
  const due = abilities.dueToday();
  const hello = now.getHours() < 12 ? 'Morning.' : now.getHours() < 18 ? 'Afternoon.' : 'Evening.';
  const omen = due ? (due === 1 ? 'One raven flies today.' : due + ' ravens fly today.') : 'No ravens today. A quiet one.';
  say([hello, lead, omen].filter(Boolean).join('\n'), 7000);
  return true;
}

companion.onToolCancel(() => speak.cancelAsks());

companion.onToolCall(async ({ id, name, input }) => {
  let outcome;
  try {
    outcome = await abilities.runTool(name, input || {});
  } catch (err) {
    outcome = { ok: false, error: String((err && err.message) || err) };
  }
  companion.toolResult(id, outcome);
});

// --- Start ----------------------------------------------------------------------------------------
async function start() {
  const s = await companion.state();
  soulLevel = Number.isFinite(s.soul) ? s.soul : 100;
  settings.wander = s.wander !== false;
  settings.chatty = s.chatty !== false;
  settings.hasKey = !!s.hasKey;
  settings.greeted = s.greeted || null;
  speak.setMind(s.brain || 'free');
  speak.setFreeReady(!!(s.free && s.free.installed));
  speak.setHasKey(settings.hasKey);
  sound.setMuted(!!s.muted);
  abilities.restore(s);
  crypt.setShown(s.minions !== false);
  settings.roam = s.roam !== false;
  doors = Array.isArray(s.doors) ? s.doors : [];
  if (s.crypt) crypt.update(s.crypt);
  // What the skeletons dug while the app was shut leads his first words.
  const dug = crypt.report(s.crypt && s.crypt.dug);
  keepOnScreen();
  place();
  paintSoul();
  requestAnimationFrame(frame);
  setTimeout(() => { if (!greet(dug)) say(dug || timeLine(), dug ? 6000 : 4000); }, 1500);
  setInterval(() => { if (Math.random() < 0.35) sayIdle(timeLine()); }, 240000);
}

start();

// Tests read state through this.
window.__reaper = {
  pos, cursor, get doors() { return doors; }, get crossing() { return crossing; }, cross,
  // Forget where he was going and choose again now.
  retarget() { target = null; waitUntil = 0; },
  get mode() { return mode; }, get soul() { return soulLevel; }, abilities, speak, crypt, say };
