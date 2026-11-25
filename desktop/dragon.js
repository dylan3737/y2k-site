// Its favourite food is snails.
//
// The reaper's dragon: its rules, with no I/O, like crypt.js (it lives in the
// garden's saved state, as `c.dragon`, so the two can lean on each other).
//
// An egg, of one of four elements, hatches when it is warm enough: warmth
// comes slowly on its own, from being rubbed, and from finished hourglasses.
// The dragon grows by experience (souls fed to it, training, petting, the
// hunts it helps with) through five stages, and an Ancient form for a lineage
// that has ascended twice. Bond, from care, speeds growth and fades if it is
// left alone for days. Energy, which comes back with time, pays for training.
//
// Training is of three kinds; whichever it had most decides, when it becomes
// a wyvern, what it grows into: a Hunter breathes on ghosts in hunts, a
// Guardian makes the garden's sprouts grow faster, a Trickster earns souls
// when it plays.
//
// Prestige: an elder with a strong bond can ascend. It leaves Dragon Scales,
// which are kept for good, and returns as an egg of a new element, one
// lineage higher (it grows faster, and further). Scales buy perks in four
// lines: power, garden, looks and tricks.

export const ELEMENTS = ['ember', 'frost', 'shadow', 'storm'];
export const STAGES = ['egg', 'hatchling', 'drake', 'wyvern', 'elder', 'ancient'];
// Experience to reach each stage (from hatchling on).
export const XP_AT = [0, 0, 150, 900, 2800, 8000];
// An elder can ascend once it has matured this far (its scales have hardened).
export const ASCEND_XP = 4500;
export const BRANCHES = { hunt: 'hunter', garden: 'guardian', tricks: 'trickster' };
const HOUR = 3600000;
const DAY = 24 * HOUR;
export const WARM_PER_HOUR = 4;      // an egg warms this much an hour on its own
export const PET_GAP_MS = 8000;      // petting counts once in this long
export const ENERGY_PER_HOUR = 12;
export const TRAIN_COST = 25;
export const BOND_DECAY_PER_DAY = 6;
export const ASCEND_BOND = 60;
// Its appetite: how much growth souls can give it in a day, at each stage,
// and how many souls make one point of growth (a bigger dragon eats more).
// Without a limit, a full garden could buy a whole dragon in an afternoon.
export const APPETITE = [0, 40, 70, 100, 140, 180];
export const MEAL_SOULS = [0, 2, 5, 12, 25, 40];
// Petting teaches it a little, but only this much a day.
export const PET_XP_A_DAY = 20;
// A snail is a treat: one a day.
export const SNAILS_A_DAY = 1;
// Rubbing an egg warms it, but only this much a day: time and hourglasses do the rest.
export const PET_WARMTH_A_DAY = 20;

// Perks bought with Dragon Scales: one price per level; what a level gives.
export const PERKS = [
  { id: 'power', name: 'Old blood', blurb: 'Grows faster, and a hunter breathes on more ghosts.', costs: [3, 6, 12, 20, 32], effect: (l) => '+' + l * 15 + '% growth, +' + l + ' breath' },
  { id: 'garden', name: 'Warm roots', blurb: 'The whole garden gathers more and grows faster.', costs: [4, 8, 14, 24, 36], effect: (l) => '+' + l * 10 + '% souls and growth' },
  { id: 'looks', name: 'Gleam', blurb: 'A brighter glow and an aura, deeper each level.', costs: [2, 5, 10], effect: (l) => ['no aura', 'a soft aura', 'a bright aura', 'a blazing aura'][l] },
  { id: 'tricks', name: 'Lore', blurb: 'Tricks only an ascended line learns: dive at a wraith, light up finished hourglasses, fetch ghosts back.', costs: [5, 10, 18], effect: (l) => ['none', 'dive at wraiths', '+ hourglass fireworks', '+ fetches escaping ghosts'][l] }
];
const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

// Treasure: now and then something shiny drifts across the screen, and the
// dragon catches it and carries it to its hoard. Each pays souls; now and
// then it is a relic, which levels up a lasting boost. One at most every
// TREASURE_GAP_MS, TREASURES_A_DAY a day.
export const TREASURE_GAP_MS = 4 * 60000;
export const TREASURES_A_DAY = 15;
export const TREASURE_SOULS = 15;   // a treasure's souls, times its stage
export const RELIC_CHANCE = 0.2;
export const RELICS = [
  { id: 'star', name: 'Star shard', blurb: 'Hunts pay 5% more souls a level.', max: 5 },
  { id: 'coin', name: 'Old coin', blurb: 'The garden gathers 5% more a level.', max: 5 },
  { id: 'pearl', name: 'Moon pearl', blurb: 'The dragon grows 5% faster a level.', max: 5 },
  { id: 'lantern', name: 'Ghost lantern', blurb: 'Spirit-lights are 2% more likely a level.', max: 5 },
  { id: 'sand', name: 'Sand of ages', blurb: 'Finished hourglasses pay 5% more a level.', max: 5 }
];
const relicLevel = (d, id) => (d && d.hoard && d.hoard.relics[id]) || 0;

// Crows: now and then a shadow crow swoops at the garden's ripest sprout. The
// dragon intercepts it (by itself, or sent with a click); one that gets
// through steals a ghost. One at most every CROW_GAP_MS, CROWS_A_DAY a day.
export const CROW_GAP_MS = 6 * 60000;
export const CROWS_A_DAY = 12;
export const CROW_SOULS = 8;  // a crow stopped, times the dragon's stage

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (n, d = 0) => (Number.isFinite(n) ? n : d);
const pick = (rand) => ELEMENTS[Math.floor(rand() * ELEMENTS.length) % ELEMENTS.length];

export function freshDragon(now = Date.now(), rand = Math.random, lineage = 0) {
  return {
    element: pick(rand), stage: 0, warmth: 0, xp: 0, bond: 20, energy: 100,
    train: { hunt: 0, garden: 0, tricks: 0 }, branch: null,
    lineage, scales: 0, perks: { power: 0, garden: 0, looks: 0, tricks: 0 },
    petAt: 0, caredAt: now, at: now,
    // Its hoard: treasures caught, ever; relics by level; when it last found one.
    hoard: { treasures: 0, relics: {}, foundAt: 0 },
    // Crows: when the last came, and how many it has stopped, ever.
    guard: { crowAt: 0, stopped: 0 },
    // What it has had today (a UTC day): growth from meals, snails, warmth from rubbing.
    today: { day: Math.floor(now / DAY), ate: 0, snails: 0, warmth: 0, petted: 0, treasures: 0, crows: 0 }
  };
}

// A saved dragon, made sane.
export function cleanDragon(raw, now = Date.now()) {
  const d = raw && typeof raw === 'object' ? raw : null;
  if (!d) return null;
  const out = freshDragon(now, () => 0, Math.floor(clamp(num(d.lineage), 0, 99)));
  out.element = ELEMENTS.includes(d.element) ? d.element : 'shadow';
  out.stage = Math.floor(clamp(num(d.stage), 0, STAGES.length - 1));
  out.warmth = clamp(num(d.warmth), 0, 100);
  out.xp = clamp(num(d.xp), 0, 1e9);
  out.bond = clamp(num(d.bond, 20), 0, 100);
  out.energy = clamp(num(d.energy, 100), 0, 100);
  for (const k of Object.keys(out.train)) out.train[k] = Math.floor(clamp(num(d.train && d.train[k]), 0, 1e6));
  out.branch = Object.values(BRANCHES).includes(d.branch) ? d.branch : null;
  out.scales = Math.floor(clamp(num(d.scales), 0, 1e9));
  for (const p of PERKS) out.perks[p.id] = Math.floor(clamp(num(d.perks && d.perks[p.id]), 0, p.costs.length));
  const h = d.hoard && typeof d.hoard === 'object' ? d.hoard : {};
  out.hoard = {
    treasures: Math.floor(clamp(num(h.treasures), 0, 1e7)),
    relics: Object.fromEntries(RELICS.map((r) => [r.id, Math.floor(clamp(num(h.relics && h.relics[r.id]), 0, r.max))]).filter(([, l]) => l > 0)),
    foundAt: clamp(num(h.foundAt), 0, now)
  };
  const g = d.guard && typeof d.guard === 'object' ? d.guard : {};
  out.guard = { crowAt: clamp(num(g.crowAt), 0, now), stopped: Math.floor(clamp(num(g.stopped), 0, 1e7)) };
  out.petAt = clamp(num(d.petAt), 0, now);
  out.caredAt = clamp(num(d.caredAt, now), 0, now);
  out.at = clamp(num(d.at, now), 0, now);
  const t = d.today && typeof d.today === 'object' ? d.today : {};
  if (num(t.day, -1) === Math.floor(now / DAY)) {
    out.today = { day: t.day, ate: clamp(num(t.ate), 0, 1e6), snails: Math.floor(clamp(num(t.snails), 0, 99)), warmth: clamp(num(t.warmth), 0, 100), petted: clamp(num(t.petted), 0, 1e6), treasures: Math.floor(clamp(num(t.treasures), 0, 99)), crows: Math.floor(clamp(num(t.crows), 0, 99)) };
  }
  return out;
}

// What it most needs to grow, against its lineage and perks.
const growth = (d) => (1 + 0.2 * d.lineage) * (1 + 0.15 * d.perks.power) * (0.8 + d.bond / 250) * (1 + 0.05 * relicLevel(d, 'pearl'));
const topStage = (d) => (d.lineage >= 2 ? 5 : 4);

// Time passing: the egg warms, energy returns, bond fades if it is neglected.
export function age(d, now = Date.now()) {
  const hours = Math.max(0, (now - d.at) / HOUR);
  if (d.stage === 0) d.warmth = clamp(d.warmth + hours * WARM_PER_HOUR, 0, 100);
  d.energy = clamp(d.energy + hours * ENERGY_PER_HOUR, 0, 100);
  // Fading starts a day after it was last cared for: of the time since the
  // last count, only the part past that day counts.
  const lonely = Math.max(0, now - Math.max(d.at, d.caredAt + DAY));
  d.bond = clamp(d.bond - lonely / DAY * BOND_DECAY_PER_DAY, 0, 100);
  d.at = now;
  return hatchIfReady(d);
}

function hatchIfReady(d) {
  if (d.stage === 0 && d.warmth >= 100) {
    d.stage = 1;
    return { hatched: true };
  }
  return {};
}

// Experience gained: it may grow a stage (or several), and at the wyvern its
// training decides what it becomes.
export function gain(d, xp) {
  if (d.stage === 0 || !(xp > 0)) return { gained: 0, grew: [] };
  const got = Math.round(xp * growth(d));
  d.xp += got;
  const grew = [];
  while (d.stage < topStage(d) && d.xp >= XP_AT[d.stage + 1]) {
    d.stage += 1;
    grew.push(STAGES[d.stage]);
    if (d.stage === 3 && !d.branch) d.branch = branchOf(d);
  }
  return { gained: got, grew };
}

export function branchOf(d) {
  const order = ['hunt', 'garden', 'tricks'];
  const best = order.reduce((a, b) => (d.train[b] > d.train[a] ? b : a), order[0]);
  // Untrained, the element leans it one way.
  if (!d.train[best]) return { ember: 'hunter', frost: 'guardian', shadow: 'trickster', storm: 'hunter' }[d.element];
  return BRANCHES[best];
}

// Today's tally, started afresh on a new day.
const todayOf = (d, now) => {
  const day = Math.floor(now / DAY);
  if (!d.today || d.today.day !== day) d.today = { day, ate: 0, snails: 0, warmth: 0, petted: 0, treasures: 0, crows: 0 };
  return d.today;
};
// Growth it can still take from meals today.
export const appetiteLeft = (d, now = Date.now()) => (d.stage === 0 ? 0 : Math.max(0, APPETITE[d.stage] - todayOf(d, now).ate));

const care = (d, now, bond) => {
  d.bond = clamp(d.bond + bond, 0, 100);
  d.caredAt = now;
};

export function pet(d, now = Date.now()) {
  if (now - d.petAt < PET_GAP_MS) return { ok: false, error: 'It has had enough fuss for a moment.' };
  d.petAt = now;
  care(d, now, 2);
  if (d.stage === 0) {
    const t = todayOf(d, now);
    const w = Math.min(3, PET_WARMTH_A_DAY - t.warmth);
    t.warmth += Math.max(0, w);
    d.warmth = clamp(d.warmth + Math.max(0, w), 0, 100);
    return { ok: true, warmth: Math.round(d.warmth), ...hatchIfReady(d) };
  }
  const t = todayOf(d, now);
  const xp = Math.max(0, Math.min(2, PET_XP_A_DAY - t.petted));
  t.petted += xp;
  return { ok: true, ...gain(d, xp) };
}

// Warmth from a finished hourglass of `minutes` (an egg), or experience (a dragon).
export function focus(d, minutes, now = Date.now()) {
  const m = clamp(num(minutes), 0, 180);
  care(d, now, 1);
  if (d.stage === 0) {
    d.warmth = clamp(d.warmth + m * 0.8, 0, 100);
    return { ok: true, warmth: Math.round(d.warmth), ...hatchIfReady(d) };
  }
  return { ok: true, ...gain(d, m / 2) };
}

// Feeding souls. It eats only as much as its appetite allows today, and says
// how many souls it ate (`ate`): the caller takes those from the garden.
export function feed(d, souls, now = Date.now()) {
  if (d.stage === 0) return { ok: false, error: 'An egg does not eat. Keep it warm.' };
  const left = appetiteLeft(d, now);
  if (left <= 0) return { ok: false, error: 'It is full. It will be hungry again tomorrow.' };
  const per = MEAL_SOULS[d.stage];
  const growth = Math.min(left, Math.floor(num(souls) / per));
  if (growth <= 0) return { ok: false, error: 'A ' + STAGES[d.stage] + ' needs at least ' + per + ' souls for a mouthful.' };
  todayOf(d, now).ate += growth;
  care(d, now, 1);
  return { ok: true, ate: growth * per, full: appetiteLeft(d, now) <= 0, ...gain(d, growth) };
}

// Its favourite food: a snail from the garden (the caller takes it from
// there). Worth more than a day of meals, and it loves you for it; one a day.
export const SNAIL_XP = 80;
export function snack(d, now = Date.now()) {
  if (d.stage === 0) return { ok: false, error: 'An egg does not eat. Keep it warm.' };
  const t = todayOf(d, now);
  if (t.snails >= SNAILS_A_DAY) return { ok: false, error: 'It has had its snail today. Tomorrow.' };
  t.snails += 1;
  care(d, now, 12);
  return { ok: true, ate: 'snail', ...gain(d, SNAIL_XP) };
}

// A training session; `quality` (0 to 1) is how well the drill went (the
// page's little games: target practice, a flight lesson, fetch). Ten for
// turning up, up to thirty for a perfect drill.
export function train(d, kind, now = Date.now(), quality = 0.5) {
  if (!(kind in d.train)) return { ok: false, error: 'Train it to hunt, to tend the garden, or in tricks.' };
  if (d.stage === 0) return { ok: false, error: 'It has not hatched yet.' };
  if (d.energy < TRAIN_COST) return { ok: false, error: 'It is tired. Let it rest a while.' };
  const q = clamp(num(quality, 0.5), 0, 1);
  d.energy -= TRAIN_COST;
  d.train[kind] += 1;
  care(d, now, 2 + Math.round(q * 3));
  return { ok: true, trained: kind, quality: Math.round(q * 100) / 100, ...gain(d, 10 + 20 * q) };
}

// Ghosts it helped catch in a hunt.
// A hunt it shared: it eats some of the ghosts, which counts towards its
// appetite like a meal (a point of growth a ghost), but ghosts fill only half
// of it: the rest is for meals.
export const huntAppetiteLeft = (d, now = Date.now()) => Math.max(0, appetiteLeft(d, now) - APPETITE[d.stage] / 2);
export function hunted(d, caught, now = Date.now()) {
  if (d.stage === 0 || !(caught > 0)) return { gained: 0, grew: [] };
  d.caredAt = Math.max(d.caredAt, now - DAY / 2);
  const xp = Math.min(huntAppetiteLeft(d, now), Math.min(60, caught));
  todayOf(d, now).ate += xp;
  return gain(d, xp);
}

// What ascending would leave behind, if it can.
export function ascendable(d) {
  if (d.stage < 4) return { ok: false, why: 'Only an elder can ascend.' };
  if (d.xp < ASCEND_XP) return { ok: false, why: 'It is a young elder: it can ascend at ' + ASCEND_XP + ' growth.' };
  if (d.bond < ASCEND_BOND) return { ok: false, why: 'Its bond must be ' + ASCEND_BOND + ' or more.' };
  return { ok: true, scales: 10 + Math.floor(d.xp / 400) + 5 * d.lineage + (d.stage === 5 ? 15 : 0) };
}

export function ascend(d, now = Date.now(), rand = Math.random) {
  const can = ascendable(d);
  if (!can.ok) return { ok: false, error: can.why };
  const next = freshDragon(now, rand, d.lineage + 1);
  // A new element, never the one it was.
  if (next.element === d.element) next.element = ELEMENTS[(ELEMENTS.indexOf(d.element) + 1) % ELEMENTS.length];
  next.scales = d.scales + can.scales;
  next.perks = { ...d.perks };
  next.bond = Math.max(30, Math.round(d.bond / 2));
  Object.assign(d, next);
  return { ok: true, scales: can.scales, lineage: d.lineage, element: d.element };
}

export function buyPerk(d, id) {
  const p = PERK_BY_ID.get(id);
  if (!p) return { ok: false, error: 'No such perk. There are: ' + PERKS.map((x) => x.id).join(', ') + '.' };
  const lvl = d.perks[id];
  if (lvl >= p.costs.length) return { ok: false, error: p.name + ' can go no further.' };
  const price = p.costs[lvl];
  if (d.scales < price) return { ok: false, error: 'Not enough scales: ' + p.name + ' costs ' + price + '.' };
  d.scales -= price;
  d.perks[id] = lvl + 1;
  return { ok: true, perk: id, name: p.name, level: lvl + 1 };
}

// What it does for the rest of the game.
// How many ghosts a hunter breathes on in one hunt.
export const breaths = (d) => (d && d.branch === 'hunter' && d.stage >= 3 ? d.stage - 1 + d.perks.power : 0);
// How much faster the garden's sprouts grow, and how many more souls it gathers.
export const gardenGrowth = (d) => (d ? (d.branch === 'guardian' && d.stage >= 3 ? 0.25 * (d.stage - 2) : 0) + 0.1 * d.perks.garden : 0);
export const gardenSouls = (d) => (d ? 0.1 * d.perks.garden + 0.05 * relicLevel(d, 'coin') : 0);
// What its relics add elsewhere: to hunts' souls, spirit-lights, hourglasses.
export const huntBonus = (d) => 0.05 * relicLevel(d, 'star');
export const lightBonus = (d) => 0.02 * relicLevel(d, 'lantern');
export const sandBonus = (d) => 0.05 * relicLevel(d, 'sand');

// Can it find a treasure now? (A hatched dragon, past the gap, under the day's count.)
export function treasureReady(d, now = Date.now()) {
  if (!d || d.stage === 0) return { ok: false, why: 'An egg finds nothing.' };
  if (todayOf(d, now).treasures >= TREASURES_A_DAY) return { ok: false, why: 'It has found all it will today.' };
  const wait = d.hoard.foundAt + TREASURE_GAP_MS - now;
  if (wait > 0) return { ok: false, why: 'Nothing shiny yet.', wait };
  return { ok: true };
}

// Can a crow come now? (A hatched dragon to guard, past the gap, under the day's count.)
export function crowReady(d, now = Date.now()) {
  if (!d || d.stage === 0) return { ok: false, why: 'Nothing guards the garden yet.' };
  if (todayOf(d, now).crows >= CROWS_A_DAY) return { ok: false, why: 'No more crows today.' };
  if (d.guard.crowAt + CROW_GAP_MS > now) return { ok: false, why: 'No crow about.' };
  return { ok: true };
}
// How likely it is to go after a crow by itself: a guardian nearly always,
// others more as they grow.
export const watchfulness = (d) => (!d || d.stage === 0 ? 0 : d.branch === 'guardian' ? 0.9 : Math.min(0.75, 0.35 + 0.1 * d.stage));

// A crow came: `stopped` (the dragon got it: souls, which the caller banks;
// guarding earns for the garden, it does not grow the dragon) or not (it got through: the caller takes a ghost).
export function crow(d, stopped, now = Date.now()) {
  const ready = crowReady(d, now);
  if (!ready.ok) return { ok: false, error: ready.why };
  todayOf(d, now).crows += 1;
  d.guard.crowAt = now;
  if (!stopped) return { ok: true, stopped: false };
  d.guard.stopped += 1;
  care(d, now, 1);
  return { ok: true, stopped: true, souls: CROW_SOULS * d.stage };
}

// It caught a treasure and brought it home: souls for the garden (the caller
// banks them), and now and then a relic.
export function treasure(d, now = Date.now(), rand = Math.random) {
  const ready = treasureReady(d, now);
  if (!ready.ok) return { ok: false, error: ready.why };
  todayOf(d, now).treasures += 1;
  d.hoard.treasures += 1;
  d.hoard.foundAt = now;
  care(d, now, 1);
  const souls = TREASURE_SOULS * d.stage;
  const open = RELICS.filter((r) => relicLevel(d, r.id) < r.max);
  if (open.length && rand() < RELIC_CHANCE) {
    const r = open[Math.floor(rand() * open.length) % open.length];
    d.hoard.relics[r.id] = relicLevel(d, r.id) + 1;
    return { ok: true, souls, relic: { id: r.id, name: r.name, level: d.hoard.relics[r.id] } };
  }
  return { ok: true, souls };
}
// Souls a trickster earns when it plays (is petted).
export const playSouls = (d) => (d && d.branch === 'trickster' && d.stage >= 3 ? 2 * (d.stage - 1) : 0);

// What the page and Speak are shown.
export function viewDragon(d, now = Date.now()) {
  if (!d) return null;
  const next = d.stage >= 1 && d.stage < topStage(d) ? XP_AT[d.stage + 1] : null;
  const can = ascendable(d);
  return {
    element: d.element, stage: STAGES[d.stage], stageIndex: d.stage, warmth: Math.round(d.warmth),
    xp: Math.round(d.xp), nextAt: next, bond: Math.round(d.bond), energy: Math.round(d.energy),
    train: { ...d.train }, branch: d.branch, lineage: d.lineage, scales: d.scales,
    canTrain: d.stage > 0 && d.energy >= TRAIN_COST,
    // Today: growth it can still take from meals, souls per mouthful, a snail still to come.
    appetite: d.stage ? { left: appetiteLeft(d, now), of: APPETITE[d.stage], souls: MEAL_SOULS[d.stage] } : null,
    snailToday: d.stage > 0 && todayOf(d, now).snails < SNAILS_A_DAY,
    ascend: can.ok ? { scales: can.scales } : { why: can.why },
    perks: PERKS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb, level: d.perks[p.id], max: p.costs.length,
      cost: d.perks[p.id] < p.costs.length ? p.costs[d.perks[p.id]] : null, now: p.effect(d.perks[p.id]) })),
    breaths: breaths(d), aura: d.perks.looks,
    hoard: { treasures: d.hoard.treasures, findable: treasureReady(d, now).ok,
      // When the next can be found, and how many more today.
      findAt: d.hoard.foundAt + TREASURE_GAP_MS, left: Math.max(0, TREASURES_A_DAY - todayOf(d, now).treasures),
      // Crows: when the next may come, how many more today, how watchful it is, how many it has stopped.
      crowAt: d.guard.crowAt + CROW_GAP_MS, crowsLeft: Math.max(0, CROWS_A_DAY - todayOf(d, now).crows), watch: watchfulness(d), stopped: d.guard.stopped,
      relics: RELICS.map((r) => ({ id: r.id, name: r.name, blurb: r.blurb, level: relicLevel(d, r.id), max: r.max })) }
  };
}
