// Rites: three actions cast in one unbroken chain unlock something.
import * as audio from './audio.js';
import * as fluid from './fluid.js';
import { showBadge, bestScore, lightLantern } from './actions.js';
import { load, save } from './store.js';


// The lantern shows their hints.
const RITES = [
  { id: 'best', name: 'Tally', seq: ['reap', 'hex', 'summon'], hint: 'Cut, curse, call.', effect: 'Shows your best catch.', spot: [10, 24] },
  { id: 'harvest', name: 'Harvest', seq: ['reap', 'reap', 'reap'], hint: 'Three cuts, one breath.', effect: 'One great swing takes every ghost on screen.', spot: [66, 20] },
  { id: 'eclipse', name: 'Eclipse', seq: ['hex', 'hex', 'hex'], hint: 'Curse the dark three times.', effect: 'The fluid runs red for thirty seconds.', spot: [8, 68] },
  { id: 'wraith', name: 'Wraith', seq: ['hex', 'summon', 'reap'], hint: 'Curse, call, cut.', effect: 'Wakes a seventh song.', spot: [62, 64] },
  { id: 'vigil', name: 'Vigil', seq: ['lantern', 'lantern', 'lantern'], hint: 'Keep the light three times.', effect: 'The lantern burns wide for thirty seconds.', spot: [76, 42] },
  { id: 'sigil', name: 'Sigil', seq: ['lantern', 'hex', 'lantern'], hint: 'Light, curse, light.', effect: 'Burns a sigil into the dark.', spot: [4, 46] }
];
let combo = [];
let ritesFound = [];
try { ritesFound = JSON.parse(load('y2k-rites', '[]')); } catch (err) { ritesFound = []; }
if (load('y2k-best-seen') === '1' && ritesFound.indexOf('best') === -1) ritesFound.push('best');

export function noteCombo(type, speech, chain) {
  combo = chain === 1 ? [type] : combo.concat(type).slice(-3);
  const rite = RITES.find((r) => r.seq.join() === combo.join());
  if (!rite) return;
  combo = [];
  const first = ritesFound.indexOf(rite.id) === -1;
  if (first) {
    ritesFound.push(rite.id);
    save('y2k-rites', JSON.stringify(ritesFound));
    paintRites();
    showBadge('ritesBadge');
  }
  castRite(rite.id, speech, first);
}

function castRite(id, speech, first) {
  if (id === 'best') {
    showBadge('bestBadge');
    speech.textContent = bestScore() ? 'Your best: ' + bestScore() + '.' : 'No mark yet.';
  } else if (id === 'harvest') {
    speech.textContent = 'Harvest.';
    const sweep = document.createElement('div');
    sweep.className = 'harvest-sweep';
    document.body.appendChild(sweep);
    setTimeout(() => sweep.remove(), 900);
    document.querySelectorAll('.prey-ghost:not(.is-caught)').forEach((el, i) => {
      setTimeout(() => el.click(), 120 + i * 70);
    });
  } else if (id === 'eclipse') {
    speech.textContent = 'Eclipse.';
    fluid.eclipse(30000);
    document.body.classList.add('is-eclipse');
    clearTimeout(castRite.eclipseTimer);
    castRite.eclipseTimer = setTimeout(() => document.body.classList.remove('is-eclipse'), 30000);
  } else if (id === 'wraith') {
    unsealWraith();
    const ring = document.querySelector('.song-ring');
    const musicTab = document.getElementById('musicTab');
    if (ring && !ring.classList.contains('is-open') && musicTab) musicTab.click();
    audio.playAt(6);
    speech.textContent = first ? 'A new song wakes.' : 'Wraith.';
  } else if (id === 'vigil') {
    speech.textContent = 'Vigil.';
    lightLantern(30000, true);
  } else if (id === 'sigil') {
    speech.textContent = 'Marked.';
    const sigil = document.createElement('div');
    sigil.className = 'sigil';
    sigil.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38"/>' +
      '<path d="M50 8 L86 71 L14 71 Z M50 92 L14 29 L86 29 Z"/></svg>';
    document.body.appendChild(sigil);
    setTimeout(() => sigil.remove(), 8000);
    fluid.sigil();
  }
}

function unsealWraith() {
  const mark = document.querySelector('.song-mark[data-song="6"]');
  if (mark) mark.classList.remove('is-sealed');
}

function paintRites() {
  const count = document.getElementById('ritesCount');
  if (count) count.textContent = ritesFound.length + '/' + RITES.length;
  const list = document.getElementById('riteList');
  if (list) {
    list.innerHTML = '';
    RITES.forEach((rite) => {
      const found = ritesFound.indexOf(rite.id) !== -1;
      const item = document.createElement('li');
      item.className = 'rite' + (found ? ' is-found' : '');
      const name = document.createElement('h3');
      name.textContent = found ? rite.name : '???';
      const line = document.createElement('p');
      line.textContent = found ? rite.seq.join(' · ') : rite.hint;
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
}

export function riteHint() {
  const open = RITES.filter((r) => ritesFound.indexOf(r.id) === -1);
  return open.length ? open[Math.floor(Math.random() * open.length)].hint : null;
}

(function setUpRites() {
  const layer = document.getElementById('riteHints');
  if (layer) {
    RITES.forEach((rite) => {
      const span = document.createElement('span');
      span.textContent = rite.hint;
      span.style.left = rite.spot[0] + '%';
      span.style.top = rite.spot[1] + '%';
      layer.appendChild(span);
    });
  }
  if (ritesFound.length) document.getElementById('ritesBadge').classList.remove('is-secret');
  if (ritesFound.indexOf('best') !== -1) document.getElementById('bestBadge').classList.remove('is-secret');
  if (ritesFound.indexOf('wraith') !== -1) unsealWraith();
  paintRites();
})();
