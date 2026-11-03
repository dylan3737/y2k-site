// Rites: three actions cast in one unbroken chain unlock something.
// Each rite's hint is written in the dark, where the lantern can find it.
import * as audio from './audio.js';
import * as fluid from './fluid.js';
import { showBadge, bestScore, lightLantern, shake, shroud, summonGhosts, huntEndsAt } from './actions.js';
import { load, save, forget } from './store.js';

const WRAITH_SONG = 6;
const REQUIEM_SONG = 7;

const RITES = [
  {
    id: 'best', name: 'Tally', seq: ['reap', 'hex', 'summon'], spot: [10, 24],
    hint: 'Blade, then curse, then call: and he will count your catch.',
    effect: 'Shows your best catch.',
    cast(speech) {
      showBadge('bestBadge');
      speech.textContent = bestScore() ? 'Your best: ' + bestScore() + '.' : 'No mark yet.';
    }
  },
  {
    id: 'harvest', name: 'Harvest', seq: ['reap', 'reap', 'reap'], spot: [66, 20],
    hint: 'Swing thrice before the breath runs out.',
    effect: 'One great swing takes every ghost on screen.',
    cast(speech) {
      speech.textContent = 'Harvest.';
      const sweep = document.createElement('div');
      sweep.className = 'harvest-sweep';
      document.body.appendChild(sweep);
      setTimeout(() => sweep.remove(), 900);
      document.querySelectorAll('.prey-ghost:not(.is-caught)').forEach((el, i) => {
        setTimeout(() => el.click(), 120 + i * 70);
      });
    }
  },
  {
    id: 'eclipse', name: 'Eclipse', seq: ['hex', 'hex', 'hex'], spot: [8, 68],
    hint: 'Curse the sky until it bleeds.',
    effect: 'The fluid runs red for thirty seconds.',
    cast(speech) {
      speech.textContent = 'Eclipse.';
      fluid.eclipse(30000);
      document.body.classList.add('is-eclipse');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => document.body.classList.remove('is-eclipse'), 30000);
    }
  },
  {
    id: 'wraith', name: 'Wraith', seq: ['hex', 'summon', 'reap'], spot: [62, 64],
    hint: 'What is cursed, then called, then cut, will sing.',
    effect: 'Wakes a seventh song.',
    cast(speech, first) {
      unsealWraith();
      openMusicBox();
      audio.playAt(WRAITH_SONG);
      speech.textContent = first ? 'A new song wakes.' : 'Wraith.';
    }
  },
  {
    id: 'vigil', name: 'Vigil', seq: ['lantern', 'lantern', 'lantern'], spot: [76, 42],
    hint: 'Three flames make a long night.',
    effect: 'The lantern burns wide for thirty seconds.',
    cast(speech) {
      speech.textContent = 'Vigil.';
      lightLantern(30000, true);
    }
  },
  {
    id: 'sigil', name: 'Sigil', seq: ['lantern', 'hex', 'lantern'], spot: [4, 46],
    hint: 'Hold a curse between two lights.',
    effect: 'Burns a sigil into the dark.',
    cast(speech) {
      speech.textContent = 'Marked.';
      const sigil = document.createElement('div');
      sigil.className = 'sigil';
      sigil.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38"/>' +
        '<path d="M50 8 L86 71 L14 71 Z M50 92 L14 29 L86 29 Z"/></svg>';
      document.body.appendChild(sigil);
      setTimeout(() => sigil.remove(), 8000);
      fluid.sigil();
    }
  },
  {
    id: 'banshee', name: 'Banshee', seq: ['wail', 'wail', 'wail'], spot: [80, 84],
    hint: 'Scream until the walls shake.',
    effect: 'The page shakes and the fluid storms.',
    cast(speech) {
      speech.textContent = 'BANSHEE.';
      audio.cry(1.8);
      fluid.storm();
      shake(1400);
    }
  },
  {
    id: 'seance', name: 'Séance', seq: ['shroud', 'summon', 'shroud'], spot: [26, 8],
    hint: 'Call them from behind the veil, and stay hidden.',
    effect: 'A longer round with more ghosts, and they come to him.',
    cast(speech) {
      speech.textContent = 'They answer.';
      summonGhosts(8, 20000);
      shroud(Math.max(0, huntEndsAt() - Date.now()));
    }
  }
];

let combo = [];
let ritesFound = [];
try { ritesFound = JSON.parse(load('y2k-rites', '[]')); } catch (err) { ritesFound = []; }
if (load('y2k-best-seen') === '1' && ritesFound.indexOf('best') === -1) ritesFound.push('best');
ritesFound = ritesFound.filter((id) => RITES.some((r) => r.id === id));

const isFound = (id) => ritesFound.indexOf(id) !== -1;
const allFound = () => ritesFound.length === RITES.length;

export function noteCombo(type, speech, chain) {
  combo = chain === 1 ? [type] : combo.concat(type).slice(-3);
  const rite = RITES.find((r) => r.seq.join() === combo.join());
  if (!rite) return;
  combo = [];
  const first = !isFound(rite.id);
  if (first) {
    ritesFound.push(rite.id);
    save('y2k-rites', JSON.stringify(ritesFound));
    paintRites();
    showBadge('ritesBadge');
  }
  rite.cast(speech, first);
  if (first && allFound()) {
    setTimeout(() => { speech.textContent = 'You know every rite.'; }, 2200);
    setTimeout(() => {
      openMusicBox();
      audio.playAt(REQUIEM_SONG);
    }, 3200);
  }
}

function openMusicBox() {
  const ring = document.querySelector('.song-ring');
  const musicTab = document.getElementById('musicTab');
  if (ring && !ring.classList.contains('is-open') && musicTab) musicTab.click();
}

function unsealWraith() {
  const mark = document.querySelector('.song-mark[data-song="' + WRAITH_SONG + '"]');
  if (mark) mark.classList.remove('is-sealed');
}

function paintRites() {
  const count = document.getElementById('ritesCount');
  if (count) count.textContent = ritesFound.length + '/' + RITES.length;
  document.getElementById('ritesBadge').classList.toggle('is-complete', allFound());
  const end = document.getElementById('grimoireEnd');
  if (end) end.hidden = !allFound();
  const list = document.getElementById('riteList');
  if (!list) return;
  list.innerHTML = '';
  RITES.forEach((rite) => {
    const found = isFound(rite.id);
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

export function riteHint() {
  const open = RITES.filter((r) => !isFound(r.id));
  return open.length ? open[Math.floor(Math.random() * open.length)].hint : null;
}

// "Forget" asks once more before wiping rites and scores, then reloads.
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
    forget(['y2k-rites', 'y2k-best', 'y2k-best-seen', 'y2k-score', 'y2k-score-seen']);
    location.reload();
  });
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
  if (isFound('best')) document.getElementById('bestBadge').classList.remove('is-secret');
  if (isFound('wraith')) unsealWraith();
  const requiem = document.getElementById('playRequiem');
  if (requiem) requiem.addEventListener('click', () => audio.playAt(REQUIEM_SONG));
  setUpForget();
  paintRites();
})();
