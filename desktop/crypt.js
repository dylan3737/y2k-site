// The Crypt (shown as the Garden): the rules of the idle game, with no I/O, so
// the main process, the page's browser stand-in, the tests and the pacing
// simulation all share them.
//
// Souls are banked here for good (the meter under the reaper is his energy, a
// different thing). They come from what the user does: ghosts caught, files
// reaped, focus timers finished. Souls raise workers, which gather more souls
// on their own, including while the user is away or the app is shut. Souls
// also buy upgrades, and milestones pay a bonus the first time they are reached.
//
// The plain worker is the moss sprite (still `skeletons` and 'digger' inside,
// so saves carry over). Its sprout grows as it works: one ghost, and one more
// for every hour, up to six. Dropping the reaper on it reaps it: it bursts
// into ghosts and a hunt begins. A ghost caught banks souls and scores points;
// one that gets away is lost. Points climb ranks, each paying souls once. A
// reaped sprite leaves a seed and sprouts back after a while. Summon's
// Gathering reaps them all at once; now and then a wraith answers too.
//
// Ranks open other workers: the snail and the frog gather more and grow
// fewer ghosts, more slowly; the bee pollinates (a ghost at once); the moth
// starts as a caterpillar, catches escaping ghosts, and gives spirit-lights
// when reaped; the robin shortens the rest after a reaping; the will-o'-wisp
// makes sprouts grow faster; the ladybug brings more spirit-lights.

import * as dragons from './dragon.js';

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
// A mound of dirt swept away pays this, and no more than this many at once.
export const SWEEP_SOULS = 1;
export const MOST_MOUNDS = 16;
// A reaped skeleton rests this long, a grave where it fell, before it climbs
// back up: reaping trades its digging for a while for the hunt.
export const REST_MS = 30 * 60000;
// The most ghosts one hunt can hold: a Gathering of eight full skeletons.
export const MAX_LOOSE = 60;
// A beaten wraith pays this, and this much more for every rank reached.
export const WRAITH_SOULS = 60;
export const WRAITH_PER_RANK = 30;
// Ranks, by score; each pays its reward once, when it is reached.
export const RANKS = [
  { name: 'Groundskeeper', at: 0, reward: 0 },
  { name: 'Ghost catcher', at: 300, reward: 40 },
  { name: 'Soul warden', at: 1000, reward: 120 },
  { name: 'Shade hunter', at: 5000, reward: 300 },
  { name: 'Wraith lord', at: 14000, reward: 800 },
  { name: "The Reaper's hand", at: 60000, reward: 2500 }
];

// The kinds of skeleton. `dig` is how much one digs against a plain one,
// `ghosts` whether it ripens, `price` its cost against the next plain one,
// `rank` the rank that unlocks it, `most` how many can be raised.
// `ripest` the most ghosts it grows, `every` the hours each takes, `lights`
// the spirit-lights a reaped one gives.
export const KINDS = [
  { id: 'digger', name: 'Moss sprite', blurb: 'Gathers souls while its sprout grows; reap it at full bloom for the most ghosts.', dig: 1, ghosts: true, ripest: 6, every: 1, price: 1, rank: 0, most: Infinity },
  { id: 'snail', name: 'Snail', blurb: 'Inches along with a garden on its shell. Gathers twice as much; its flower grows ghosts slowly, three at most.', dig: 2, ghosts: true, ripest: 3, every: 2, price: 2, rank: 1, most: Infinity },
  { id: 'frog', name: 'Frog', blurb: 'Sits on its lily pad. Gathers half as much again; its lotus grows a ghost every hour and a half, four at most.', dig: 1.5, ghosts: true, ripest: 4, every: 1.5, price: 1.5, rank: 1, most: Infinity },
  { id: 'bee', name: 'Bee', blurb: 'Pollinates: buzzes to a worker and gives it a ghost on the spot (each worker once an hour).', dig: 0, ghosts: false, price: 2.5, rank: 2, most: 3 },
  { id: 'moth', name: 'Moth', blurb: 'Starts as a caterpillar, spins a cocoon, and becomes a moth that catches two ghosts that would get away when a hunt runs out. Reaped, it gives two spirit-lights.', dig: 0, ghosts: false, lights: 2, price: 2, rank: 2, most: 3 },
  { id: 'robin', name: 'Robin', blurb: 'Hops about and sings. Reaped workers come back sooner: 20 minutes with one robin, 15 with two.', dig: 0, ghosts: false, price: 3, rank: 3, most: 2 },
  { id: 'wisp', name: "Will-o'-wisp", blurb: 'A drifting flame. Gathers nothing, but every sprout grows a quarter faster for each.', dig: 0, ghosts: false, price: 3, rank: 3, most: 3 },
  { id: 'ladybug', name: 'Ladybug', blurb: 'Brings luck: each one makes spirit-lights more likely in a hunt.', dig: 0, ghosts: false, price: 3, rank: 4, most: 3 }
];
// Each moth saves this many ghosts a hunt.
export const MOTH_CATCHES = 2;
// A moth is a caterpillar this long, then a cocoon for the last half hour.
export const METAMORPHOSIS_MS = 3 * 60 * 60000;
export const COCOON_MS = 30 * 60000;
// A bee pollinates once in this long (shared among the bees), and a worker
// is pollinated at most once an hour.
export const POLLEN_MS = 20 * 60000;
// Each ladybug adds this to the chance of a spirit-light.
export const LADYBUG_LUCK = 0.05;
// Workers from older saves, under their new names.
const RENAMED = { lantern: 'wisp', ghoul: 'snail', toadstool: 'snail', bat: 'moth' };
const KIND_BY_ID = new Map(KINDS.map((k) => [k.id, k]));
const kindOf = (c, i) => KIND_BY_ID.get((c.kinds && c.kinds[i]) || 'digger') || KINDS[0];
const counted = (c, id) => (c.kinds || []).filter((k) => k === id).length;
// How fast skeletons ripen: a quarter faster for each will-o'-wisp.
// (and a guardian dragon, or the Warm roots perk).
export const ripenSpeed = (c) => (1 + 0.25 * counted(c, 'wisp')) * (1 + dragons.gardenGrowth(c.dragon));

// Upgrades change the rules instead of adding diggers. `costs` has one price
// per level; `effect` says what a level gives, for the card.
export const UPGRADES = [
  {
    id: 'shovels', name: 'Green thumbs', blurb: 'Every worker gathers 25% faster.',
    costs: [60, 110, 200, 360, 650, 1200, 2100, 3800, 6800, 12000],
    effect: (level) => '+' + level * 25 + '% gathering'
  },
  {
    id: 'graves', name: 'Deeper roots', blurb: 'They keep gathering longer while the app is shut.',
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
  { id: 'bones1', name: 'It stirs', how: 'Raise a moss sprite', reward: 10, met: (c) => c.skeletons >= 1 },
  { id: 'file1', name: 'A taste', how: 'Feed him a file', reward: 10, met: (c) => c.deeds.reaped >= 1 },
  { id: 'ghosts25', name: 'Ghost catcher', how: 'Catch 25 ghosts', reward: 25, met: (c) => c.deeds.caught >= 25 },
  { id: 'up1', name: 'Tools of the trade', how: 'Buy an upgrade', reward: 20, met: (c) => Object.values(c.upgrades).some((l) => l > 0) },
  { id: 'souls250', name: 'A full urn', how: 'Hold 250 souls over time', reward: 30, met: (c) => c.total >= 250 },
  { id: 'bones5', name: 'A little grove', how: 'Raise 5 workers', reward: 50, met: (c) => c.skeletons >= 5 },
  { id: 'glass50', name: 'The long watch', how: 'Finish a 50-minute hourglass', reward: 50, met: (c) => c.deeds.longest >= 50 },
  { id: 'glass10', name: 'Keeper of sand', how: 'Finish 10 hourglasses', reward: 100, met: (c) => c.deeds.glasses >= 10 },
  { id: 'ghosts100', name: 'Ghost warden', how: 'Catch 100 ghosts', reward: 100, met: (c) => c.deeds.caught >= 100 },
  { id: 'files25', name: 'Glutton', how: 'Feed him 25 files', reward: 75, met: (c) => c.deeds.reaped >= 25 },
  { id: 'souls2500', name: 'A full meadow', how: 'Hold 2,500 souls over time', reward: 200, met: (c) => c.total >= 2500 },
  { id: 'bones10', name: 'A garden', how: 'Raise 10 workers', reward: 150, met: (c) => c.skeletons >= 10 },
  { id: 'up10', name: 'Master of the craft', how: 'Buy 10 upgrade levels', reward: 250, met: (c) => Object.values(c.upgrades).reduce((a, b) => a + b, 0) >= 10 },
  { id: 'glass50x', name: 'Hourkeeper', how: 'Finish 50 hourglasses', reward: 500, met: (c) => c.deeds.glasses >= 50 },
  { id: 'bones25', name: 'An old wood', how: 'Raise 25 workers', reward: 600, met: (c) => c.skeletons >= 25 },
  { id: 'souls25000', name: 'An evergreen', how: 'Hold 25,000 souls over time', reward: 2000, met: (c) => c.total >= 25000 }
];

const HOUR = 3600000;
const whole = (n, max) => (Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0);
const level = (c, id) => c.upgrades[id] || 0;

// A new garden starts with enough for its first moss sprite.
export const STARTING_SOULS = BASE_COST;
export function fresh(now = Date.now()) {
  const c = clean(null, now);
  c.souls = STARTING_SOULS;
  return c;
}

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
    // Pollen from the bees, by worker; and when a bee last pollinated.
    boosts: c.boosts && typeof c.boosts === 'object' ? Object.fromEntries(Object.entries(c.boosts)
      .filter(([, b]) => b && Number.isFinite(b.n) && Number.isFinite(b.at)).map(([id, b]) => [id, { n: Math.min(6, Math.max(0, Math.floor(b.n))), at: Math.min(b.at, now) }])) : {},
    pollenAt: Number.isFinite(c.pollenAt) && c.pollenAt <= now ? c.pollenAt : 0,
    // The reaper's dragon (dragon.js), once it has one.
    dragon: dragons.cleanDragon(c.dragon, now),
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
    ? c.born.map((t, i) => [t, savedKinds[i]]).filter(([t]) => Number.isFinite(t) && t <= now + METAMORPHOSIS_MS + MAX_SKELETONS) : [];
  out.born = [];
  for (const [t, kind] of pairs.slice(0, out.skeletons)) birth(out, Math.min(t, now + METAMORPHOSIS_MS + MAX_SKELETONS), KIND_BY_ID.has(RENAMED[kind] || kind) ? RENAMED[kind] || kind : 'digger');
  while (out.born.length < out.skeletons) birth(out, now);
  out.loose = Math.min(out.loose, MAX_LOOSE);
  return out;
}

export const cost = (owned) => Math.ceil(BASE_COST * GROWTH ** owned);
// What they dig: each plain skeleton one share, a ghoul two, a bat or a wisp
// none; a resting one none, until it is back up.
const shares = (c, now = c.at) => {
  let n = 0;
  for (let i = 0; i < c.skeletons; i++) if (!c.born || c.born[i] === undefined || awake(c, i, now)) n += kindOf(c, i).dig;
  return n;
};
export const perHour = (c, now) => shares(c, now) * RATE_PER_HOUR * (1 + 0.25 * level(c, 'shovels')) * (1 + dragons.gardenSouls(c.dragon));
// Time nobody was counting (the app shut, the computer asleep) pays out up to this.
export const capHours = (c) => CAP_HOURS[level(c, 'graves')];
export const goldenChance = (c) => Math.round((GOLDEN[level(c, 'lure')] + LADYBUG_LUCK * counted(c, 'ladybug')) * 100) / 100;
// How long a reaped worker rests: shorter with robins about.
export const restMs = (c) => [30, 20, 15][Math.min(2, counted(c, 'robin'))] * 60000;

const bank = (c, n) => { c.souls += n; c.total += n; };

// Pay out what the skeletons dug since the last count. Returns the souls added.
export function settle(c, now = Date.now()) {
  const hours = Math.min(capHours(c), Math.max(0, (now - c.at) / HOUR));
  // (A grave that settled meanwhile counts from now: a little less, never more.)
  const dug = perHour(c, now) * hours;
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
    // A moth starts as a caterpillar: it is "up" once it has turned.
    if (c.born) birth(c, k.id === 'moth' ? now + METAMORPHOSIS_MS : now, k.id);
    raised += 1;
  }
  if (raised) return { ok: true, raised, kind: k.id };
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, raised: 0, error: 'The garden is full.' };
  if (counted(c, k.id) >= k.most) return { ok: false, raised: 0, error: 'No more than ' + k.most + ' ' + k.name.toLowerCase() + 's.' };
  return { ok: false, raised: 0, error: 'Not enough souls: the next ' + k.name.toLowerCase() + ' costs ' + kindCost(c, k.id) + ' and the garden holds ' + Math.floor(c.souls) + '.' };
}

// How many ghosts a skeleton that began digging at `born` holds by `now`.
// Faster with will-o'-wisps about (`speed`).
export const ripeness = (born, now = Date.now(), speed = 1) => Math.min(MAX_RIPE, 1 + Math.floor(Math.max(0, now - born) * speed / HOUR));
// What the one at `i` holds: nothing, for a kind that holds no ghosts.
// (A snail or a frog grows its ghosts more slowly, and fewer; a bee's
// pollen adds to them.)
const holds = (c, i, now) => {
  const k = kindOf(c, i);
  if (!k.ghosts || !awake(c, i, now)) return 0;
  const pollen = (c.boosts && c.boosts[c.born[i]] && c.boosts[c.born[i]].n) || 0;
  return Math.min(k.ripest, 1 + Math.floor(Math.max(0, now - c.born[i]) * ripenSpeed(c) / HOUR / k.every) + pollen);
};

// A bee pollinates the worker at `index`: one more ghost, at once. Each worker
// once an hour, and the bees between them once every POLLEN_MS.
export function pollinate(c, index, now = Date.now()) {
  tally(c, now);
  const bees = counted(c, 'bee');
  if (!bees) return { ok: false, error: 'There are no bees.' };
  const i = Math.floor(Number(index));
  if (!(i >= 0 && i < c.skeletons)) return { ok: false, error: 'No such worker.' };
  const k = kindOf(c, i);
  if (!k.ghosts || !awake(c, i, now)) return { ok: false, error: 'Nothing there to pollinate.' };
  if (now - (c.pollenAt || 0) < POLLEN_MS / bees) return { ok: false, error: 'The bees are resting.' };
  const id = c.born[i];
  const b = (c.boosts && c.boosts[id]) || { n: 0, at: -Infinity };
  if (now - b.at < HOUR) return { ok: false, error: 'That one was pollinated within the hour.' };
  if (holds(c, i, now) >= k.ripest) return { ok: false, error: 'That one is in full bloom already.' };
  c.boosts = { ...(c.boosts || {}), [id]: { n: b.n + 1, at: now } };
  c.pollenAt = now;
  return { ok: true, pollinated: i, ripe: holds(c, i, now) };
}

// A new skeleton begins to dig. Its start time is also how it is known, so no
// two share one.
// A time in the future is a skeleton still resting after a reaping. They are
// kept in time order (oldest first), each time its own.
function birth(c, now, kind = 'digger') {
  if (!c.kinds) c.kinds = [];
  while (c.kinds.length < c.born.length) c.kinds.push('digger');
  c.kinds.length = c.born.length;
  let t = now;
  while (c.born.includes(t)) t += 1;
  let i = c.born.length;
  while (i > 0 && c.born[i - 1] > t) i--;
  c.born.splice(i, 0, t);
  c.kinds.splice(i, 0, kind);
}
// Up and digging (not resting after a reaping).
// (Ones raised together are milliseconds apart, so a second's slack; a rest is minutes.)
const awake = (c, i, now = Date.now()) => c.born[i] <= now + 1000;

// Keep `born` in step with the count: new ones start now, extra ones go.
function tally(c, now) {
  if (c.boosts) {
    const ids = new Set(c.born);
    for (const id of Object.keys(c.boosts)) if (!ids.has(Number(id))) delete c.boosts[id];
  }
  if (!c.kinds) c.kinds = [];
  while (c.kinds.length < c.born.length) c.kinds.push('digger');
  while (c.born.length < c.skeletons) birth(c, now);
  c.born.length = c.skeletons;
  c.kinds.length = c.skeletons;
}

// Reap the skeleton at `index` (as drawn, oldest first): it bursts into its
// ghosts, which are loose until the hunt is done. It rests a while, a grave
// where it fell, then claws back up empty to ripen again. Its new start time
// (when it rises) is its new name.
export function reap(c, index = 0, now = Date.now()) {
  tally(c, now);
  const i = Math.floor(Number(index));
  if (!c.skeletons) return { ok: false, error: 'No moss sprites to reap. Raise one first.' };
  if (!(i >= 0 && i < c.skeletons)) return { ok: false, error: 'No such worker.' };
  const k = kindOf(c, i);
  if (!k.ghosts && !k.lights) return { ok: false, error: 'A ' + k.name.toLowerCase() + ' cannot be reaped.' };
  if (!awake(c, i, now)) return { ok: false, error: k.id === 'moth' ? 'That one is still a cocoon.' : 'That one is still a seed.' };
  // A moth gives spirit-lights, always; the others the ghosts they have grown.
  const ghosts = k.lights || holds(c, i, now);
  if (c.boosts) delete c.boosts[c.born[i]];
  c.born.splice(i, 1);
  c.kinds.splice(i, 1);
  // It rests (a seed, or a cocoon), then comes back as what it was.
  birth(c, now + restMs(c), k.id);
  c.loose = ghosts;
  return { ok: true, ghosts, lights: k.lights || 0, kind: k.id };
}

// Summon's Gathering: every skeleton at once bursts into its ghosts, and each
// past the first brings one more. All of them rise again empty. With no
// skeletons, the grave answers with a first one instead.
export function gather(c, now = Date.now()) {
  tally(c, now);
  const which = c.kinds.map((_, i) => i).filter((i) => kindOf(c, i).ghosts && awake(c, i, now));
  if (!which.length) {
    // All of them resting: say when the first is back, rather than raise another.
    const resting = c.born.filter((t, i) => kindOf(c, i).ghosts && t > now);
    if (resting.length) {
      const minutes = Math.max(1, Math.ceil((Math.min(...resting) - now) / 60000));
      return { ok: false, error: 'They are all still seeds. The first sprouts in ' + minutes + (minutes === 1 ? ' minute.' : ' minutes.') };
    }
    const risen = summon(c, now);
    return { ...risen, ghosts: 0, gathered: 0 };
  }
  const n = which.length;
  const ghosts = Math.min(MAX_LOOSE, which.reduce((sum, i) => sum + holds(c, i, now), 0) + (n - 1));
  // The others keep their places; the gathered rest, then rise again, empty.
  const taken = new Set(which);
  const keep = c.kinds.map((k, i) => [c.born[i], k]).filter((_, i) => !taken.has(i));
  const back = which.map((i) => c.kinds[i]);
  if (c.boosts) for (const i of which) delete c.boosts[c.born[i]];
  c.born = [];
  c.kinds = [];
  for (const [t, k] of keep) { c.born.push(t); c.kinds.push(k); }
  for (const kind of back) birth(c, now + restMs(c), kind);
  c.loose = ghosts;
  return { ok: true, ghosts, gathered: n };
}

// The end of a hunt: `caught` of the loose ghosts were caught, `golden` of them
// golden, for `points` with the combo. The rest are lost. Pays the souls, adds
// the points, and pays any rank newly reached.
export function hunted(c, result, now = Date.now()) {
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
  // The dragon learns from every hunt it shares.
  const dragon = c.dragon ? dragons.hunted(c.dragon, caught, now) : null;
  return { ok: true, caught, golden, points, gained, ranked: climb(c), ...(dragon && dragon.grew.length ? { dragonGrew: dragon.grew } : {}) };
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
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, error: 'The garden is full.' };
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
  if (c.souls < price) return { ok: false, error: 'Not enough souls: ' + u.name + ' costs ' + price + ' and the garden holds ' + Math.floor(c.souls) + '.' };
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
  // A finished hourglass warms the egg, or teaches the dragon.
  const dragon = c.dragon && key === 'focus' ? dragons.focus(c.dragon, n, now) : null;
  return { gained, reached: reach(c), ...(dragon ? { dragon: dragon } : {}) };
}

// The dragon: { adopt }, { pet }, { feed: souls }, { snail } (its favourite:
// one of the garden's snails), { train: kind }, { ascend },
// { perk: id }. Its time is counted first.
export function dragonAct(c, a, now = Date.now()) {
  if (a.adopt) {
    if (c.dragon) return { ok: false, error: 'He has a dragon already.' };
    c.dragon = dragons.freshDragon(now);
    return { ok: true, adopted: c.dragon.element };
  }
  const d = c.dragon;
  if (!d) return { ok: false, error: 'There is no dragon yet. Take the egg first.' };
  const aged = dragons.age(d, now);
  let out;
  if (a.pet) {
    out = dragons.pet(d, now);
    // A trickster's play is worth souls.
    const play = out.ok ? dragons.playSouls(d) : 0;
    if (play) { bank(c, play); out.gained = play; }
  } else if (a.snail) {
    // Its favourite: one of the garden's snails (one that is up, not a seed).
    const i = c.kinds.findIndex((k, j) => k === 'snail' && awake(c, j, now));
    if (i < 0) return { ok: false, error: 'There are no snails in the garden. (It checked.)' };
    out = dragons.snack(d, now);
    if (out.ok) {
      if (c.boosts) delete c.boosts[c.born[i]];
      c.born.splice(i, 1);
      c.kinds.splice(i, 1);
      c.skeletons -= 1;
    }
  } else if ('feed' in a) {
    const n = Math.floor(whole(Number(a.feed), 1e6));
    if (!n) return { ok: false, error: 'Feed it some souls.' };
    if (c.souls < n) return { ok: false, error: 'Not enough souls: the garden holds ' + Math.floor(c.souls) + '.' };
    out = dragons.feed(d, n, now);
    if (out.ok) c.souls -= out.ate;
  } else if (a.train) {
    out = dragons.train(d, a.train, now, a.quality);
  } else if (a.ascend) {
    out = dragons.ascend(d, now);
  } else if (typeof a.perk === 'string') {
    out = dragons.buyPerk(d, a.perk);
  } else {
    out = { ok: true };
  }
  return { ...out, ...(aged.hatched ? { hatched: true } : {}) };
}

// Mounds of dirt the skeletons left, swept away: a soul each.
export function sweep(c, n) {
  const count = Math.floor(whole(Number(n), MOST_MOUNDS));
  if (!count) return { ok: false, error: 'Nothing to sweep.' };
  bank(c, count * SWEEP_SOULS);
  return { ok: true, swept: count, gained: count * SWEEP_SOULS };
}

// { raise: count }, { reap: index }, { gather: true }, { sweep: mounds }, { hunt: result }, { summon: true },
// { wraith: { won } } or { buy: id }; anything else only counts the digging.
export function act(c, action, now = Date.now()) {
  settle(c, now);
  tally(c, now);
  // The dragon's time passes too: the egg warms, and may hatch.
  const aged = c.dragon ? dragons.age(c.dragon, now) : {};
  const a = action && typeof action === 'object' ? action : {};
  const out = a.raise ? raise(c, a.raise, a.kind, now)
    : 'reap' in a ? reap(c, a.reap, now)
      : a.gather ? gather(c, now)
      : 'sweep' in a ? sweep(c, a.sweep)
      : 'pollinate' in a ? pollinate(c, a.pollinate, now)
      : a.hunt ? hunted(c, a.hunt, now)
        : a.summon ? summon(c, now)
          : a.wraith ? wraith(c, !!a.wraith.won, now)
            : typeof a.buy === 'string' ? buy(c, a.buy)
              : a.dragon ? dragonAct(c, a.dragon, now) : { ok: true };
  return { ...out, ...(aged.hatched ? { hatched: true } : {}), reached: reach(c) };
}

// What the page and Speak are shown: whole souls only.
export function view(c, now = Date.now()) {
  return {
    souls: Math.floor(c.souls),
    skeletons: c.skeletons,
    nextCost: cost(c.skeletons),
    perHour: Math.round(perHour(c, now) * 10) / 10,
    total: Math.floor(c.total),
    awayCapHours: capHours(c),
    goldenChance: goldenChance(c),
    // The skeletons drawn on screen (the oldest eight): how each is known,
    // how many ghosts it holds, and what kind it is.
    // A resting one has `rest`: the minutes until it rises.
    bones: (c.born || []).slice(0, 8).map((t, i) => ({ id: t, kind: kindOf(c, i).id, ripe: holds(c, i, now), most: kindOf(c, i).ripest || 0,
      ...(t > now + 1000 ? { rest: Math.max(1, Math.round((t - now) / 60000)) } : {}) })),
    kinds: KINDS.map((k) => ({
      id: k.id, name: k.name, blurb: k.blurb, count: c.kinds ? counted(c, k.id) : 0, most: Number.isFinite(k.most) ? k.most : null,
      cost: kindCost(c, k.id), open: (c.rank || 0) >= k.rank, rank: RANKS[k.rank].name
    })),
    loose: c.loose,
    dragon: dragons.viewDragon(c.dragon, now),
    // Moths up and about (not cocoons): each saves ghosts at a hunt's end.
    moths: (c.born || []).filter((t, i) => kindOf(c, i).id === 'moth' && awake(c, i, now)).length,
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
