// The reaper's actions, his soul, and the ghost-catching round.
import * as fluid from './fluid.js';
import { noteCombo } from './rites.js';
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

function spendSoul(cost, speech) {
  if (manaLevel < cost) {
    speech.textContent = 'Empty. Seal a pact.';
    floatSoul('EMPTY', 'is-need');
    return false;
  }
  const now = Date.now();
  chain = now - lastCast < 2200 ? chain + 1 : 1;
  lastCast = now;
  manaLevel -= cost;
  if (chain >= 2) manaLevel = Math.min(100, manaLevel + 5);
  syncMana();
  floatSoul(chain >= 2 ? '-' + cost + ' x' + chain : '-' + cost);
  return true;
}

export function ghostAction(type) {
  const speech = document.getElementById('ghost-speech');
  const ghost = document.getElementById('ghost-character');

  ghost.classList.remove('reaping', 'mana-glow');

  if (type === 'hex') {
    if (!spendSoul(25, speech)) return;
    const loose = document.querySelectorAll('.prey-ghost:not(.is-caught)');
    speech.textContent = loose.length ? 'They crawl.' : 'Hexed.';
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

  } else if (type === 'summon') {
    if (!spendSoul(30, speech)) return;
    speech.textContent = 'Ten seconds. Catch them.';
    spawnFamiliars();
    spawnCatchGhosts();
    burstHere();

  } else if (type === 'reap') {
    if (!spendSoul(15, speech)) return;
    speech.textContent = 'Reaped.';
    ghost.classList.add('reaping');
    spawnScythe();
    burstHere();
    setTimeout(() => ghost.classList.remove('reaping'), 900);

  } else if (type === 'lantern') {
    if (!spendSoul(10, speech)) return;
    speech.textContent = 'Look closer.';
    lightLantern();
  }

  noteCombo(type, speech, chain);
}

// The lantern follows the pointer for 5s and shows what is written in the dark.
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

function burstHere() {
  const c = ghostCenter();
  fluid.burst(c.x, c.y);
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

function spawnHexMark() {
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

function spawnPrey(extraClass, count, points, label) {
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
      addScore(points);
      const pop = document.createElement('div');
      pop.className = 'soul-pop is-gain';
      pop.textContent = '+' + points;
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
  if (n) beginHunt();
}

function spawnCatchGhosts() {
  spawnPrey('', 5, 1, 'Catch');
}

let huntEnds = 0;
let huntTick = null;
let huntFrame = null;

function beginHunt() {
  if (!(huntEnds > Date.now())) roundScore = 0;
  huntEnds = Date.now() + 10000;
  paintHunt(10000);
  if (!huntTick) huntTick = setInterval(tickHunt, 200);
  if (!reducedMotion && !huntFrame) huntFrame = requestAnimationFrame(movePrey);
}

function tickHunt() {
  const left = huntEnds - Date.now();
  if (left <= 0) finishHunt();
  else paintHunt(left);
}

// The ring around the reaper drains over the 10s catch round.
function paintHunt(left) {
  const ring = document.getElementById('huntRing');
  if (!ring) return;
  ring.hidden = left <= 0;
  ring.style.setProperty('--left', Math.max(0, left / 10000).toFixed(3));
  ring.classList.toggle('is-late', left > 0 && left < 3000);
}

function finishHunt() {
  if (!huntEnds) return;
  const caught = roundScore;
  roundScore = 0;
  hexed = false;
  huntEnds = 0;
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
  nodes.forEach((el) => {
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
