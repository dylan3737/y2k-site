// The dragon's rules (dragon.js), and how it reaches the garden (crypt.js).
import * as dragon from '../dragon.js';
import * as crypt from '../crypt.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}
const T0 = 1_800_000_000_000;
const HOUR = 3600000;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// The egg.
let d = dragon.freshDragon(T0, seq(0.6));
check('an egg comes with its element', d.stage === 0 && d.element === 'shadow');
dragon.age(d, T0 + 10 * HOUR);
check('it warms slowly on its own', Math.round(d.warmth) === 40 && d.stage === 0);
let out = dragon.pet(d, T0 + 10 * HOUR);
check('rubbing it warms it', out.ok && out.warmth === 43);
check('but not over and over', !dragon.pet(d, T0 + 10 * HOUR + 1000).ok);
out = dragon.focus(d, 50, T0 + 10 * HOUR + 1000);
check('a finished hourglass warms it more', out.warmth === 83);
check('an egg does not eat or train', !dragon.feed(d, 10).ok && !dragon.train(d, 'hunt').ok);
out = dragon.age(d, T0 + 15 * HOUR);
check('warm enough, it hatches', out.hatched && d.stage === 1 && dragon.viewDragon(d).stage === 'hatchling');

// Growing.
out = dragon.feed(d, 100, T0 + 15 * HOUR);
check('fed souls, it grows', out.ok && out.gained > 0 && d.xp === out.gained);
const xp0 = d.xp;
out = dragon.train(d, 'garden', T0 + 15 * HOUR);
check('training costs energy and teaches it', out.ok && d.energy === 75 && d.train.garden === 1 && d.xp > xp0);
for (let i = 0; i < 3; i++) dragon.train(d, 'garden', T0 + 15 * HOUR);
check('tired, it will not train', !dragon.train(d, 'hunt', T0 + 15 * HOUR).ok && d.energy < dragon.TRAIN_COST);
dragon.age(d, T0 + 25 * HOUR);
check('rest brings its energy back', d.energy === 100);
out = dragon.feed(d, 2000, T0 + 25 * HOUR);
check('grown enough, it becomes a wyvern, and what it trained most decides its path', d.stage >= 3 && d.branch === 'guardian' && out.grew.includes('wyvern'), JSON.stringify(out));
check('a guardian makes the garden grow faster', dragon.gardenGrowth(d) > 0 && dragon.breaths(d) === 0 && dragon.playSouls(d) === 0);
const h = dragon.freshDragon(T0, seq(0.1));
h.stage = 1; h.train.hunt = 2;
dragon.feed(h, 3000, T0);
check('one trained to hunt becomes a hunter, and breathes on ghosts', h.branch === 'hunter' && dragon.breaths(h) >= 2);
const t = dragon.freshDragon(T0, seq(0.8));
t.stage = 1;
dragon.feed(t, 3000, T0);
check('untrained, the element leans it (storm: a hunter)', t.element === 'storm' && t.branch === 'hunter');

// Bond.
const lonely = dragon.freshDragon(T0, seq(0.3));
lonely.bond = 50;
dragon.age(lonely, T0 + 12 * HOUR);
check('a day of quiet costs no bond', lonely.bond === 50);
dragon.age(lonely, T0 + 3 * 24 * HOUR);
check('but days alone do', lonely.bond === 50 - 2 * dragon.BOND_DECAY_PER_DAY, String(lonely.bond));

// Ascension.
const young = dragon.freshDragon(T0, seq(0.1));
young.stage = 2;
check('a young one cannot ascend', !dragon.ascend(young, T0).ok && /elder/.test(dragon.ascendable(young).why));
const e = dragon.freshDragon(T0, seq(0.1));
e.stage = 1;
dragon.feed(e, 50000, T0);
check('an elder stops at elder in its first lineage', e.stage === 4);
e.bond = 40;
check('it needs a strong bond to ascend', /bond/.test(dragon.ascendable(e).why));
e.bond = 80;
const gift = dragon.ascendable(e).scales;
out = dragon.ascend(e, T0, seq(0.1));
check('it ascends: scales kept, an egg of a new element, a lineage higher', out.ok && e.stage === 0 && e.scales === gift && gift >= 10 &&
  e.lineage === 1 && e.element !== 'ember', JSON.stringify(out));
out = dragon.buyPerk(e, 'power');
check('scales buy perks', out.ok && e.perks.power === 1 && e.scales === gift - 3);
check('and not what they cannot pay for', !dragon.buyPerk(e, 'tricks').ok || e.scales >= 0);
check('no such perk', !dragon.buyPerk(e, 'wings').ok);
const twice = dragon.freshDragon(T0, seq(0.2), 2);
twice.stage = 1;
dragon.feed(twice, 1e5, T0);
check('a line that ascended twice can grow Ancient', twice.stage === 5 && dragon.viewDragon(twice).stage === 'ancient');
check('a dragon survives a save', JSON.stringify(dragon.cleanDragon(JSON.parse(JSON.stringify(e)), T0)) === JSON.stringify(e));
check('nonsense in a save is made sane', dragon.cleanDragon({ element: 'lava', stage: 99, bond: -5, perks: { power: 99 } }, T0).stage === 5 &&
  dragon.cleanDragon({ element: 'lava' }, T0).element === 'shadow' && dragon.cleanDragon({ perks: { power: 99 } }, T0).perks.power === 5);

// Through the garden.
const g = crypt.fresh(T0);
g.souls = 1000;
check('no dragon until the egg is taken', crypt.view(g).dragon === null && !crypt.act(g, { dragon: { pet: true } }, T0).ok);
out = crypt.act(g, { dragon: { adopt: true } }, T0);
check('the egg is taken', out.ok && crypt.view(g).dragon.stage === 'egg' && !crypt.act(g, { dragon: { adopt: true } }, T0).ok);
crypt.deed(g, 'focus', 25, T0);
check('a finished hourglass warms the egg through the garden', crypt.view(g).dragon.warmth === 20);
out = crypt.act(g, {}, T0 + 30 * HOUR);
check('time passing hatches it, and the garden says so', out.hatched === true && crypt.view(g).dragon.stage === 'hatchling', JSON.stringify(out));
const souls0 = Math.floor(g.souls);
out = crypt.act(g, { dragon: { feed: 100 } }, T0 + 30 * HOUR);
check('feeding takes the souls from the garden', out.ok && Math.floor(g.souls) === souls0 - 100);
check('and not more than it holds', !crypt.act(g, { dragon: { feed: 1e6 } }, T0 + 30 * HOUR).ok);
g.dragon.branch = 'guardian'; g.dragon.stage = 4;
check('a guardian elder makes the garden\'s sprouts grow faster', crypt.ripenSpeed(g) === 1.5);
g.dragon.perks.garden = 2;
crypt.act(g, { raise: 1 }, T0 + 30 * HOUR);
check('Warm roots: the garden gathers more', crypt.perHour(g) === crypt.RATE_PER_HOUR * 1.2);
g.dragon.branch = 'trickster';
const s1 = g.souls;
out = crypt.act(g, { dragon: { pet: true } }, T0 + 31 * HOUR);
check('a trickster\'s play earns souls', out.ok && out.gained === 6 && g.souls >= s1 + 6, JSON.stringify(out));
g.loose = 5;
g.dragon.stage = 2; g.dragon.xp = 200;
out = crypt.act(g, { hunt: { caught: 5, points: 50 } }, T0 + 31 * HOUR);
check('a hunt teaches the dragon too', g.dragon.xp > 200);
check('the dragon survives the garden\'s save', crypt.clean(JSON.parse(JSON.stringify(g)), T0 + 32 * HOUR).dragon.lineage === g.dragon.lineage);

// Its favourite food: snails.
const sn = crypt.fresh(T0);
sn.souls = 1e4; sn.rank = 1;
crypt.act(sn, { dragon: { adopt: true } }, T0);
sn.dragon.stage = 1; sn.dragon.bond = 30;
check('no snail, no treat', /no snails/.test(crypt.act(sn, { dragon: { snail: true } }, T0).error || ''));
crypt.act(sn, { raise: 2, kind: 'snail' }, T0);
const xpBefore = sn.dragon.xp;
out = crypt.act(sn, { dragon: { snail: true } }, T0 + 1000);
check('it eats a snail from the garden', out.ok && out.ate === 'snail' && sn.kinds.filter((k) => k === 'snail').length === 1 && sn.skeletons === 1, JSON.stringify(out));
check('worth far more than souls, and it loves you for it', sn.dragon.xp - xpBefore >= dragon.SNAIL_XP * 0.5 && sn.dragon.bond >= 42,
  JSON.stringify({ xp: sn.dragon.xp, bond: sn.dragon.bond }));
const eggy = crypt.fresh(T0);
eggy.souls = 1e4; eggy.rank = 1;
crypt.act(eggy, { dragon: { adopt: true } }, T0);
crypt.act(eggy, { raise: 1, kind: 'snail' }, T0);
check('an egg does not eat snails, and the snail is spared', !crypt.act(eggy, { dragon: { snail: true } }, T0).ok && eggy.kinds.includes('snail'));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll dragon checks passed');
process.exit(failures ? 1 : 0);
