// The Crypt: the rules of the idle game, with no I/O, so the main process, the
// page's browser stand-in and the tests all share them.
//
// Souls are banked here for good (the meter under the reaper is his energy, a
// different thing). They come from what the user does: ghosts caught, files
// reaped, focus timers finished. Souls raise skeletons, and skeletons dig up
// more souls on their own, including while the user is away or the app is shut.
// Every ghost caught in Summon is also bound here as a spirit, which earns a
// soul an hour for good, while the crypt has room. Souls buy upgrades: for the
// dig, for the spirits' room, and for Summon itself. And the more souls the
// crypt has ever gathered, the deeper it goes: each depth adds a tenth to all
// it earns.

export const RATE_PER_HOUR = 6;   // souls one skeleton digs up in an hour
export const COST = 25;           // souls to raise a skeleton, every one alike
export const MAX_SKELETONS = 200;
// Time nobody was counting (the app shut, the computer asleep) pays out up to this.
export const AWAY_CAP_HOURS = 8;
// Spirits: what each earns in an hour, and how many the crypt holds at first.
export const SPIRIT_RATE = 1;
export const SPIRIT_ROOM = 25;
// Souls ever gathered that take the crypt a depth deeper; each adds 10% to all
// it earns.
export const DEPTHS = [100, 500, 2000, 8000, 30000, 100000];

// What each deed is worth, per unit: a ghost, a file, a minute of finished focus.
export const WORTH = { caught: 1, reaped: 5, focus: 1 };

// Upgrades, bought with souls. Each level costs twice the last.
export const UPGRADES = {
  shovels: { name: 'Shovels', max: 5, base: 40, blurb: 'Skeletons dig 50% faster.' },
  vault: { name: 'Deeper vault', max: 3, base: 50, blurb: '4 more hours counted while you are away.' },
  urns: { name: 'Urns', max: 4, base: 40, blurb: 'Room for 25 more spirits.' },
  lantern: { name: 'Lantern', max: 3, base: 30, blurb: 'Summon lasts 3 seconds longer, and the ghosts drift slower.' },
  bell: { name: 'Bone bell', max: 3, base: 30, blurb: 'More golden ghosts in Summon.' }
};

// Summon, the ghost hunt, as the upgrades leave it.
export const HUNT_SECONDS = 15;
export const GOLDEN_CHANCE = 0.15;

const HOUR = 3600000;
const whole = (n, max) => (Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0);

const noUpgrades = () => Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, 0]));

export const fresh = (now = Date.now()) => ({ souls: 0, skeletons: 0, spirits: 0, total: 0, at: now, upgrades: noUpgrades() });

// Whatever was saved, made safe to use.
export function clean(raw, now = Date.now()) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = {
    souls: whole(c.souls, 1e12),
    skeletons: Math.floor(whole(c.skeletons, MAX_SKELETONS)),
    total: whole(c.total, 1e12),
    at: Number.isFinite(c.at) && c.at <= now ? c.at : now,
    upgrades: Object.fromEntries(Object.entries(UPGRADES).map(([id, u]) => {
      const level = c.upgrades && c.upgrades[id];
      return [id, Number.isInteger(level) ? Math.max(0, Math.min(u.max, level)) : 0];
    }))
  };
  out.spirits = Math.floor(whole(c.spirits, spiritRoom(out)));
  return out;
}

// What the next skeleton costs. The same for every one, however many there are.
export const cost = () => COST;
const level = (c, id) => (c.upgrades && c.upgrades[id]) || 0;
export const depth = (c) => DEPTHS.filter((at) => c.total >= at).length;
const deepen = (c) => 1 + 0.1 * depth(c);
export const digPerHour = (c) => c.skeletons * RATE_PER_HOUR * (1 + 0.5 * level(c, 'shovels')) * deepen(c);
export const spiritsPerHour = (c) => (c.spirits || 0) * SPIRIT_RATE * deepen(c);
export const perHour = (c) => digPerHour(c) + spiritsPerHour(c);
export const spiritRoom = (c) => SPIRIT_ROOM + 25 * level(c, 'urns');
export const awayCap = (c) => AWAY_CAP_HOURS + 4 * level(c, 'vault');
// What the next level of an upgrade costs, or null once it is at its best.
export function upgradeCost(c, id) {
  const u = UPGRADES[id];
  return u && level(c, id) < u.max ? u.base * 2 ** level(c, id) : null;
}

// Summon as the crypt leaves it: how long a hunt lasts, how fast the ghosts
// drift (1 is the base pace) and how often one is golden.
export function hunt(c) {
  return {
    seconds: HUNT_SECONDS + 3 * level(c, 'lantern'),
    pace: 1 - 0.15 * level(c, 'lantern'),
    golden: GOLDEN_CHANCE + 0.06 * level(c, 'bell')
  };
}

// Pay out what the skeletons dug since the last count. Returns the souls added.
export function settle(c, now = Date.now()) {
  const hours = Math.min(awayCap(c), Math.max(0, (now - c.at) / HOUR));
  const dug = perHour(c) * hours;
  c.souls += dug;
  c.total += dug;
  c.at = now;
  return dug;
}

// Souls for a deed. Returns the souls added (0 for anything unknown).
export function earn(c, deed, n) {
  if (!(deed in WORTH) || !Number.isFinite(n) || n <= 0) return 0;
  const gained = Math.min(1000, n) * WORTH[deed];
  c.souls += gained;
  c.total += gained;
  // Ghosts caught are bound as spirits too, while there is room for them.
  if (deed === 'caught') c.spirits = Math.min(spiritRoom(c), (c.spirits || 0) + Math.floor(Math.min(1000, n)));
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

// Buy the next level of an upgrade, if the souls allow.
export function buy(c, id) {
  const u = UPGRADES[id];
  if (!u) return { ok: false, error: 'No such upgrade. There are: ' + Object.keys(UPGRADES).join(', ') + '.' };
  const price = upgradeCost(c, id);
  if (price === null) return { ok: false, error: u.name + ' is already at its best.' };
  if (c.souls < price) return { ok: false, error: 'Not enough souls: ' + u.name + ' costs ' + price + ' and the crypt holds ' + Math.floor(c.souls) + '.' };
  c.souls -= price;
  c.upgrades = { ...noUpgrades(), ...c.upgrades, [id]: level(c, id) + 1 };
  return { ok: true, id, level: c.upgrades[id], spent: price };
}

// What the page and Speak are shown: whole souls only.
export function view(c) {
  return {
    souls: Math.floor(c.souls),
    skeletons: c.skeletons,
    nextCost: cost(c.skeletons),
    spirits: c.spirits || 0,
    spiritRoom: spiritRoom(c),
    digPerHour: Math.round(digPerHour(c)),
    spiritsPerHour: Math.round(spiritsPerHour(c)),
    perHour: Math.round(perHour(c)),
    depth: depth(c),
    depthBonus: Math.round(10 * depth(c)),
    nextDepthAt: DEPTHS[depth(c)] ?? null,
    total: Math.floor(c.total),
    awayCapHours: awayCap(c),
    upgrades: Object.entries(UPGRADES).map(([id, u]) => ({
      id, name: u.name, blurb: u.blurb, level: level(c, id), max: u.max, cost: upgradeCost(c, id)
    })),
    hunt: hunt(c)
  };
}
