// The Spellbook: four pinned spells sit under the reaper, and a panel lists every
// spell he knows, grouped by tier, to cast or pin.
import { SPELLS, castSpell } from './spells.js';
import { unlockedSpells, onUnlock } from './rites.js';
import { syncMana } from './actions.js';
import { load, save } from './store.js';

const MAX_PINS = 4;
const DEFAULT_PINS = ['reap', 'summon', 'hex', 'lantern'];
const GROUPS = [
  { tier: 0, title: 'Spells' },
  { tier: 1, title: 'Rites' },
  { tier: 2, title: 'High rites' }
];

const tray = document.querySelector('.ghost-actions');
const book = document.getElementById('spellbook');
const list = document.getElementById('spellbookList');

const known = (id) => SPELLS[id] && (SPELLS[id].tier === 0 || unlockedSpells().indexOf(id) !== -1);

let pins = [];
try { pins = JSON.parse(load('y2k-pins', 'null')); } catch (err) { pins = null; }
if (!Array.isArray(pins)) pins = DEFAULT_PINS.slice();
pins = pins.filter(known).slice(0, MAX_PINS);

function spellButton(id) {
  const spell = SPELLS[id];
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'spell-btn tier-' + spell.tier;
  btn.dataset.spell = id;
  btn.dataset.cost = spell.cost;
  btn.append(spell.name);
  const cost = document.createElement('span');
  cost.textContent = spell.cost;
  btn.append(cost);
  return btn;
}

function renderTray() {
  tray.innerHTML = '';
  pins.forEach((id) => tray.appendChild(spellButton(id)));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'spellbook-toggle';
  toggle.setAttribute('aria-controls', 'spellbook');
  toggle.setAttribute('aria-expanded', book.hidden ? 'false' : 'true');
  toggle.textContent = 'Spellbook';
  tray.appendChild(toggle);
}

function renderBook() {
  list.innerHTML = '';
  GROUPS.forEach((group) => {
    const ids = Object.keys(SPELLS).filter((id) => SPELLS[id].tier === group.tier);
    const shown = ids.filter(known);
    const section = document.createElement('section');
    section.className = 'spellbook-group';
    const h3 = document.createElement('h3');
    h3.textContent = group.title;
    if (group.tier > 0) h3.append(' ', Object.assign(document.createElement('span'), { textContent: shown.length + '/' + ids.length }));
    section.appendChild(h3);
    if (!shown.length) {
      const p = document.createElement('p');
      p.className = 'spellbook-empty';
      p.textContent = group.tier === 1 ? 'Cast three spells in one breath to find a rite.' : 'Cast three rites in one breath.';
      section.appendChild(p);
    }
    const ul = document.createElement('ul');
    shown.forEach((id) => {
      const li = document.createElement('li');
      li.appendChild(spellButton(id));
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pin-btn';
      pin.dataset.pin = id;
      const pinned = pins.indexOf(id) !== -1;
      pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      pin.setAttribute('aria-label', (pinned ? 'Unpin ' : 'Pin ') + SPELLS[id].name);
      pin.textContent = pinned ? '★' : '☆';
      li.appendChild(pin);
      ul.appendChild(li);
    });
    section.appendChild(ul);
    list.appendChild(section);
  });
}

function render() {
  renderTray();
  renderBook();
  syncMana();
}

function togglePin(id) {
  const at = pins.indexOf(id);
  if (at !== -1) pins.splice(at, 1);
  else {
    pins.push(id);
    if (pins.length > MAX_PINS) pins.shift();
  }
  save('y2k-pins', JSON.stringify(pins));
  render();
  const again = list.querySelector('[data-pin="' + id + '"]');
  if (again) again.focus();
}

function setOpen(open) {
  book.hidden = !open;
  const toggle = tray.querySelector('.spellbook-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) {
    const first = list.querySelector('.spell-btn');
    if (first) first.focus();
  } else if (toggle) {
    toggle.focus();
  }
}

function onClick(e) {
  const cast = e.target.closest('[data-spell]');
  if (cast) {
    castSpell(cast.dataset.spell);
    return;
  }
  const pin = e.target.closest('[data-pin]');
  if (pin) {
    togglePin(pin.dataset.pin);
    return;
  }
  if (e.target.closest('.spellbook-toggle')) setOpen(book.hidden);
  if (e.target.closest('.spellbook-close')) setOpen(false);
}

tray.addEventListener('click', onClick);
book.addEventListener('click', onClick);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !book.hidden) setOpen(false);
});
// Opening the Grimoire from the Spellbook closes the Spellbook.
book.addEventListener('click', (e) => { if (e.target.closest('[data-open-modal]')) book.hidden = true; });
onUnlock(render);
render();
