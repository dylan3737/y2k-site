// The Crypt: the rules of the idle game, with no I/O, so the main process, the
// page's browser stand-in, the tests and the pacing simulation all share them.
//
// Souls are banked here for good (the meter under the reaper is his energy, a
// different thing). They come from what the user does: ghosts caught, files
// reaped, focus timers finished. Souls raise skeletons, which dig up more souls
// on their own, including while the user is away or the app is shut. Souls
// also buy upgrades, and milestones pay a bonus the first time they are reached.

export const RATE_PER_HOUR = 1.5; // souls one skeleton digs up in an hour
export const BASE_COST = 25;      // the first skeleton
export const GROWTH = 1.25;      // each one costs this much more than the last
// These numbers were tuned with tools/pacing.mjs; run it after changing any.
export const MAX_SKELETONS = 200;

// What each deed is worth, per unit: a ghost, a file, a minute of finished focus.
export const WORTH = { caught: 1, reaped: 5, focus: 1 };

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
    id: 'lure', name: 'Ghost lure', blurb: 'More of the ghosts in Summon are golden.',
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
  return {
    souls: whole(c.souls, 1e12),
    skeletons: Math.floor(whole(c.skeletons, MAX_SKELETONS)),
    total: whole(c.total, 1e12),
    at: Number.isFinite(c.at) && c.at <= now ? c.at : now,
    upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, Math.floor(whole(upgrades[u.id], u.costs.length))])),
    done: Array.isArray(c.done) ? MILESTONES.map((m) => m.id).filter((id) => c.done.includes(id)) : [],
    // Counted for good; the daily tally elsewhere forgets at midnight.
    deeds: {
      caught: whole(deeds.caught, 1e9), reaped: whole(deeds.reaped, 1e9),
      glasses: whole(deeds.glasses, 1e9), longest: whole(deeds.longest, 180)
    }
  };
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
    raised += 1;
  }
  if (raised) return { ok: true, raised };
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, raised: 0, error: 'The crypt is full.' };
  return { ok: false, raised: 0, error: 'Not enough souls: the next skeleton costs ' + cost(c.skeletons) + ' and the crypt holds ' + Math.floor(c.souls) + '.' };
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

// { raise: count } or { buy: id }; anything else only counts the digging.
export function act(c, action, now = Date.now()) {
  settle(c, now);
  const a = action && typeof action === 'object' ? action : {};
  const out = a.raise ? raise(c, a.raise) : typeof a.buy === 'string' ? buy(c, a.buy) : { ok: true };
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
    upgrades: UPGRADES.map((u) => ({
      id: u.id, name: u.name, blurb: u.blurb, level: level(c, u.id), max: u.costs.length,
      cost: upgradeCost(c, u.id), now: u.effect(level(c, u.id)),
      next: level(c, u.id) < u.costs.length ? u.effect(level(c, u.id) + 1) : null
    })),
    milestones: MILESTONES.map((m) => ({ name: m.name, how: m.how, reward: m.reward, done: c.done.includes(m.id) }))
  };
}
