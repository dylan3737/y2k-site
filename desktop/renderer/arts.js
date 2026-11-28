// His Arts: souls spent on the reaper himself (a keener scythe, a deeper
// hood, quieter rest, a longer reach), and the robes he can wear. A card
// with two tabs; the rules are in ../crypt.js (learn, dress).
import { el, chip } from './dom.js';

export function createArts(ctx) {
  const { card, companion, say, sound } = ctx;
  const owner = {};
  let tab = 'arts';

  const box = el('div', 'arts-card');
  const head = el('h2', null, 'HIS ARTS');
  const close = el('button', 'card-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.addEventListener('click', () => card.close(owner));
  head.appendChild(close);
  const tabs = el('div', 'row crypt-tabs');
  const tabChips = [['arts', 'Arts'], ['robes', 'Robes']].map(([id, label]) => {
    const c = chip(label, () => { tab = id; paint(); });
    c.dataset.tab = id;
    tabs.appendChild(c);
    return c;
  });
  const souls = el('p', 'muted');
  const page = el('div', 'arts-page');
  box.append(head, tabs, souls, page);

  const garden = () => ctx.crypt.get() || {};

  async function act(what) {
    const out = await companion.crypt(what);
    if (out.crypt) ctx.crypt.update(out.crypt);
    if (!out.ok) say(out.error, 3500);
    else sound.chime();
    paint();
    return out;
  }

  function artsPage(g) {
    for (const a of g.arts || []) {
      const item = el('div', 'crypt-item');
      const text = el('div');
      text.append(el('b', null, a.name + ' ' + a.level + '/' + a.max), el('span', 'muted', a.blurb + ' Now: ' + a.now + '.'));
      const get = chip(a.cost === null ? 'Done' : String(a.cost), () => act({ art: a.id }), 'solid');
      get.dataset.art = a.id;
      get.disabled = a.cost === null || (g.souls || 0) < a.cost;
      get.setAttribute('aria-label', a.cost === null ? a.name + ' is complete' : 'Learn ' + a.name + ' for ' + a.cost + ' souls');
      item.append(text, get);
      page.appendChild(item);
    }
  }

  function robesPage(g) {
    const row = el('div', 'arts-robes');
    for (const r of g.robes || []) {
      const swatch = el('button', 'arts-robe hit is-' + r.id + (r.worn ? ' is-worn' : ''));
      swatch.type = 'button';
      swatch.dataset.robe = r.id;
      swatch.append(el('span', 'arts-robe-swatch'), el('b', null, r.name), el('small', null, r.worn ? 'worn' : r.owned ? 'wear' : r.cost + ' souls'));
      swatch.disabled = !r.owned && (g.souls || 0) < r.cost;
      swatch.title = r.owned ? 'Wear the ' + r.name + ' robe' : 'Buy the ' + r.name + ' robe for ' + r.cost + ' souls';
      swatch.addEventListener('click', () => act({ robe: r.id }));
      row.appendChild(swatch);
    }
    page.appendChild(row);
  }

  function paint() {
    const g = garden();
    tabChips.forEach((c) => c.classList.toggle('is-on', c.dataset.tab === tab));
    souls.textContent = 'The garden holds ' + Math.floor(g.souls || 0) + ' souls.';
    page.replaceChildren();
    if (tab === 'robes') robesPage(g);
    else artsPage(g);
    card.refit();
  }

  // His robe, on him: the garden's state says which.
  function dress(robe) {
    const reaper = document.getElementById('reaper');
    if (reaper) reaper.dataset.robe = robe || 'crimson';
  }

  return {
    open(which) {
      if (which === 'arts' || which === 'robes') tab = which;
      paint();
      card.open(box, 'soul', owner);
    },
    close() { card.close(owner); },
    isOpen: () => card.isOpen(owner),
    dress,
    // An art's level, for the abilities and the rest that use it.
    level(id) {
      const a = (garden().arts || []).find((x) => x.id === id);
      return a ? a.level : 0;
    },
    refresh() { if (card.isOpen(owner)) paint(); }
  };
}
