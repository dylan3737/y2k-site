// The Crypt: the rules of the idle game, with no I/O, so the main process, the
// page's browser stand-in, the tests and the pacing simulation all share them.
//
// Souls are banked here for good (the meter under the reaper is his energy, a
// different thing). They come from what the user does: ghosts caught, files
// reaped, focus timers finished. Souls raise skeletons, which dig up more souls
// on their own, including while the user is away or the app is shut. Souls
// also buy upgrades, and milestones pay a bonus the first time they are reached.
//
// Skeletons ripen as they dig: each holds one ghost, and one more for every
// hour it has dug, up to six. Dropping the reaper on a skeleton reaps it: it
// bursts into its ghosts, and a hunt begins. A ghost caught banks souls and
// scores points; one that gets away is lost. Points add up to a score that
// climbs ranks, each paying souls once.
//
// Summon raises a skeleton for the reaper's own soul (his energy) instead of
// banked souls. Now and then the grave holds a wraith instead, which pays well
// if it is beaten.

export const RATE_PER_HOUR = 1.5; // souls one skeleton digs up in an hour
export const BASE_COST = 25;      // the first skeleton
export const GROWTH = 1.25;      // each one costs this much more than the last
// These numbers were tuned with tools/pacing.mjs; run it after changing any.
export const MAX_SKELETONS = 200;

// What each deed is worth, per unit: a ghost, a file, a minute of finished focus.
export const WORTH = { caught: 1, reaped: 5, focus: 1 };

// Ghosts: what one caught banks (a golden one, three times as much), the
// points it scores before the combo, and how ripe a skeleton can get.
export const GHOST_SOULS = 10;
export const GHOST_POINTS = 10;
export const MAX_RIPE = 6;
// A beaten wraith pays this, and this much more for every rank reached.
export const WRAITH_SOULS = 60;
export const WRAITH_PER_RANK = 30;
// Ranks, by score; each pays its reward once, when it is reached.
export const RANKS = [
  { name: 'Gravekeeper', at: 0, reward: 0 },
  { name: 'Ghost catcher', at: 100, reward: 30 },
  { name: 'Soul warden', at: 400, reward: 80 },
  { name: 'Shade hunter', at: 1200, reward: 200 },
  { name: 'Wraith lord', at: 3000, reward: 500 },
  { name: "The Reaper's hand", at: 8000, reward: 1200 }
];

// Upgrades change the rules instead of adding diggers. `costs` has one price
// per level; `effect` says what a level gives, for the card.
export const UPGRADES = [
  {
    id: 'shovels', name: 'Sharper shovels', blurb: 'Every skeleton digs 25% faster.',
    costs: [60, 110, 200, 360, 650, 1200, 2100, 3800, 6800, 12000],
    effect: (level) => '+' + level * 25 + '% digging'
  },
  {
    id: 'graves', name: 'Deeper graves', blurb: 'They keep digging longer while the app is shut.',
    costs: [90, 300, 1000],
    effect: (level) => [8, 12, 16, 24][level] + ' hours'
  },
  {
    id: 'sand', name: 'Finer sand', blurb: 'A finished hourglass is worth more.',
    costs: [120, 500, 2000],
    effect: (level) => [1, 1.5, 2, 3][level] + ' a minute'
  },
  {
    id: 'lure', name: 'Ghost lure', blurb: 'More of the ghosts you hunt are golden.',
    costs: [80, 300, 1200],
    effect: (level) => [10, 16, 22, 30][level] + '% golden'
  }
];
// A Map, so an id like "__proto__" from outside finds nothing.
const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
const CAP_HOURS = [8, 12, 16, 24];
const SAND = [1, 1.5, 2, 3];
const GOLDEN = [0.10, 0.16, 0.22, 0.30];

// Milestones pay `reward` souls once. `how` is shown until it is reached.
export const MILESTONES = [
  { id: 'glass1', name: 'First sand', how: 'Finish an hourglass', reward: 15, met: (c) => c.deeds.glasses >= 1 },
  { id: 'bones1', name: 'It moves', how: 'Raise a skeleton', reward: 10, met: (c) => c.skeletons >= 1 },
  { id: 'file1', name: 'A taste', how: 'Feed him a file', reward: 10, met: (c) => c.deeds.reaped >= 1 },
  { id: 'ghosts25', name: 'Ghost catcher', how: 'Catch 25 ghosts', reward: 25, met: (c) => c.deeds.caught >= 25 },
  { id: 'up1', name: 'Tools of the trade', how: 'Buy an upgrade', reward: 20, met: (c) => Object.values(c.upgrades).some((l) => l > 0) },
  { id: 'souls250', name: 'A full urn', how: 'Hold 250 souls over time', reward: 30, met: (c) => c.total >= 250 },
  { id: 'bones5', name: 'A work crew', how: 'Raise 5 skeletons', reward: 50, met: (c) => c.skeletons >= 5 },
  { id: 'glass50', name: 'The long watch', how: 'Finish a 50-minute hourglass', reward: 50, met: (c) => c.deeds.longest >= 50 },
  { id: 'glass10', name: 'Keeper of sand', how: 'Finish 10 hourglasses', reward: 100, met: (c) => c.deeds.glasses >= 10 },
  { id: 'ghosts100', name: 'Ghost warden', how: 'Catch 100 ghosts', reward: 100, met: (c) => c.deeds.caught >= 100 },
  { id: 'files25', name: 'Glutton', how: 'Feed him 25 files', reward: 75, met: (c) => c.deeds.reaped >= 25 },
  { id: 'souls2500', name: 'An ossuary', how: 'Hold 2,500 souls over time', reward: 200, met: (c) => c.total >= 2500 },
  { id: 'bones10', name: 'A horde', how: 'Raise 10 skeletons', reward: 150, met: (c) => c.skeletons >= 10 },
  { id: 'up10', name: 'Master of the craft', how: 'Buy 10 upgrade levels', reward: 250, met: (c) => Object.values(c.upgrades).reduce((a, b) => a + b, 0) >= 10 },
  { id: 'glass50x', name: 'Hourkeeper', how: 'Finish 50 hourglasses', reward: 500, met: (c) => c.deeds.glasses >= 50 },
  { id: 'bones25', name: 'A legion', how: 'Raise 25 skeletons', reward: 600, met: (c) => c.skeletons >= 25 },
  { id: 'souls25000', name: 'A necropolis', how: 'Hold 25,000 souls over time', reward: 2000, met: (c) => c.total >= 25000 }
];

const HOUR = 3600000;
const whole = (n, max) => (Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0);
const level = (c, id) => c.upgrades[id] || 0;

export const fresh = (now = Date.now()) => clean(null, now);

// Whatever was saved, made safe to use.
export function clean(raw, now = Date.now()) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const deeds = c.deeds && typeof c.deeds === 'object' ? c.deeds : {};
  const upgrades = c.upgrades && typeof c.upgrades === 'object' ? c.upgrades : {};
  const out = {
    souls: whole(c.souls, 1e12),
    skeletons: Math.floor(whole(c.skeletons, MAX_SKELETONS)),
    total: whole(c.total, 1e12),
    at: Number.isFinite(c.at) && c.at <= now ? c.at : now,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, Math.floor(whole(upgrades[u.id], u.costs.length))])),
    // When each skeleton began to dig, oldest first: how ripe it is.
    born: [],
    // Ghosts let loose by the last reaping, and not yet hunted.
    loose: Math.floor(whole(c.loose, MAX_RIPE)),
    score: Math.floor(whole(c.score, 1e12)),
    rank: Math.floor(whole(c.rank, RANKS.length - 1)),
    done: Array.isArray(c.done) ? MILESTONES.map((m) => m.id).filter((id) => c.done.includes(id)) : [],
    // Counted for good; the daily tally elsewhere forgets at midnight.
    deeds: {
      caught: whole(deeds.caught, 1e9), reaped: whole(deeds.reaped, 1e9),
      glasses: whole(deeds.glasses, 1e9), longest: whole(deeds.longest, 180)
    }
  };
  // Saved times, made sane; skeletons from before ripening start ripening now.
  const born = Array.isArray(c.born) ? c.born.filter((t) => Number.isFinite(t) && t <= now) : [];
  out.born = [];
  for (const t of born.slice(0, out.skeletons)) birth(out, t);
  while (out.born.length < out.skeletons) birth(out, now);
  out.loose = Math.min(out.loose, MAX_RIPE);
  return out;
}

export const cost = (owned) => Math.ceil(BASE_COST * GROWTH ** owned);
export const perHour = (c) => c.skeletons * RATE_PER_HOUR * (1 + 0.25 * level(c, 'shovels'));
// Time nobody was counting (the app shut, the computer asleep) pays out up to this.
export const capHours = (c) => CAP_HOURS[level(c, 'graves')];
export const goldenChance = (c) => GOLDEN[level(c, 'lure')];

const bank = (c, n) => { c.souls += n; c.total += n; };

// Pay out what the skeletons dug since the last count. Returns the souls added.
export function settle(c, now = Date.now()) {
  const hours = Math.min(capHours(c), Math.max(0, (now - c.at) / HOUR));
  const dug = perHour(c) * hours;
  bank(c, dug);
  c.at = now;
  return dug;
}

// Souls for a deed: n ghosts, n files, or a finished hourglass of n minutes.
// Returns the souls added (0 for anything unknown).
export function earn(c, deed, n) {
  if (!(deed in WORTH) || !Number.isFinite(n) || n <= 0) return 0;
  const count = Math.min(1000, n);
  let gained = count * WORTH[deed];
  if (deed === 'focus') {
    gained = Math.round(gained * SAND[level(c, 'sand')]);
    c.deeds.glasses += 1;
    c.deeds.longest = Math.max(c.deeds.longest, Math.min(180, count));
  } else {
    c.deeds[deed] += count;
  }
  bank(c, gained);
  return gained;
}

// Raise up to `count` skeletons, as many as the souls allow.
export function raise(c, count = 1) {
  const wanted = Math.max(1, Math.min(50, Math.floor(Number(count)) || 1));
  let raised = 0;
  while (raised < wanted && c.skeletons < MAX_SKELETONS && c.souls >= cost(c.skeletons)) {
    c.souls -= cost(c.skeletons);
    c.skeletons += 1;
    if (c.born) birth(c, Date.now());
    raised += 1;
  }
  if (raised) return { ok: true, raised };
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, raised: 0, error: 'The crypt is full.' };
  return { ok: false, raised: 0, error: 'Not enough souls: the next skeleton costs ' + cost(c.skeletons) + ' and the crypt holds ' + Math.floor(c.souls) + '.' };
}

// How many ghosts a skeleton that began digging at `born` holds by `now`.
export const ripeness = (born, now = Date.now()) => Math.min(MAX_RIPE, 1 + Math.floor(Math.max(0, now - born) / HOUR));

// A new skeleton begins to dig. Its start time is also how it is known, so no
// two share one.
function birth(c, now) {
  const last = c.born.length ? c.born[c.born.length - 1] : -Infinity;
  c.born.push(Math.max(now, last + 1));
}

// Keep `born` in step with the count: new ones start now, extra ones go.
function tally(c, now) {
  while (c.born.length < c.skeletons) birth(c, now);
  c.born.length = c.skeletons;
}

// Reap the skeleton at `index` (as drawn, oldest first): it stops digging and
// bursts into its ghosts, which are loose until the hunt is done.
export function reap(c, index = 0, now = Date.now()) {
  tally(c, now);
  const i = Math.floor(Number(index));
  if (!c.skeletons) return { ok: false, error: 'No skeletons to reap. Raise one first.' };
  if (!(i >= 0 && i < c.skeletons)) return { ok: false, error: 'No such skeleton.' };
  const ghosts = ripeness(c.born[i], now);
  c.born.splice(i, 1);
  c.skeletons -= 1;
  c.loose = ghosts;
  return { ok: true, ghosts };
}

// The end of a hunt: `caught` of the loose ghosts were caught, `golden` of them
// golden, for `points` with the combo. The rest are lost. Pays the souls, adds
// the points, and pays any rank newly reached.
export function hunted(c, result) {
  const r = result && typeof result === 'object' ? result : {};
  const caught = Math.min(c.loose, Math.floor(whole(r.caught, MAX_RIPE)));
  const golden = Math.min(caught, Math.floor(whole(r.golden, MAX_RIPE)));
  // At most every ghost golden, at the top of the combo.
  const points = Math.min(caught * GHOST_POINTS * 3 * 5, Math.floor(whole(r.points, 1e9)));
  c.loose = 0;
  c.deeds.caught += caught;
  const gained = (caught + 2 * golden) * GHOST_SOULS;
  bank(c, gained);
  c.score += points;
  return { ok: true, caught, golden, points, gained, ranked: climb(c) };
}

// Pay every rank the score has newly reached.
function climb(c) {
  const ranked = [];
  while (c.rank + 1 < RANKS.length && c.score >= RANKS[c.rank + 1].at) {
    c.rank += 1;
    bank(c, RANKS[c.rank].reward);
    ranked.push({ name: RANKS[c.rank].name, reward: RANKS[c.rank].reward });
  }
  return ranked;
}

// Summon: a skeleton raised for the reaper's own soul, not banked souls.
export function summon(c, now = Date.now()) {
  tally(c, now);
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, error: 'The crypt is full.' };
  c.skeletons += 1;
  birth(c, now);
  return { ok: true, raised: 1 };
}

// A wraith fought: beaten, it pays souls by rank and a skeleton rises anyway;
// escaped, nothing.
export function wraith(c, won, now = Date.now()) {
  if (!won) return { ok: true, won: false, gained: 0 };
  const gained = WRAITH_SOULS + WRAITH_PER_RANK * c.rank;
  bank(c, gained);
  const risen = summon(c, now);
  return { ok: true, won: true, gained, raised: risen.ok ? 1 : 0 };
}

// The price of an upgrade's next level, or null when it has them all.
export function upgradeCost(c, id) {
  const u = UPGRADE_BY_ID.get(id);
  return u && level(c, id) < u.costs.length ? u.costs[level(c, id)] : null;
}

export function buy(c, id) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u) return { ok: false, error: 'No such upgrade. There are: ' + UPGRADES.map((x) => x.id).join(', ') + '.' };
  const price = upgradeCost(c, id);
  if (price === null) return { ok: false, error: u.name + ' can go no further.' };
  if (c.souls < price) return { ok: false, error: 'Not enough souls: ' + u.name + ' costs ' + price + ' and the crypt holds ' + Math.floor(c.souls) + '.' };
  c.souls -= price;
  c.upgrades[id] = level(c, id) + 1;
  return { ok: true, upgrade: id, name: u.name, level: c.upgrades[id] };
}

// Pay for every milestone newly met. Returns them as [{ name, reward }]. A
// reward can meet another milestone, so this looks again until nothing is new.
export function reach(c) {
  const reached = [];
  for (let again = true; again;) {
    again = false;
    for (const m of MILESTONES) {
      if (c.done.includes(m.id) || !m.met(c)) continue;
      c.done.push(m.id);
      bank(c, m.reward);
      reached.push({ name: m.name, reward: m.reward });
      again = true;
    }
  }
  return reached;
}

// --- What callers use ----------------------------------------------------------
// A deed, with the digging counted first and milestones paid after.
export function deed(c, key, n, now = Date.now()) {
  settle(c, now);
  const gained = earn(c, key, n);
  return { gained, reached: reach(c) };
}

// { raise: count }, { reap: index }, { hunt: result }, { summon: true },
// { wraith: { won } } or { buy: id }; anything else only counts the digging.
export function act(c, action, now = Date.now()) {
  settle(c, now);
  tally(c, now);
  const a = action && typeof action === 'object' ? action : {};
  const out = a.raise ? raise(c, a.raise)
    : 'reap' in a ? reap(c, a.reap, now)
      : a.hunt ? hunted(c, a.hunt)
        : a.summon ? summon(c, now)
          : a.wraith ? wraith(c, !!a.wraith.won, now)
            : typeof a.buy === 'string' ? buy(c, a.buy) : { ok: true };
  return { ...out, reached: reach(c) };
}

// What the page and Speak are shown: whole souls only.
export function view(c) {
  return {
    souls: Math.floor(c.souls),
    skeletons: c.skeletons,
    nextCost: cost(c.skeletons),
    perHour: Math.round(perHour(c) * 10) / 10,
    total: Math.floor(c.total),
    awayCapHours: capHours(c),
    goldenChance: goldenChance(c),
    // The skeletons drawn on screen (the oldest eight): how each is known, and
    // how many ghosts it holds.
    bones: (c.born || []).slice(0, 8).map((t) => ({ id: t, ripe: ripeness(t) })),
    loose: c.loose,
    score: c.score,
    rank: RANKS[c.rank].name,
    nextRank: c.rank + 1 < RANKS.length ? { name: RANKS[c.rank + 1].name, at: RANKS[c.rank + 1].at, reward: RANKS[c.rank + 1].reward } : null,
    upgrades: UPGRADES.map((u) => ({
      id: u.id, name: u.name, blurb: u.blurb, level: level(c, u.id), max: u.costs.length,
      cost: upgradeCost(c, u.id), now: u.effect(level(c, u.id)),
      next: level(c, u.id) < u.costs.length ? u.effect(level(c, u.id) + 1) : null
    })),
    milestones: MILESTONES.map((m) => ({ name: m.name, how: m.how, reward: m.reward, done: c.done.includes(m.id) }))
  };
}
