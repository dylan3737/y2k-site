// Plays the Garden and the dragon for weeks as three kinds of user, using the
// real rules (crypt.js, dragon.js), and prints when things land, so the
// numbers can be tuned from what happens rather than from feel. Nothing here
// is random: a hunt is worth its average.
//
//   node tools/pacing.mjs              three profiles, 42 days
//   node tools/pacing.mjs typical      one profile, a line a day
//   node tools/pacing.mjs typical 90   ...for 90 days
//   node tools/pacing.mjs --check      fail (exit 1) if a profile misses its targets
//
// What a user does while the app is open: every `every` minutes they look in,
// reap what is in full bloom among the workers on screen, and hunt the ghosts
// (catching `catch` of them); they buy the cheapest useful thing they can
// afford; and they look after the dragon: petting, a drill when it has the
// energy, a snail now and then, some souls to eat at the end of the day.
import * as crypt from '../crypt.js';
import * as dragons from '../dragon.js';

const HOUR = 3600000;
const MIN = 60000;
const DAY = 24 * HOUR;

export const PROFILES = {
  casual: {
    blurb: '4 h a day, weekdays; looks in every 90 min; one hourglass; a Gathering twice a week',
    open: 4, every: 90, catch: 0.6, glasses: [25], gathers: 0.4, files: 0.2, daysOff: 2,
    pets: 5, drills: 1, quality: 0.4, snails: 0.3, feed: 0.15
  },
  typical: {
    blurb: '9 h a day, weekdays; looks in every 45 min; three hourglasses; a Gathering a day',
    open: 9, every: 45, catch: 0.75, glasses: [25, 25, 25], gathers: 1, files: 0.5, daysOff: 2,
    pets: 15, drills: 2, quality: 0.6, snails: 0.5, feed: 0.25
  },
  heavy: {
    blurb: '12 h a day, every day; looks in every 20 min; seven hourglasses; three Gatherings',
    open: 12, every: 20, catch: 0.85, glasses: [25, 25, 25, 50, 25, 25, 25], gathers: 3, files: 2, daysOff: 0,
    pets: 40, drills: 4, quality: 0.8, snails: 1, feed: 0.4
  }
};

// When things should land, in days (from, to), for each profile. Outside
// these, --check fails. A blank `to` is "not before".
export const TARGETS = {
  casual: { 'worker 5': [0, 3], 'worker 10': [2, 9], 'rank Soul warden': [1, 6], 'hatched': [0, 4], 'drake': [2, 10], 'wyvern': [6, 24], 'elder': [18, 60] },
  typical: { 'worker 5': [0, 1], 'worker 10': [1, 4], 'worker 25': [10, 45], 'rank Soul warden': [0, 3], 'rank Wraith lord': [5, 21],
    'hatched': [0, 2], 'drake': [1, 5], 'wyvern': [4, 12], 'elder': [10, 30], 'ascended 1': [14, 42] },
  heavy: { 'worker 10': [0, 3], 'worker 25': [5, 25], "rank The Reaper's hand": [10, 40], 'hatched': [0, 1], 'drake': [0, 3],
    'wyvern': [2, 8], 'elder': [6, 18], 'ascended 1': [8, 28], 'ascended 2': [16, 60] }
};

const START = Date.UTC(2026, 0, 5, 9); // a Monday, 9 in the morning

// The rules roll dice now and then (which relic a treasure is): the same
// dice every run, so a run says the same thing twice.
function seeded(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function play(name, days, log) {
  Math.random = seeded(name.length * 7919);
  const p = PROFILES[name];
  let now = START;
  const c = crypt.fresh(now);
  const firsts = {};
  const income = { gathering: 0, hunts: 0, deeds: 0, ranks: 0, milestones: 0, other: 0 };
  // Where the dragon's growth comes from.
  const growth = { hunts: 0, hourglasses: 0, pets: 0, drills: 0, snails: 0, meals: 0 };
  const grow = (src, f) => { const x = c.dragon ? c.dragon.xp : 0; const out = f(); if (c.dragon) growth[src] += Math.max(0, c.dragon.xp - x); return out; };
  const day = () => (now - START) / DAY;
  const first = (key) => {
    if (key in firsts) return;
    firsts[key] = day();
    if (log) console.log('  day ' + day().toFixed(2).padStart(6) + '  ' + key);
  };
  const reached = (out) => {
    for (const m of (out && out.reached) || []) income.milestones += m.reward;
    for (const r of (out && out.ranked) || []) { income.ranks += r.reward; first('rank ' + r.name); }
  };
  const settle = () => { income.gathering += crypt.settle(c, now); };
  const watch = () => {
    const v = crypt.view(c, now);
    for (const n of [1, 5, 10, 25, 50]) if (v.skeletons >= n) first('worker ' + n);
    const d = c.dragon;
    if (d) {
      if (d.stage >= 1) first('hatched');
      for (let s = 2; s <= 5; s++) if (d.stage >= s) first(dragons.STAGES[s] + (d.lineage ? ' (line ' + d.lineage + ')' : ''));
      for (let s = 2; s <= 5; s++) if (d.stage >= s && !d.lineage) first(dragons.STAGES[s]);
      if (d.lineage) first('ascended ' + d.lineage);
    }
  };

  // The cheapest useful thing, while it can be afforded. Workers rotate
  // through the kinds open to it; the helpers come once each when they open.
  let turn = 0;
  function shop() {
    for (let guard = 0; guard < 100; guard++) {
      const v = crypt.view(c, now);
      const options = [];
      const growers = v.kinds.filter((k) => ['digger', 'snail', 'frog'].includes(k.id) && k.open);
      const grower = growers[turn % growers.length];
      options.push({ act: { raise: 1, kind: grower.id }, cost: grower.cost, then: () => turn++ });
      for (const k of v.kinds) {
        if (!['digger', 'snail', 'frog'].includes(k.id) && k.open && k.count < Math.min(k.most, 1 + Math.floor(v.skeletons / 8))) options.push({ act: { raise: 1, kind: k.id }, cost: k.cost });
      }
      // His arts, among the rest.
      for (const a of v.arts) if (a.cost !== null) options.push({ act: { art: a.id }, cost: a.cost });
      for (const u of v.upgrades) if (u.cost !== null) options.push({ act: { buy: u.id }, cost: u.cost * (u.id === 'graves' && p.open > 10 ? 3 : 1) , price: u.cost });
      const pick = options.filter((o) => (o.price ?? o.cost) <= c.souls).sort((a, b) => a.cost - b.cost)[0];
      if (!pick) return;
      settle();
      const out = crypt.act(c, pick.act, now);
      if (!out.ok) return;
      if (pick.then) pick.then();
      reached(out);
      watch();
    }
  }

  // A hunt: `ghosts` loose; catch some; moths save some of the rest.
  function hunt(ghosts) {
    const v = crypt.view(c, now);
    const saved = Math.min(ghosts, v.moths * crypt.MOTH_CATCHES);
    const breaths = c.dragon ? dragons.breaths(c.dragon) : 0;
    const caught = Math.min(ghosts, Math.round(ghosts * p.catch) + Math.min(breaths, Math.round(ghosts * (1 - p.catch))));
    const all = Math.min(ghosts, caught + Math.min(saved, ghosts - caught));
    const golden = Math.round(all * v.goldenChance);
    const out = grow('hunts', () => crypt.act(c, { hunt: { caught: all, golden, points: all * crypt.GHOST_POINTS * 2 } }, now));
    income.hunts += out.gained || 0;
    reached(out);
  }

  // Look in: the bees pollinate, the ripe workers on screen are reaped, one
  // hunt each, and the dragon is seen to.
  function lookIn(gatherNow) {
    settle();
    for (let i = 0; i < crypt.view(c, now).skeletons; i++) crypt.act(c, { pollinate: i }, now);
    if (gatherNow) {
      const out = crypt.act(c, { gather: true }, now);
      if (out.ok && out.ghosts) hunt(out.ghosts);
    }
    for (let guard = 0; guard < 8; guard++) {
      const bones = crypt.view(c, now).bones;
      const i = bones.findIndex((b) => !b.rest && ((b.most && b.ripe >= b.most) || (b.kind === 'moth')));
      if (i < 0) break;
      const out = crypt.act(c, { reap: i }, now);
      if (!out.ok) break;
      hunt(out.ghosts);
    }
    shop();
    watch();
  }

  const before = () => c.souls;
  const rows = [];
  let carry = { gathers: 0, files: 0, snails: 0 };
  for (let d = 0; d < days; d++) {
    const start = START + d * DAY;
    now = start;
    const working = d % 7 < 7 - p.daysOff;
    if (working) {
      settle();
      if (!c.dragon) crypt.act(c, { dragon: { adopt: true } }, now);
      shop();
      carry.gathers += p.gathers; carry.files += p.files; carry.snails += p.snails;
      const looks = Math.floor((p.open * 60) / p.every);
      const gatherAt = new Set();
      for (let g = 0; carry.gathers >= 1; carry.gathers--, g++) gatherAt.add(Math.floor((looks * (g + 1)) / (Math.floor(p.gathers) + 2)));
      const glassAt = p.glasses.map((m, i) => [Math.floor((looks * (i + 1)) / (p.glasses.length + 1)), m]);
      let pets = p.pets, drills = p.drills;
      for (let k = 1; k <= looks; k++) {
        now = start + k * p.every * MIN;
        lookIn(gatherAt.has(k));
        for (const [at, m] of glassAt) if (at === k) { settle(); const s = before(); const out = grow('hourglasses', () => crypt.deed(c, 'focus', m, now)); income.deeds += c.souls - s - (out.reached || []).reduce((a, r) => a + r.reward, 0); reached(out); }
        // The dragon: a pet or two, a drill when rested.
        for (let n = 0; n < Math.ceil(p.pets / looks) && pets > 0; n++, pets--) {
          const s = before();
          grow('pets', () => crypt.act(c, { dragon: { pet: true } }, now + n * 9000));
          income.other += c.souls - s;
        }
        // A crow swoops at the ripest sprout now and then: stopped, as often as
        // the dragon is watchful; otherwise it takes a ghost.
        if (c.dragon && dragons.crowReady(c.dragon, now).ok) {
          const s = before();
          if (Math.random() < dragons.watchfulness(c.dragon)) crypt.act(c, { dragon: { crow: { stopped: true } } }, now);
          else {
            const bones = crypt.view(c, now).bones;
            const at = bones.reduce((best, b, i) => (b.most && !b.rest && b.ripe > (best < 0 ? 0 : bones[best].ripe) ? i : best), -1);
            if (at >= 0) crypt.act(c, { dragon: { crow: { at } } }, now);
          }
          income.other += c.souls - s;
        }
        // Its breath burst, when charged: aimed at the first three sprouts (Shadow
        // reaches them all anyway).
        if (c.dragon && dragons.burstCharge(c.dragon, now) >= 1) {
          const at = crypt.view(c, now).bones.map((b, i) => (b.most && !b.rest ? i : -1)).filter((i) => i >= 0).slice(0, 3);
          if (at.length) crypt.act(c, { dragon: { burst: { at } } }, now);
        }
        // A treasure drifts by now and then, and the dragon brings it home.
        if (c.dragon && dragons.treasureReady(c.dragon, now).ok) { const s = before(); crypt.act(c, { dragon: { treasure: true } }, now); income.other += c.souls - s; }
        if (drills > 0 && c.dragon && c.dragon.stage > 0 && c.dragon.energy >= dragons.TRAIN_COST) {
          const kinds = ['hunt', 'garden', 'tricks'];
          grow('drills', () => crypt.act(c, { dragon: { train: kinds[(d + k) % 3 === 0 ? 1 : 0], quality: p.quality } }, now));
          drills--;
        }
        watch();
      }
      for (; carry.files >= 1; carry.files--) { const s = before(); const out = crypt.deed(c, 'reaped', 1, now); income.deeds += c.souls - s; reached(out); }
      // The end of the day: a snail, a meal of souls, an ascension if it can.
      if (c.dragon && c.dragon.stage > 0) {
        for (; carry.snails >= 1; carry.snails--) grow('snails', () => crypt.act(c, { dragon: { snail: true } }, now));
        const meal = Math.floor(c.souls * p.feed);
        if (meal > 0) grow('meals', () => crypt.act(c, { dragon: { feed: meal } }, now));
        if (dragons.ascendable(c.dragon).ok) crypt.act(c, { dragon: { ascend: true } }, now);
        for (let g = 0; g < 10; g++) {
          const cheapest = dragons.PERKS.filter((x) => c.dragon.perks[x.id] < x.costs.length).sort((a, b) => a.costs[c.dragon.perks[a.id]] - b.costs[c.dragon.perks[b.id]])[0];
          if (!cheapest || !crypt.act(c, { dragon: { perk: cheapest.id } }, now).ok) break;
        }
      }
      watch();
    }
    now = start + DAY - 1;
    settle();
    const v = crypt.view(c, now);
    const dv = c.dragon ? dragons.viewDragon(c.dragon) : null;
    rows.push({
      day: d + 1, souls: v.souls, workers: v.skeletons, 'souls/h idle': v.perHour, rank: v.rank,
      upgrades: v.upgrades.map((u) => u.level).join('/'),
      dragon: dv ? dv.stage + (dv.lineage ? ' L' + dv.lineage : '') + ' ' + dv.xp : '-', scales: dv ? dv.scales : 0
    });
  }
  return { rows, firsts, income, growth };
}

const args = process.argv.slice(2);
const checking = args.includes('--check');
const [only, span] = args.filter((a) => !a.startsWith('--'));
const days = Number(span) || (checking ? 60 : 42);
let misses = 0;
for (const name of only ? [only] : Object.keys(PROFILES)) {
  if (!PROFILES[name]) {
    console.error('No such profile. There are: ' + Object.keys(PROFILES).join(', '));
    process.exit(1);
  }
  console.log('\n' + name.toUpperCase() + ': ' + PROFILES[name].blurb);
  const { rows, firsts, income, growth } = play(name, days, !!only && !checking);
  if (!checking) console.table(only ? rows : rows.filter((r) => [1, 2, 3, 5, 7, 14, 21, 28, 35, 42].includes(r.day) || r.day === days));
  const total = Object.values(income).reduce((a, b) => a + b, 0);
  console.log('souls came from: ' + Object.entries(income).map(([k, v]) => k + ' ' + Math.round((100 * v) / total) + '%').join(', '));
  const grown = Object.values(growth).reduce((a, b) => a + b, 0) || 1;
  console.log('the dragon grew from: ' + Object.entries(growth).map(([k, v]) => k + ' ' + Math.round((100 * v) / grown) + '%').join(', '));
  for (const [key, [from, to]] of Object.entries(TARGETS[name])) {
    const at = firsts[key];
    const ok = at !== undefined ? at >= from && (to === undefined || at <= to) : false;
    if (!ok) misses++;
    console.log((ok ? '  ok    ' : '  MISS  ') + key.padEnd(24) + (at === undefined ? 'not in ' + days + ' days' : 'day ' + at.toFixed(1)) + '   (wanted day ' + from + (to === undefined ? '+' : '-' + to) + ')');
  }
}
if (checking) {
  console.log(misses ? '\n' + misses + ' targets missed' : '\nAll pacing targets met');
  process.exit(misses ? 1 : 0);
}
