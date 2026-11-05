// The reaper's soul, the effects his spells are built from, and the ghost-catching round.
// What each spell does, and what it costs, lives in spells.js.
import * as audio from './audio.js';
import * as fluid from './fluid.js';
import { games, showGameCard } from './games.js';
import { walkTo } from './reaper.js';
import { load, save, reducedMotion } from './store.js';

let manaLevel = 100;

export function soul() {
  return manaLevel;
}

export function gainSoul(n) {
  manaLevel = Math.min(100, manaLevel + n);
  syncMana();
}

export function syncMana() {
  const fill = document.getElementById('ghostManaFill');
  const bar = document.getElementById('ghostMana');
  if (fill) fill.style.width = manaLevel + '%';
  if (bar) {
    bar.setAttribute('aria-valuenow', String(manaLevel));
    bar.classList.toggle('is-empty', manaLevel <= 0);
  }
  document.querySelectorAll('[data-cost]').forEach((btn) => {
    btn.classList.toggle('is-locked', manaLevel < Number(btn.dataset.cost));
  });
}

export function ghostCenter() {
  const ghost = document.getElementById('ghost-character');
  const rect = ghost.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 };
}

function floatSoul(text, kind) {
  const c = ghostCenter();
  const pop = document.createElement('div');
  pop.className = 'soul-pop' + (kind ? ' ' + kind : '');
  pop.textContent = text;
  pop.style.left = (c.x - 18) + 'px';
  pop.style.top = (c.y - 16) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 800);
}

let chain = 0;
let lastCast = 0;
let hexed = false;

// How many casts in a row, each within 2.2s of the last.
export function chainLength() {
  return chain;
}

export function spendSoul(cost, speech) {
  if (manaLevel < cost) {
    speech.textContent = 'Empty. Rest, or siphon.';
    floatSoul('EMPTY', 'is-need');
    return false;
  }
  const now = Date.now();
  chain = now - lastCast < CHAIN_MS ? chain + 1 : 1;
  lastCast = now;
  manaLevel -= cost;
  if (chain >= 2) manaLevel = Math.min(100, manaLevel + 5);
  syncMana();
  if (cost) floatSoul(chain >= 2 ? '-' + cost + ' x' + chain : '-' + cost);
  paintChain();
  return true;
}

// Three pips show how far into a rite's chain you are. They empty when the
// 2.2s window runs out, so visitors can see the breath they have.
const CHAIN_MS = 2200;

function paintChain() {
  const pips = document.getElementById('chainPips');
  if (!pips) return;
  const filled = ((chain - 1) % 3) + 1;
  pips.querySelectorAll('i').forEach((pip, i) => pip.classList.toggle('is-on', i < filled));
  pips.classList.add('is-live');
  pips.classList.remove('is-fading');
  void pips.offsetWidth;
  pips.classList.add('is-fading');
  clearTimeout(paintChain.timer);
  paintChain.timer = setTimeout(() => {
    pips.classList.remove('is-live', 'is-fading');
    pips.querySelectorAll('i').forEach((pip) => pip.classList.remove('is-on'));
  }, CHAIN_MS);
}

// Bind: chain every loose ghost in place.
let boundUntil = 0;

export function looseGhosts() {
  return document.querySelectorAll('.prey-ghost:not(.is-caught)');
}

export function bindPrey(ms) {
  boundUntil = Math.max(boundUntil, Date.now() + ms);
  const loose = document.querySelectorAll('.prey-ghost:not(.is-caught)');
  loose.forEach((el) => el.classList.add('is-bound'));
  clearTimeout(bindPrey.timer);
  bindPrey.timer = setTimeout(() => {
    document.querySelectorAll('.prey-ghost').forEach((el) => el.classList.remove('is-bound'));
  }, boundUntil - Date.now());
}

// Raise: a summoning circle burns open and a ghost rises out of it, then
// turns into one of Dylan's projects. Each cast raises the next one.
let raiseNext = 0;

export function nextRaise() {
  return raiseNext++ % games.length;
}

export function raiseProject(index, at) {
  const circle = document.createElement('div');
  circle.className = 'raise-circle';
  circle.style.left = (at ? at.x : window.innerWidth / 2) + 'px';
  circle.style.top = (at ? at.y : window.innerHeight * 0.66) + 'px';
  circle.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="36"/>' +
    '<path d="M50 4 L50 96 M4 50 L96 50 M17 17 L83 83 M83 17 L17 83"/></svg>' +
    '<span class="raised-ghost" aria-hidden="true"><svg viewBox="0 0 40 48"><path d="M4 46 V20 A16 16 0 0 1 36 20 V46 L30 40 L24 46 L20 40 L16 46 L10 40 Z"/>' +
    '<circle cx="14" cy="20" r="3"/><circle cx="26" cy="20" r="3"/></svg></span>';
  document.body.appendChild(circle);
  const r = circle.getBoundingClientRect();
  fluid.pulse(r.left + r.width / 2, r.top + r.height / 2, [0.38, 0.56, 0.62]);
  setTimeout(() => showGameCard(index, circle), reducedMotion ? 0 : 1300);
  setTimeout(() => circle.remove(), 4200);
}

// Ferry: he crosses to a song he isn't playing and plays it when he gets there.
export function ferry(say) {
  const ring = document.querySelector('.song-ring');
  const musicTab = document.getElementById('musicTab');
  if (ring && !ring.classList.contains('is-open') && musicTab) musicTab.click();
  const marks = [...document.querySelectorAll('.song-mark:not(.is-sealed):not(.is-on)')];
  const mark = marks[Math.floor(Math.random() * marks.length)];
  if (!mark) return;
  say('Across to ' + mark.textContent + '.');
  walkTo(mark, () => audio.playAt(Number(mark.dataset.song)));
}

// Raven: a raven flies in carrying a note with a way to reach Dylan.
export const RAVEN_NOTES = {
  email: { label: 'Write to Dylan', text: 'dylthesage@gmail.com', href: 'mailto:dylthesage@gmail.com', copy: 'dylthesage@gmail.com' },
  github: { label: 'Code on GitHub', text: 'github.com/dylan3737', href: 'https://github.com/dylan3737' },
  itch: { label: 'Games on itch.io', text: 'dylan3737.itch.io', href: 'https://dylan3737.itch.io/' }
};

const RAVEN_SVG = '<svg class="raven" viewBox="0 0 64 40" aria-hidden="true"><path d="M2 21 C12 13 21 13 28 17 L33 6 L38 17 ' +
  'C46 14 55 16 62 23 C52 21 45 23 39 27 L35 37 L31 27 C21 28 11 26 2 21 Z"/><circle cx="35" cy="20" r="1.4"/></svg>';

export function sendRavens(notes) {
  let flock = document.getElementById('ravens');
  if (!flock) {
    flock = document.createElement('div');
    flock.id = 'ravens';
    flock.className = 'ravens';
    flock.setAttribute('role', 'status');
    document.body.appendChild(flock);
  }
  notes.forEach((note, i) => {
    const item = document.createElement('div');
    item.className = 'raven-note';
    item.style.animationDelay = (i * 0.25) + 's';
    item.innerHTML = RAVEN_SVG + '<div class="raven-card"><button type="button" class="raven-close" aria-label="Close">×</button>' +
      '<p></p><a></a>' + (note.copy ? '<button type="button" class="pill-btn">Copy</button>' : '') + '</div>';
    item.querySelector('p').textContent = note.label;
    const link = item.querySelector('a');
    link.textContent = note.text;
    link.href = note.href;
    if (note.copy) item.querySelector('.pill-btn').dataset.copy = note.copy;
    item.querySelector('.raven-close').addEventListener('click', () => item.remove());
    flock.appendChild(item);
    setTimeout(() => item.remove(), 14000);
  });
}

// Hourglass: time stops. A catch round's clock and its ghosts freeze, and so does the fluid.
let timeStopUntil = 0;

export function stopTime(ms) {
  timeStopUntil = Math.max(timeStopUntil, Date.now() + ms);
  fluid.freeze(ms);
  document.body.classList.add('is-timestop');
  clearTimeout(stopTime.timer);
  stopTime.timer = setTimeout(() => document.body.classList.remove('is-timestop'), timeStopUntil - Date.now());
}

let lanternTimer = null;

function moveLantern(x, y) {
  const root = document.documentElement;
  root.style.setProperty('--lx', x + 'px');
  root.style.setProperty('--ly', y + 'px');
}

export function lightLantern(ms, wide) {
  const c = ghostCenter();
  moveLantern(c.x, c.y);
  document.body.classList.add('is-lantern');
  if (wide) document.body.classList.add('is-vigil');
  clearTimeout(lanternTimer);
  lanternTimer = setTimeout(() => document.body.classList.remove('is-lantern', 'is-vigil'), ms || 5000);
}

window.addEventListener('pointermove', (e) => {
  if (document.body.classList.contains('is-lantern')) moveLantern(e.clientX, e.clientY);
});

export function burstHere(color) {
  const c = ghostCenter();
  fluid.burst(c.x, c.y, color);
}

export function reapSwing() {
  const ghost = document.getElementById('ghost-character');
  ghost.classList.remove('reaping');
  void ghost.offsetWidth;
  ghost.classList.add('reaping');
  spawnScythe();
  burstHere([0.6, 0.32, 0.36]);
  setTimeout(() => ghost.classList.remove('reaping'), 900);
}

// Hex slows every ghost in a running round. Returns how many it caught in it.
export function hexPrey() {
  const ghost = document.getElementById('ghost-character');
  const loose = looseGhosts();
  ghost.classList.remove('mana-glow');
  void ghost.offsetWidth;
  ghost.classList.add('mana-glow');
  if (loose.length && huntEnds > Date.now()) {
    hexed = true;
    loose.forEach((el) => el.classList.add('is-hexed'));
    popScore();
  }
  spawnHexMark();
  const c = ghostCenter();
  fluid.pulse(c.x, c.y);
  setTimeout(() => ghost.classList.remove('mana-glow'), 900);
  return loose.length;
}

// Siphon turns score back into soul, 5 soul per point.
export function siphonRefusal() {
  if (manaLevel >= 100) return 'Soul is full.';
  if (score <= 0) return 'Nothing to drain. Catch some ghosts.';
  return null;
}

export function siphon() {
  const take = Math.min(score, Math.ceil((100 - manaLevel) / 5));
  score -= take;
  paintScore();
  save('y2k-score', String(score));
  gainSoul(take * 5);
  floatSoul('+' + take * 5, 'is-gain');
  return take;
}

// Thrall: a raised ghost that hunts the others for a while and catches what it touches.
export function thrall(ms) {
  document.querySelectorAll('.thrall').forEach((el) => el.remove());
  const el = document.createElement('div');
  el.className = 'thrall';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 40 48"><path d="M4 46 V20 A16 16 0 0 1 36 20 V46 L30 40 L24 46 L20 40 L16 46 L10 40 Z"/>' +
    '<circle cx="14" cy="20" r="3"/><circle cx="26" cy="20" r="3"/></svg>';
  const start = ghostCenter();
  let x = start.x;
  let y = start.y;
  document.body.appendChild(el);
  const until = Date.now() + ms;
  const step = () => {
    if (Date.now() > until) {
      el.remove();
      return;
    }
    let goal = ghostCenter();
    let nearest = null;
    let best = Infinity;
    looseGhosts().forEach((g) => {
      const d = Math.hypot(g._x + 20 - x, g._y + 24 - y);
      if (d < best) { best = d; nearest = g; }
    });
    if (nearest) goal = { x: nearest._x + 20, y: nearest._y + 24 };
    const dx = goal.x - x;
    const dy = goal.y - y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = reducedMotion ? dist : Math.min(dist, 3.2);
    x += (dx / dist) * speed;
    y += (dy / dist) * speed;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    if (nearest && best < 34) nearest.click();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function spawnScythe() {
  const c = ghostCenter();
  const cut = document.createElement('div');
  cut.className = 'scythe-cut';
  cut.style.left = c.x + 'px';
  cut.style.top = c.y + 'px';
  document.body.appendChild(cut);
  setTimeout(() => cut.remove(), 520);
}

export function spawnHexMark() {
  const c = ghostCenter();
  const mark = document.createElement('div');
  mark.className = 'hex-mark';
  mark.style.left = c.x + 'px';
  mark.style.top = c.y + 'px';
  document.body.appendChild(mark);
  setTimeout(() => mark.remove(), 950);
}

let score;
let best;
let roundScore = 0;
score = parseInt(load('y2k-score', '0'), 10) || 0;
best = parseInt(load('y2k-best', '0'), 10) || 0;

export function bestScore() {
  return best;
}

function paintScore() {
  const el = document.getElementById('scoreCount');
  if (el) el.textContent = String(score).padStart(6, '0');
  const bestEl = document.getElementById('bestCount');
  if (bestEl) bestEl.textContent = String(best).padStart(2, '0');
}
paintScore();

export function showBadge(id) {
  const badge = document.getElementById(id);
  if (!badge) return;
  badge.classList.remove('is-secret');
  badge.classList.remove('is-pop');
  void badge.offsetWidth;
  if (!reducedMotion) badge.classList.add('is-pop');
}

function popScore() {
  showBadge('scoreBadge');
  save('y2k-score-seen', '1');
}

if (load('y2k-score-seen') === '1') document.getElementById('scoreBadge').classList.remove('is-secret');

function addScore(n) {
  score += n;
  roundScore += n;
  paintScore();
  save('y2k-score', String(score));
}

function spawnPrey(extraClass, count, points, label, ms) {
  const room = 8 - document.querySelectorAll('.prey-ghost:not(.is-caught)').length;
  const n = Math.min(count, room);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'prey-ghost' + (extraClass ? ' ' + extraClass : '');
    el.setAttribute('aria-label', label);
    const pad = 40;
    el._x = pad + Math.random() * Math.max(40, window.innerWidth - pad * 2 - 40);
    el._y = 72 + Math.random() * Math.max(40, window.innerHeight - 180);
    el._tx = el._x;
    el._ty = el._y;
    el._next = 0;
    el.style.left = el._x + 'px';
    el.style.top = el._y + 'px';
    if (hexed) el.classList.add('is-hexed');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.classList.contains('is-caught')) return;
      el.classList.add('is-caught');
      const feasting = feastUntil > Date.now();
      const worth = feasting ? points * 2 : points;
      addScore(worth);
      if (feasting) gainSoul(5);
      const pop = document.createElement('div');
      pop.className = 'soul-pop is-gain';
      pop.textContent = '+' + worth;
      pop.style.left = el.style.left;
      pop.style.top = el.style.top;
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 800);
      setTimeout(() => {
        el.remove();
        if (!document.querySelector('.prey-ghost:not(.is-caught)')) finishHunt();
      }, 260);
    });
    document.body.appendChild(el);
  }
  if (n) beginHunt(ms);
}

// Summon: five ghosts for ten seconds; rites can call bigger, longer rounds.
// Feast: until the round ends, catches are worth double and restore 5 soul.
let feastUntil = 0;

export function feast() {
  feastUntil = huntEnds;
  document.body.classList.add('is-feast');
}

// Borrowed Time: the running round gets longer, and golden ghosts worth 3 join it.
export function borrowTime(ms, golden) {
  if (!huntEnds) return false;
  huntEnds += ms;
  huntTotal += ms;
  if (feastUntil) feastUntil = huntEnds;
  spawnPrey('is-golden', golden, 3, 'Catch the golden ghost');
  paintHunt(huntEnds - Date.now());
  return true;
}

export function roundRunning() {
  return huntEnds > Date.now();
}

export function summonRound(count = 5, ms = HUNT_MS) {
  spawnFamiliars();
  spawnPrey('', count, 1, 'Catch', ms);
  burstHere([0.34, 0.54, 0.58]);
}

let huntEnds = 0;
let huntTick = null;
let huntFrame = null;

const HUNT_MS = 10000;
let huntTotal = HUNT_MS;

function beginHunt(ms = HUNT_MS) {
  if (!(huntEnds > Date.now())) roundScore = 0;
  huntEnds = Math.max(huntEnds, Date.now() + ms);
  huntTotal = Math.max(ms, huntEnds - Date.now());
  paintHunt(huntEnds - Date.now());
  lastTick = Date.now();
  if (!huntTick) huntTick = setInterval(tickHunt, 200);
  if (!reducedMotion && !huntFrame) huntFrame = requestAnimationFrame(movePrey);
}

let lastTick = 0;

function tickHunt() {
  const now = Date.now();
  // While time is stopped the round's clock doesn't run down.
  if (timeStopUntil > now) huntEnds += now - lastTick;
  lastTick = now;
  const left = huntEnds - now;
  if (left <= 0) finishHunt();
  else paintHunt(left);
}

// The ring around the reaper drains over the 10s catch round.
function paintHunt(left) {
  const ring = document.getElementById('huntRing');
  if (!ring) return;
  ring.hidden = left <= 0;
  ring.style.setProperty('--left', Math.max(0, left / huntTotal).toFixed(3));
  ring.classList.toggle('is-late', left > 0 && left < 3000);
}

function finishHunt() {
  if (!huntEnds) return;
  const caught = roundScore;
  roundScore = 0;
  hexed = false;
  huntEnds = 0;
  feastUntil = 0;
  document.body.classList.remove('is-feast');
  if (huntTick) clearInterval(huntTick);
  huntTick = null;
  paintHunt(0);
  document.querySelectorAll('.prey-ghost').forEach((node) => node.remove());
  if (caught > best) {
    best = caught;
    save('y2k-best', String(best));
    paintScore();
    const speech = document.getElementById('ghost-speech');
    if (speech) speech.textContent = 'New mark. ' + caught + '.';
  }
}

function movePrey(now) {
  const nodes = document.querySelectorAll('.prey-ghost:not(.is-caught)');
  if (!nodes.length || !huntEnds) {
    huntFrame = null;
    return;
  }
  const pad = 28;
  const maxX = Math.max(pad, window.innerWidth - pad - 40);
  const maxY = Math.max(80, window.innerHeight - 80);
  const still = boundUntil > Date.now() || timeStopUntil > Date.now();
  nodes.forEach((el) => {
    if (still) return;
    const step = hexed ? 0.012 : 0.045;
    if (now > el._next) {
      el._tx = pad + Math.random() * (maxX - pad);
      el._ty = 70 + Math.random() * (maxY - 70);
      el._next = now + (hexed ? 1500 : 600) + Math.random() * 800;
    }
    el._x += (el._tx - el._x) * step;
    el._y += (el._ty - el._y) * step;
    el.style.left = el._x + 'px';
    el.style.top = el._y + 'px';
  });
  huntFrame = requestAnimationFrame(movePrey);
}

function spawnFamiliars() {
  const host = document.getElementById('ghost-character');
  host.querySelectorAll('.familiar').forEach((node) => node.remove());
  [0, 1, 2].forEach((i) => {
    const el = document.createElement('span');
    el.className = 'familiar';
    el.style.animationDelay = (-i * 0.85) + 's';
    el.style.animationDuration = (2.2 + i * 0.35) + 's';
    host.appendChild(el);
  });
  setTimeout(() => host.querySelectorAll('.familiar').forEach((node) => node.remove()), 5600);
}
