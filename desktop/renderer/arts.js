// His Arts: souls spent on the reaper himself (a keener scythe, a deeper
// hood, quieter rest, a longer reach), the robes he can wear, the blades he
// swings, and the altar (offerings with no end, and two shrines). A card with
// four tabs; the rules are in ../crypt.js (learn, dress, wield, offer,
// quicken, rouse).
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
  const TABS = ['arts', 'robes', 'blades', 'altar'];
  const tabChips = [['arts', 'Arts'], ['robes', 'Robes'], ['blades', 'Blades'], ['altar', 'Altar']].map(([id, label]) => {
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

  function bladesPage(g) {
    const row = el('div', 'arts-robes');
    for (const b of g.blades || []) {
      const swatch = el('button', 'arts-robe arts-blade hit is-' + b.id + (b.worn ? ' is-worn' : ''));
      swatch.type = 'button';
      swatch.dataset.blade = b.id;
      swatch.append(el('span', 'arts-robe-swatch'), el('b', null, b.name),
        el('small', null, b.worn ? 'wielded' : b.owned ? 'wield' : b.locked ? 'beat the king' : b.cost + ' souls'));
      swatch.disabled = !b.owned && (b.locked || (g.souls || 0) < b.cost);
      swatch.title = b.owned ? 'Wield the ' + b.name + ' blade' : b.locked ? 'Only for one who has beaten the wraith king'
        : 'Buy the ' + b.name + ' blade for ' + b.cost + ' souls';
      swatch.addEventListener('click', async () => {
        const out = await act({ blade: b.id });
        if (out.ok) ctx.swing();
      });
      row.appendChild(swatch);
    }
    page.append(el('p', 'muted', 'The scythe he swings when he reaps and cuts.'), row);
  }

  function altarPage(g) {
    const a = g.altar || { level: 0, bonus: 0, cost: 0 };
    const offering = el('div', 'crypt-item');
    const text = el('div');
    text.append(el('b', null, 'The altar · ' + a.level), el('span', 'muted', 'Each offering: 3% more souls from gathering, hunts, deeds and wraiths, for good. Now: +' + a.bonus + '%. It never runs out.'));
    const give = chip(String(a.cost), async () => {
      const out = await act({ offer: true });
      if (out.ok) say('Accepted. +' + out.bonus + '% souls.', 2500);
    }, 'solid');
    give.dataset.offer = '1';
    give.disabled = (g.souls || 0) < a.cost;
    give.setAttribute('aria-label', 'Make an offering for ' + a.cost + ' souls');
    offering.append(text, give);
    page.appendChild(offering);

    const sh = g.shrines || { quicken: { resting: 0, cost: 0 }, rouse: { cost: 0, ready: false } };
    page.appendChild(el('p', 'muted arts-shrines', 'Shrines: souls spent on the moment.'));
    const q = el('div', 'crypt-item');
    const qt = el('div');
    qt.append(el('b', null, 'Quicken'), el('span', 'muted', sh.quicken.resting
      ? sh.quicken.resting + ' sprout' + (sh.quicken.resting === 1 ? ' is' : 's are') + ' resting. Wake them all now, empty, to grow again.'
      : 'Wakes every resting sprout at once. Nothing is resting now.'));
    const qb = chip(sh.quicken.resting ? String(sh.quicken.cost) : '—', async () => {
      const out = await act({ quicken: true });
      if (out.ok) say(out.woke + ' wake' + (out.woke === 1 ? 's' : '') + '.', 2500);
    }, 'solid');
    qb.dataset.shrine = 'quicken';
    qb.disabled = !sh.quicken.resting || (g.souls || 0) < sh.quicken.cost;
    q.append(qt, qb);
    const r = el('div', 'crypt-item');
    const rt = el('div');
    rt.append(el('b', null, 'Rouse'), el('span', 'muted', sh.rouse.ready
      ? 'Your dragon called a wraith not long ago. Rouse it to call another now (it still needs the energy).'
      : 'Lets your dragon call a wraith again at once, after it has called one.'));
    const rb = chip(String(sh.rouse.cost), async () => {
      const out = await act({ rouse: true });
      if (out.ok) say('It stirs, ready to call.', 2500);
    }, 'solid');
    rb.dataset.shrine = 'rouse';
    rb.disabled = !sh.rouse.ready || (g.souls || 0) < sh.rouse.cost;
    r.append(rt, rb);
    page.append(q, r);
  }

  function paint() {
    const g = garden();
    tabChips.forEach((c) => c.classList.toggle('is-on', c.dataset.tab === tab));
    souls.textContent = 'The garden holds ' + Math.floor(g.souls || 0) + ' souls.';
    page.replaceChildren();
    if (tab === 'robes') robesPage(g);
    else if (tab === 'blades') bladesPage(g);
    else if (tab === 'altar') altarPage(g);
    else artsPage(g);
    card.refit();
  }

  // His robe, on him: the garden's state says which.
  function dress(robe, blade) {
    const reaper = document.getElementById('reaper');
    if (reaper) reaper.dataset.robe = robe || 'crimson';
    // (The swing is drawn on the field, outside him: the blade is on the page.)
    document.body.dataset.blade = blade || 'iron';
  }

  return {
    open(which) {
      if (TABS.includes(which)) tab = which;
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
