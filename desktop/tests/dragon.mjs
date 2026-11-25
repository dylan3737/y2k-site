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
out = dragon.gain(d, dragon.XP_AT[3]);
check('grown enough, it becomes a wyvern, and what it trained most decides its path', d.stage >= 3 && d.branch === 'guardian' && out.grew.includes('wyvern'), JSON.stringify(out));
check('a guardian makes the garden grow faster', dragon.gardenGrowth(d) > 0 && dragon.breaths(d) === 0 && dragon.playSouls(d) === 0);
const h = dragon.freshDragon(T0, seq(0.1));
h.stage = 1; h.train.hunt = 2;
dragon.gain(h, 3000);
check('one trained to hunt becomes a hunter, and breathes on ghosts', h.branch === 'hunter' && dragon.breaths(h) >= 2);
const t = dragon.freshDragon(T0, seq(0.8));
t.stage = 1;
dragon.gain(t, 3000);
check('untrained, the element leans it (storm: a hunter)', t.element === 'storm' && t.branch === 'hunter');

// Its appetite, and what it can have in a day.
const hungry = dragon.freshDragon(T0, seq(0.1));
hungry.stage = 2;
out = dragon.feed(hungry, 1e6, T0);
check('a drake eats its appetite\'s worth, at its price in souls', out.ok && out.ate === dragon.APPETITE[2] * dragon.MEAL_SOULS[2] && out.full, JSON.stringify(out));
check('the next day it is hungry again', dragon.feed(hungry, 50, T0 + 24 * HOUR).ok);
const hunter = dragon.freshDragon(T0, seq(0.1));
hunter.stage = 2;
dragon.hunted(hunter, 60, T0);
check('ghosts from hunts fill only half its appetite', dragon.appetiteLeft(hunter, T0) === dragon.APPETITE[2] / 2 &&
  dragon.hunted(hunter, 60, T0).gained === 0 && dragon.feed(hunter, 1e6, T0).ok);
const snacker = dragon.freshDragon(T0, seq(0.1));
snacker.stage = 1;
check('a snail is a treat: one a day', dragon.snack(snacker, T0).ok && /today/.test(dragon.snack(snacker, T0 + 1000).error || '') &&
  dragon.snack(snacker, T0 + 24 * HOUR).ok);
const pettable = dragon.freshDragon(T0, seq(0.1));
for (let i = 0; i < 40; i++) dragon.pet(pettable, T0 + i * dragon.PET_GAP_MS);
check('rubbing warms an egg only so much a day (it cannot be clicked into hatching)', pettable.stage === 0 &&
  Math.round(pettable.warmth) <= dragon.PET_WARMTH_A_DAY + 1, String(pettable.warmth));
const petted = dragon.freshDragon(T0, seq(0.1));
petted.stage = 1;
for (let i = 0; i < 40; i++) dragon.pet(petted, T0 + i * dragon.PET_GAP_MS);
check('and petting teaches it only so much a day', petted.xp <= dragon.PET_XP_A_DAY * 2, String(petted.xp));
const youngElder = dragon.freshDragon(T0, seq(0.1));
youngElder.stage = 4; youngElder.xp = dragon.XP_AT[4]; youngElder.bond = 90;
check('a young elder must mature before it can ascend', /young elder/.test(dragon.ascendable(youngElder).why || ''));

// Treasure, and the hoard.
const finder = dragon.freshDragon(T0, seq(0.1));
check('an egg finds no treasure', !dragon.treasure(finder, T0).ok);
finder.stage = 2;
out = dragon.treasure(finder, T0, seq(0.9));
check('a treasure pays souls by its stage, and is counted', out.ok && out.souls === dragon.TREASURE_SOULS * 2 && !out.relic && finder.hoard.treasures === 1, JSON.stringify(out));
check('not again straight away', !dragon.treasure(finder, T0 + 1000).ok && !dragon.treasureReady(finder, T0 + 1000).ok);
out = dragon.treasure(finder, T0 + dragon.TREASURE_GAP_MS, seq(0.1, 0.1));
check('now and then a relic, which levels up', out.ok && out.relic && out.relic.level === 1 && finder.hoard.relics[out.relic.id] === 1, JSON.stringify(out));
let found = 2;
for (let i = 2; i < 40; i++) if (dragon.treasure(finder, T0 + i * dragon.TREASURE_GAP_MS, seq(0.9)).ok) found++;
check('only so many a day', found === dragon.TREASURES_A_DAY, String(found));
check('the hoard survives a save', JSON.stringify(dragon.cleanDragon(JSON.parse(JSON.stringify(finder)), T0 + 40 * dragon.TREASURE_GAP_MS).hoard) === JSON.stringify(finder.hoard));
const rich = dragon.freshDragon(T0, seq(0.1));
rich.stage = 2; rich.hoard.relics = { star: 2, coin: 1, lantern: 5, sand: 3 };
check('relics boost hunts, the garden, spirit-lights and hourglasses', dragon.huntBonus(rich) === 0.1 && dragon.gardenSouls(rich) === 0.05 &&
  Math.abs(dragon.lightBonus(rich) - 0.1) < 1e-9 && Math.abs(dragon.sandBonus(rich) - 0.15) < 1e-9);
const tg = crypt.fresh(T0);
tg.souls = 0;
crypt.act(tg, { dragon: { adopt: true } }, T0);
tg.dragon.stage = 1;
out = crypt.act(tg, { dragon: { treasure: true } }, T0);
check('through the garden, a treasure banks its souls', out.ok && Math.floor(tg.souls) === dragon.TREASURE_SOULS && crypt.view(tg, T0).dragon.hoard.treasures === 1, JSON.stringify(out));

// Crows at the garden.
const cg = crypt.fresh(T0);
cg.souls = 1000;
crypt.act(cg, { raise: 1 }, T0);
check('no crows before there is a dragon to guard', !crypt.act(cg, { dragon: { crow: { stopped: true } } }, T0 + 3 * HOUR).ok);
crypt.act(cg, { dragon: { adopt: true } }, T0);
cg.dragon.stage = 2;
const t3 = T0 + 3 * HOUR;
const ripe0 = crypt.view(cg, t3).bones[0].ripe;
out = crypt.act(cg, { dragon: { crow: { at: 0 } } }, t3);
check('a crow that gets through takes a ghost from the sprout', out.ok && out.stole && crypt.view(cg, t3).bones[0].ripe === ripe0 - 1, JSON.stringify(out));
check('and the theft survives a save', crypt.view(crypt.clean(JSON.parse(JSON.stringify(cg)), t3), t3).bones[0].ripe === ripe0 - 1);
check('no second crow straight away', !crypt.act(cg, { dragon: { crow: { stopped: true } } }, t3 + 1000).ok);
const sc = Math.floor(cg.souls);
out = crypt.act(cg, { dragon: { crow: { stopped: true } } }, t3 + dragon.CROW_GAP_MS);
check('one the dragon stops pays souls by its stage', out.ok && out.stopped && Math.floor(cg.souls) === sc + dragon.CROW_SOULS * 2 && cg.dragon.guard.stopped === 1, JSON.stringify(out));
check('a guardian is the most watchful', dragon.watchfulness({ stage: 3, branch: 'guardian' }) > dragon.watchfulness({ stage: 3, branch: 'hunter' }) &&
  dragon.watchfulness({ stage: 0 }) === 0);

// The breath burst.
const bg = crypt.fresh(T0);
bg.souls = 1000;
crypt.act(bg, { raise: 2 }, T0);
crypt.act(bg, { dragon: { adopt: true } }, T0);
bg.dragon.stage = 1; bg.dragon.element = 'ember';
check('a hatchling has no burst', !crypt.act(bg, { dragon: { burst: { at: [0] } } }, T0 + 2 * HOUR).ok);
bg.dragon.stage = 2;
check('it charges over time', dragon.burstCharge(bg.dragon, T0 + dragon.BURST_MS / 2) === 0.5 && !crypt.act(bg, { dragon: { burst: { at: [0] } } }, T0 + dragon.BURST_MS / 2).ok);
const tb = T0 + dragon.BURST_MS;
const r0 = crypt.view(bg, tb).bones.map((b) => b.ripe);
out = crypt.act(bg, { dragon: { burst: { at: [0] } } }, tb);
const r1 = crypt.view(bg, tb).bones.map((b) => b.ripe);
check('Ember ripens the sprouts it is aimed at, by two', out.ok && out.ripened === 1 && r1[0] === Math.min(6, r0[0] + 2) && r1[1] === r0[1], JSON.stringify([r0, r1]));
check('spent, it charges again', !crypt.act(bg, { dragon: { burst: { at: [0] } } }, tb + 1000).ok);
bg.dragon.element = 'shadow';
out = crypt.act(bg, { dragon: { burst: { at: [] } } }, tb + dragon.BURST_MS);
check('Shadow ripens every sprout a little', out.ok && out.ripened === 2, JSON.stringify(out));
check('only Frost and Storm work in a hunt', !crypt.act(bg, { dragon: { burst: { hunt: true } } }, tb + 3 * dragon.BURST_MS).ok);
bg.dragon.element = 'storm';
check('Storm does', crypt.act(bg, { dragon: { burst: { hunt: true } } }, tb + 3 * dragon.BURST_MS).ok);

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
dragon.gain(e, 50000);
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
dragon.gain(twice, 1e5);
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
out = crypt.act(g, { dragon: { feed: 20 } }, T0 + 30 * HOUR);
check('feeding takes the souls from the garden', out.ok && out.ate === 20 && Math.floor(g.souls) === souls0 - 20, JSON.stringify(out));
out = crypt.act(g, { dragon: { feed: 900 } }, T0 + 30 * HOUR);
check('it eats only as much as its appetite, and only those souls are taken', out.ok && out.full &&
  out.ate === (dragon.APPETITE[1] - 10) * dragon.MEAL_SOULS[1] && Math.floor(g.souls) === souls0 - dragon.APPETITE[1] * dragon.MEAL_SOULS[1], JSON.stringify(out));
check('full, it eats no more today', /full/.test(crypt.act(g, { dragon: { feed: 20 } }, T0 + 30 * HOUR).error || ''));
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
out = crypt.act(g, { hunt: { caught: 5, points: 50 } }, T0 + 56 * HOUR);
check('a hunt teaches the dragon too (another day: it ate its fill today)', g.dragon.xp > 200);
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
