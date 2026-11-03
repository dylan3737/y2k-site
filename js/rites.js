// Rites are recipes: three spells cast in one unbroken chain make a new spell.
// The rite fires that spell at once and adds it to the Spellbook for good.
// Result spells can be cast into higher rites too. Hints for rites not yet
// found are written in the dark, where the lantern can find them.
import { castSpell, SPELLS, SCHOOLS } from './spells.js';
import { showBadge } from './actions.js';
import { load, save, forget } from './store.js';

const RITES = [
  { result: 'tally', seq: ['reap', 'hex', 'summon'], spot: [10, 24],
    hint: 'Blade, then curse, then call: and he will count your catch.', effect: 'Shows your best catch.' },
  { result: 'harvest', seq: ['reap', 'reap', 'reap'], spot: [66, 20],
    hint: 'Swing thrice before the breath runs out.', effect: 'One great swing takes every ghost on screen.' },
  { result: 'eclipse', seq: ['hex', 'hex', 'hex'], spot: [8, 68],
    hint: 'Curse the sky until it bleeds.', effect: 'The fluid runs red for thirty seconds.' },
  { result: 'wraith', seq: ['hex', 'summon', 'reap'], spot: [62, 64],
    hint: 'What is cursed, then called, then cut, will sing.', effect: 'Plays the Wraith, a seventh song.' },
  { result: 'vigil', seq: ['lantern', 'lantern', 'lantern'], spot: [76, 42],
    hint: 'Three flames make a long night.', effect: 'The lantern burns wide for thirty seconds.' },
  { result: 'sigil', seq: ['lantern', 'hex', 'lantern'], spot: [4, 46],
    hint: 'Hold a curse between two lights.', effect: 'Burns a sigil into the dark.' },
  { result: 'legion', seq: ['raise', 'raise', 'raise'], spot: [26, 8],
    hint: 'Raise them, and raise them, and raise them all.', effect: 'Every project rises at once.' },
  { result: 'procession', seq: ['ferry', 'ferry', 'ferry'], spot: [80, 84],
    hint: 'Cross the river three times and the music never stops.', effect: 'Plays every song in turn.' },
  { result: 'murder', seq: ['raven', 'raven', 'raven'], spot: [86, 8],
    hint: 'Three black wings carry every word.', effect: 'Ravens bring every way to reach Dylan.' },
  { result: 'stasis', seq: ['hourglass', 'bind', 'hourglass'], spot: [30, 84],
    hint: 'Turn the glass, chain the dead, turn it back.', effect: 'Time stops for ten seconds.' },
  { result: 'thrall', seq: ['summon', 'raise', 'bind'], spot: [44, 14],
    hint: 'Call the dead, raise one more, and chain it to you.', effect: 'A raised ghost hunts the others for you.' },
  { result: 'requiem', seq: ['wraith', 'procession', 'vigil'], spot: [52, 90],
    hint: 'The haunting song, the endless crossing, the long night.', effect: 'Plays the Requiem, the last song.' },
  { result: 'danse', seq: ['thrall', 'harvest', 'procession'], spot: [88, 60],
    hint: 'Your servant, your scythe, your music: dance.', effect: 'A twenty-second round with eight ghosts, a thrall and a beat.' },
  { result: 'necropolis', seq: ['legion', 'murder', 'sigil'], spot: [16, 92],
    hint: 'All your works, all your words, and a mark to open the ground.', effect: 'Opens the graves of Dylan’s older projects.' }
];

// Old saves named rites by id; the six that survived carry over.
const RENAMED = { best: 'tally' };
let unlocked = [];
try { unlocked = JSON.parse(load('y2k-grimoire', 'null')); } catch (err) { unlocked = null; }
if (!Array.isArray(unlocked)) {
  let old = [];
  try { old = JSON.parse(load('y2k-rites', '[]')); } catch (err) { old = []; }
  if (load('y2k-best-seen') === '1') old.push('best');
  unlocked = [];
  old.map((id) => RENAMED[id] || id).forEach((id) => {
    if (RITES.some((r) => r.result === id) && unlocked.indexOf(id) === -1) unlocked.push(id);
  });
}

const listeners = [];
let combo = [];

export function isUnlocked(id) {
  return unlocked.indexOf(id) !== -1;
}

export function unlockedSpells() {
  return RITES.filter((r) => isUnlocked(r.result)).map((r) => r.result);
}

export function onUnlock(fn) {
  listeners.push(fn);
}

const allFound = () => unlocked.length === RITES.length;
const tierName = (tier) => ['', 'Rite', 'High rite'][tier];

// Called after every cast. When the last three casts match a rite, its spell
// fires (free) and is unlocked; that spell then starts the next chain, so
// result spells can lead into higher rites.
export function noteCast(id, chain, say) {
  combo = chain === 1 ? [id] : combo.concat(id).slice(-3);
  const rite = RITES.find((r) => r.seq.join() === combo.join());
  if (!rite) return;
  combo = [rite.result];
  const first = !isUnlocked(rite.result);
  if (first) {
    unlocked.push(rite.result);
    save('y2k-grimoire', JSON.stringify(unlocked));
    paintRites();
    showBadge('ritesBadge');
    listeners.forEach((fn) => fn(rite.result));
  }
  castSpell(rite.result, { free: true });
  if (first) {
    const name = SPELLS[rite.result].name;
    setTimeout(() => say(allFound() ? 'You know every rite.' : 'New spell: ' + name + '.'), 1800);
  }
}

function paintRites() {
  const count = document.getElementById('ritesCount');
  if (count) count.textContent = unlocked.length + '/' + RITES.length;
  document.getElementById('ritesBadge').classList.toggle('is-complete', allFound());
  const end = document.getElementById('grimoireEnd');
  if (end) end.hidden = !allFound();
  paintHints();
  const list = document.getElementById('riteList');
  if (!list) return;
  list.innerHTML = '';
  RITES.forEach((rite) => {
    const found = isUnlocked(rite.result);
    const spell = SPELLS[rite.result];
    const item = document.createElement('li');
    item.className = 'rite tier-' + spell.tier + (found ? ' is-found' : '');
    if (found) item.style.setProperty('--school', SCHOOLS[spell.school]);
    const name = document.createElement('h3');
    name.textContent = found ? spell.name : '???';
    const tier = document.createElement('span');
    tier.className = 'rite-tier';
    tier.textContent = tierName(spell.tier);
    name.append(' ', tier);
    const line = document.createElement('p');
    line.textContent = found ? rite.seq.map((id) => SPELLS[id].name).join(' · ') : rite.hint;
    item.append(name, line);
    if (found) {
      const effect = document.createElement('p');
      effect.className = 'rite-effect';
      effect.textContent = rite.effect;
      item.append(effect);
    }
    list.appendChild(item);
  });
}

// Only rites not yet found leave their hints in the dark.
function paintHints() {
  const layer = document.getElementById('riteHints');
  if (!layer) return;
  layer.innerHTML = '';
  RITES.filter((r) => !isUnlocked(r.result)).forEach((rite) => {
    const span = document.createElement('span');
    span.textContent = rite.hint;
    span.style.left = rite.spot[0] + '%';
    span.style.top = rite.spot[1] + '%';
    layer.appendChild(span);
  });
}

export function riteHint() {
  const open = RITES.filter((r) => !isUnlocked(r.result) && r.seq.every((id) => SPELLS[id].tier === 0 || isUnlocked(id)));
  return open.length ? open[Math.floor(Math.random() * open.length)].hint : null;
}

// "Forget" asks once more before wiping rites, spells and scores, then reloads.
function setUpForget() {
  const ask = document.getElementById('forgetAsk');
  const confirm = document.getElementById('forgetConfirm');
  if (!ask || !confirm) return;
  ask.addEventListener('click', () => {
    ask.hidden = true;
    confirm.hidden = false;
    document.getElementById('forgetYes').focus();
  });
  document.getElementById('forgetNo').addEventListener('click', () => {
    confirm.hidden = true;
    ask.hidden = false;
    ask.focus();
  });
  document.getElementById('forgetYes').addEventListener('click', () => {
    forget(['y2k-grimoire', 'y2k-rites', 'y2k-pins', 'y2k-best', 'y2k-best-seen', 'y2k-score', 'y2k-score-seen']);
    location.reload();
  });
}

(function setUpRites() {
  if (unlocked.length) document.getElementById('ritesBadge').classList.remove('is-secret');
  if (isUnlocked('tally')) document.getElementById('bestBadge').classList.remove('is-secret');
  if (isUnlocked('wraith')) unsealWraith();
  onUnlock((id) => { if (id === 'wraith') unsealWraith(); });
  setUpForget();
  paintRites();
})();

function unsealWraith() {
  const mark = document.querySelector('.song-mark[data-song="6"]');
  if (mark) mark.classList.remove('is-sealed');
}
