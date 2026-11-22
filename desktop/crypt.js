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
// Reaped, a skeleton rises again empty. Summon's Gathering reaps them all at
// once, for one big hunt; now and then a wraith answers too, which pays well
// if it is beaten.
//
// Besides the plain skeleton there are kinds unlocked by rank: the ghoul digs
// twice as much but holds no ghosts, and the lantern bearer digs nothing but
// makes the others ripen faster.

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
// The most ghosts one hunt can hold: a Gathering of eight full skeletons.
export const MAX_LOOSE = 60;
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

// The kinds of skeleton. `dig` is how much one digs against a plain one,
// `ghosts` whether it ripens, `price` its cost against the next plain one,
// `rank` the rank that unlocks it, `most` how many can be raised.
export const KINDS = [
  { id: 'digger', name: 'Skeleton', blurb: 'Digs souls, and ripens with ghosts to reap.', dig: 1, ghosts: true, price: 1, rank: 0, most: Infinity },
  { id: 'ghoul', name: 'Ghoul', blurb: 'Digs twice as much, but holds no ghosts.', dig: 2, ghosts: false, price: 2, rank: 1, most: Infinity },
  { id: 'lantern', name: 'Lantern bearer', blurb: 'Digs nothing, but every skeleton ripens a quarter faster for each.', dig: 0, ghosts: false, price: 3, rank: 2, most: 3 }
];
const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k]));
const kindOf = (c, i) => KIND_BY_ID.get((c.kinds && c.kinds[i]) || 'digger') || KINDS[0];
const counted = (c, id) => (c.kinds || []).filter((k) => k === id).length;
// How fast skeletons ripen: a quarter faster for each lantern bearer.
export const ripenSpeed = (c) => 1 + 0.25 * counted(c, 'lantern');

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
    // What kind each one is, alongside `born`.
    kinds: [],
    // Ghosts let loose by the last reaping, and not yet hunted.
    loose: Math.floor(whole(c.loose, MAX_LOOSE)),
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
  // (Ones raised together are a millisecond apart, so the last can be just ahead.)
  const savedKinds = Array.isArray(c.born) && Array.isArray(c.kinds) && c.kinds.length === c.born.length ? c.kinds : [];
  const pairs = Array.isArray(c.born)
    ? c.born.map((t, i) => [t, savedKinds[i]]).filter(([t]) => Number.isFinite(t) && t <= now + MAX_SKELETONS) : [];
  out.born = [];
  for (const [t, kind] of pairs.slice(0, out.skeletons)) birth(out, Math.min(t, now + MAX_SKELETONS), KIND_BY_ID.has(kind) ? kind : 'digger');
  while (out.born.length < out.skeletons) birth(out, now);
  out.loose = Math.min(out.loose, MAX_LOOSE);
  return out;
}

export const cost = (owned) => Math.ceil(BASE_COST * GROWTH ** owned);
// What they dig: each plain skeleton one share, a ghoul two, a lantern none.
const shares = (c) => {
  let n = 0;
  for (let i = 0; i < c.skeletons; i++) n += kindOf(c, i).dig;
  return n;
};
export const perHour = (c) => shares(c) * RATE_PER_HOUR * (1 + 0.25 * level(c, 'shovels'));
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

// What the next one of a kind costs.
export const kindCost = (c, id = 'digger') => Math.ceil(cost(c.skeletons) * (KIND_BY_ID.get(id) || KINDS[0]).price);

// Raise up to `count` skeletons of a kind, as many as the souls allow.
export function raise(c, count = 1, kind = 'digger', now = Date.now()) {
  const k = KIND_BY_ID.get(kind || 'digger');
  if (!k) return { ok: false, raised: 0, error: 'No such kind. There are: ' + KINDS.map((x) => x.id).join(', ') + '.' };
  if ((c.rank || 0) < k.rank) return { ok: false, raised: 0, error: k.name + 's answer only a ' + RANKS[k.rank].name + '. Reach that rank first.' };
  const wanted = Math.max(1, Math.min(50, Math.floor(Number(count)) || 1));
  let raised = 0;
  while (raised < wanted && c.skeletons < MAX_SKELETONS && counted(c, k.id) < k.most && c.souls >= kindCost(c, k.id)) {
    c.souls -= kindCost(c, k.id);
    c.skeletons += 1;
    if (c.born) birth(c, now, k.id);
    raised += 1;
  }
  if (raised) return { ok: true, raised, kind: k.id };
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, raised: 0, error: 'The crypt is full.' };
  if (counted(c, k.id) >= k.most) return { ok: false, raised: 0, error: 'No more than ' + k.most + ' ' + k.name.toLowerCase() + 's.' };
  return { ok: false, raised: 0, error: 'Not enough souls: the next ' + k.name.toLowerCase() + ' costs ' + kindCost(c, k.id) + ' and the crypt holds ' + Math.floor(c.souls) + '.' };
}

// How many ghosts a skeleton that began digging at `born` holds by `now`.
// Faster with lantern bearers about (`speed`).
export const ripeness = (born, now = Date.now(), speed = 1) => Math.min(MAX_RIPE, 1 + Math.floor(Math.max(0, now - born) * speed / HOUR));
// What the one at `i` holds: nothing, for a kind that holds no ghosts.
const holds = (c, i, now) => (kindOf(c, i).ghosts ? ripeness(c.born[i], now, ripenSpeed(c)) : 0);

// A new skeleton begins to dig. Its start time is also how it is known, so no
// two share one.
function birth(c, now, kind = 'digger') {
  const last = c.born.length ? c.born[c.born.length - 1] : -Infinity;
  c.born.push(Math.max(now, last + 1));
  if (!c.kinds) c.kinds = [];
  while (c.kinds.length < c.born.length - 1) c.kinds.push('digger');
  c.kinds.length = c.born.length - 1;
  c.kinds.push(kind);
}

// Keep `born` in step with the count: new ones start now, extra ones go.
function tally(c, now) {
  if (!c.kinds) c.kinds = [];
  while (c.kinds.length < c.born.length) c.kinds.push('digger');
  while (c.born.length < c.skeletons) birth(c, now);
  c.born.length = c.skeletons;
  c.kinds.length = c.skeletons;
}

// Reap the skeleton at `index` (as drawn, oldest first): it bursts into its
// ghosts, which are loose until the hunt is done, and claws back up empty, to
// ripen again. Its new start time is its new name.
export function reap(c, index = 0, now = Date.now()) {
  tally(c, now);
  const i = Math.floor(Number(index));
  if (!c.skeletons) return { ok: false, error: 'No skeletons to reap. Raise one first.' };
  if (!(i >= 0 && i < c.skeletons)) return { ok: false, error: 'No such skeleton.' };
  if (!kindOf(c, i).ghosts) return { ok: false, error: 'A ' + kindOf(c, i).name.toLowerCase() + ' holds no ghosts.' };
  const ghosts = holds(c, i, now);
  c.born.splice(i, 1);
  c.kinds.splice(i, 1);
  birth(c, now);
  c.loose = ghosts;
  return { ok: true, ghosts };
}

// Summon's Gathering: every skeleton at once bursts into its ghosts, and each
// past the first brings one more. All of them rise again empty. With no
// skeletons, the grave answers with a first one instead.
export function gather(c, now = Date.now()) {
  tally(c, now);
  const which = c.kinds.map((_, i) => i).filter((i) => kindOf(c, i).ghosts);
  if (!which.length) {
    const risen = summon(c, now);
    return { ...risen, ghosts: 0, gathered: 0 };
  }
  const n = which.length;
  const ghosts = Math.min(MAX_LOOSE, which.reduce((sum, i) => sum + holds(c, i, now), 0) + (n - 1));
  // The rest keep their places; the gathered rise again, empty, after them.
  const keep = c.kinds.map((k, i) => [c.born[i], k]).filter(([, k]) => !KIND_BY_ID.get(k).ghosts);
  c.born = [];
  c.kinds = [];
  for (const [t, k] of keep) { c.born.push(t); c.kinds.push(k); }
  for (let k = 0; k < n; k++) birth(c, now);
  c.loose = ghosts;
  return { ok: true, ghosts, gathered: n };
}

// The end of a hunt: `caught` of the loose ghosts were caught, `golden` of them
// golden, for `points` with the combo. The rest are lost. Pays the souls, adds
// the points, and pays any rank newly reached.
export function hunted(c, result) {
  const r = result && typeof result === 'object' ? result : {};
  const caught = Math.min(c.loose, Math.floor(whole(r.caught, MAX_LOOSE)));
  const golden = Math.min(caught, Math.floor(whole(r.golden, MAX_LOOSE)));
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

// { raise: count }, { reap: index }, { gather: true }, { hunt: result }, { summon: true },
// { wraith: { won } } or { buy: id }; anything else only counts the digging.
export function act(c, action, now = Date.now()) {
  settle(c, now);
  tally(c, now);
  const a = action && typeof action === 'object' ? action : {};
  const out = a.raise ? raise(c, a.raise, a.kind, now)
    : 'reap' in a ? reap(c, a.reap, now)
      : a.gather ? gather(c, now)
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
    // The skeletons drawn on screen (the oldest eight): how each is known,
    // how many ghosts it holds, and what kind it is.
    bones: (c.born || []).slice(0, 8).map((t, i) => ({ id: t, kind: kindOf(c, i).id, ripe: holds(c, i, Date.now()) })),
    kinds: KINDS.map((k) => ({
      id: k.id, name: k.name, blurb: k.blurb, count: c.kinds ? counted(c, k.id) : 0, most: Number.isFinite(k.most) ? k.most : null,
      cost: kindCost(c, k.id), open: (c.rank || 0) >= k.rank, rank: RANKS[k.rank].name
    })),
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
