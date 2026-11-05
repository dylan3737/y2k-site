// Every spell the reaper knows: the ten base spells, and the result spells that
// rites (three casts in one chain) unlock. Casting goes through castSpell().
import * as audio from './audio.js';
import * as fluid from './fluid.js';
import {
  spendSoul, chainLength, looseGhosts, bindPrey, hexPrey, reapSwing, summonRound, raiseProject, nextRaise,
  ferry, sendRavens, RAVEN_NOTES, stopTime, lightLantern, siphon, siphonRefusal, thrall, showBadge, bestScore,
  feast, borrowTime, roundRunning
} from './actions.js';
import { games } from './games.js';
import { noteCast, isUnlocked } from './rites.js';
import { load, save } from './store.js';

// Each school of magic has a colour: buttons, Grimoire entries and the
// fluid bursts of its spells all use it.
export const SCHOOLS = {
  death: '#ff9aa8',
  spirit: '#9ee7f2',
  curse: '#c8b3ff',
  light: '#ffe29a',
  time: '#a6ecd6',
  message: '#a9bdff',
  music: '#ffb3d9',
  soul: '#c4f5a4'
};

const WRAITH_SONG = 6;
const REQUIEM_SONG = 7;
const BEAT_SONG = 0;

export const SPELLS = {
  // --- Base spells ---
  reap: {
    name: 'Reap', cost: 15, tier: 0, school: 'death',
    cast(say) { reapSwing(); say('Reaped.'); }
  },
  summon: {
    name: 'Summon', cost: 30, tier: 0, school: 'spirit',
    cast(say) { summonRound(); say('Ten seconds. Catch them.'); }
  },
  hex: {
    name: 'Hex', cost: 25, tier: 0, school: 'curse',
    cast(say) { say(hexPrey() ? 'They crawl.' : 'Hexed.'); }
  },
  lantern: {
    name: 'Lantern', cost: 10, tier: 0, school: 'light',
    cast(say) { lightLantern(); say('Look closer.'); }
  },
  bind: {
    name: 'Bind', cost: 20, tier: 0, school: 'curse',
    ready: () => looseGhosts().length ? null : 'Nothing to bind.',
    cast(say) { bindPrey(4000); say('Bound.'); }
  },
  raise: {
    name: 'Raise', cost: 20, tier: 0, school: 'spirit',
    cast(say) {
      const index = nextRaise();
      raiseProject(index);
      say('Rise, ' + games[index].title + '.');
    }
  },
  ferry: {
    name: 'Ferry', cost: 10, tier: 0, school: 'music',
    cast(say) { ferry(say); }
  },
  raven: {
    name: 'Raven', cost: 5, tier: 0, school: 'message',
    cast(say) { sendRavens([RAVEN_NOTES.email]); say('A message for Dylan.'); }
  },
  hourglass: {
    name: 'Hourglass', cost: 25, tier: 0, school: 'time',
    cast(say) { stopTime(3000); say('Time waits.'); }
  },
  siphon: {
    name: 'Siphon', cost: 0, tier: 0, school: 'soul',
    ready: siphonRefusal,
    cast(say) { say('Drained ' + siphon() + '.'); }
  },

  // --- Tier 1: three base casts ---
  tally: {
    name: 'Tally', cost: 5, tier: 1, school: 'light',
    cast(say) {
      showBadge('bestBadge');
      say(bestScore() ? 'Your best: ' + bestScore() + '.' : 'No mark yet.');
    }
  },
  harvest: {
    name: 'Harvest', cost: 35, tier: 1, school: 'death',
    cast(say) {
      const sweep = document.createElement('div');
      sweep.className = 'harvest-sweep';
      document.body.appendChild(sweep);
      setTimeout(() => sweep.remove(), 900);
      looseGhosts().forEach((el, i) => setTimeout(() => el.click(), 120 + i * 70));
      say('Harvest.');
    }
  },
  eclipse: {
    name: 'Eclipse', cost: 30, tier: 1, school: 'curse',
    cast(say) {
      fluid.eclipse(30000);
      document.body.classList.add('is-eclipse');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => document.body.classList.remove('is-eclipse'), 30000);
      say('Eclipse.');
    }
  },
  wraith: {
    name: 'Wraith', cost: 10, tier: 1, school: 'music',
    cast(say) {
      openMusicBox();
      audio.playAt(WRAITH_SONG);
      say('Wraith.');
    }
  },
  vigil: {
    name: 'Vigil', cost: 25, tier: 1, school: 'light',
    cast(say) { lightLantern(30000, true); say('Vigil.'); }
  },
  sigil: {
    name: 'Sigil', cost: 20, tier: 1, school: 'curse',
    cast(say) {
      const sigil = document.createElement('div');
      sigil.className = 'sigil';
      sigil.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38"/>' +
        '<path d="M50 8 L86 71 L14 71 Z M50 92 L14 29 L86 29 Z"/></svg>';
      document.body.appendChild(sigil);
      setTimeout(() => sigil.remove(), 8000);
      fluid.sigil();
      say('Marked.');
    }
  },
  legion: {
    name: 'Legion', cost: 40, tier: 1, school: 'spirit',
    cast(say) { showGallery('legion', 'Every project rises', games.map(gameEntry)); say('Rise, all of you.'); }
  },
  procession: {
    name: 'Procession', cost: 20, tier: 1, school: 'music',
    cast(say) {
      openMusicBox();
      audio.procession(playableSongs());
      say('Every song, in turn.');
    }
  },
  flock: {
    name: 'Flock', cost: 10, tier: 1, school: 'message',
    cast(say) { sendRavens([RAVEN_NOTES.email, RAVEN_NOTES.github, RAVEN_NOTES.itch]); say('Say hello.'); }
  },
  stasis: {
    name: 'Stasis', cost: 45, tier: 1, school: 'time',
    cast(say) { stopTime(10000); say('Stasis.'); }
  },
  thrall: {
    name: 'Thrall', cost: 30, tier: 1, school: 'spirit',
    cast(say) { thrall(15000); say('Hunt for me.'); }
  },
  feast: {
    name: 'Feast', cost: 25, tier: 1, school: 'soul',
    ready: () => roundRunning() ? null : 'Nothing to feast on.',
    cast(say) { feast(); say('Feast. Double souls.'); }
  },
  borrowed: {
    name: 'Borrowed Time', cost: 35, tier: 1, school: 'time',
    ready: () => roundRunning() ? null : 'No round to borrow for.',
    cast(say) { borrowTime(10000, 3); say('Ten more seconds.'); }
  },

  // --- Tier 2: three tier-1 spells ---
  requiem: {
    name: 'Requiem', cost: 15, tier: 2, school: 'music',
    cast(say) {
      openMusicBox();
      audio.playAt(REQUIEM_SONG);
      say('Requiem.');
    }
  },
  danse: {
    name: 'Danse Macabre', cost: 50, tier: 2, school: 'death',
    cast(say) {
      summonRound(8, 20000);
      thrall(20000);
      openMusicBox();
      audio.playAt(BEAT_SONG);
      say('Dance.');
    }
  },
  necropolis: {
    name: 'Necropolis', cost: 20, tier: 2, school: 'spirit',
    cast(say) { showGallery('necropolis', 'The old graves', OLD_PROJECTS); say('The old graves open.'); }
  }
};

// Dylan's earlier public projects, shown by Necropolis.
const OLD_PROJECTS = [
  ['Gambit', 'gambit'],
  ['Ruinborne site', 'ruinborne-site'],
  ['Weather app', 'weather-app'],
  ['Etch-a-Sketch', 'etch-a-sketch'],
  ['Rock Paper Scissors', 'rps_js'],
  ['Tic-Tac-Toe', 'TTT'],
  ['Odin landing page', 'odin-landing-page'],
  ['Odin recipes', 'odin-recipes'],
  ['First Rails app', 'my_first_rails_app']
].map(([title, repo]) => ({ title, href: 'https://github.com/dylan3737/' + repo, link: 'On GitHub' }));

function gameEntry(game) {
  return { title: game.title, img: game.img, href: game.href, link: game.link };
}

function playableSongs() {
  return [...document.querySelectorAll('.song-mark:not(.is-sealed)')].map((m) => Number(m.dataset.song));
}

function openMusicBox() {
  const ring = document.querySelector('.song-ring');
  const musicTab = document.getElementById('musicTab');
  if (ring && !ring.classList.contains('is-open') && musicTab) musicTab.click();
}

// Legion and Necropolis lay their projects out as cards across the middle of the page.
function showGallery(kind, title, entries) {
  document.querySelectorAll('.gallery').forEach((el) => el.remove());
  const wrap = document.createElement('section');
  wrap.className = 'gallery is-' + kind;
  wrap.setAttribute('aria-label', title);
  const head = document.createElement('div');
  head.className = 'gallery-head';
  head.innerHTML = '<h2></h2><button type="button" class="gallery-close" aria-label="Close">×</button>';
  head.querySelector('h2').textContent = title;
  wrap.appendChild(head);
  const row = document.createElement('div');
  row.className = 'gallery-row';
  entries.forEach((entry, i) => {
    const card = document.createElement('a');
    card.className = 'gallery-card';
    card.href = entry.href;
    card.style.animationDelay = (i * 0.12) + 's';
    if (entry.img) {
      const img = document.createElement('img');
      img.src = entry.img;
      img.alt = '';
      img.width = 420;
      img.height = 333;
      card.appendChild(img);
    }
    const name = document.createElement('strong');
    name.textContent = entry.title;
    const link = document.createElement('span');
    link.textContent = entry.link;
    card.append(name, link);
    row.appendChild(card);
  });
  wrap.appendChild(row);
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  head.querySelector('.gallery-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
}

// Cast from a button: check it's ready, pay for it, run it, and let the rites
// see it. `free` is for result spells fired by the rite that unlocked them.
export function castSpell(id, { free = false } = {}) {
  const spell = SPELLS[id];
  const speech = document.getElementById('ghost-speech');
  const say = (text) => { if (speech) speech.textContent = text; };
  if (!spell || (spell.tier > 0 && !free && !isUnlocked(id))) return;
  const refusal = spell.ready ? spell.ready() : null;
  if (refusal) {
    say(refusal);
    return;
  }
  if (!free && !spendSoul(spell.cost, speech)) return;
  spell.cast(say);
  noteCast(id, chainLength(), say);
  if (!free) teachOnce(speech);
}

const LESSON = [
  'Three spells in one breath make a rite.',
  'Watch the pips under me. Try Reap, Reap, Reap.',
  'Rites become spells. The Spellbook keeps them.'
];

function teachOnce(speech) {
  if (!speech || load('y2k-taught') === '1') return;
  save('y2k-taught', '1');
  let expected = speech.textContent;
  LESSON.forEach((line, i) => {
    setTimeout(() => {
      if (speech.textContent !== expected) return;
      speech.textContent = line;
      expected = line;
    }, 2600 + i * 3800);
  });
}
