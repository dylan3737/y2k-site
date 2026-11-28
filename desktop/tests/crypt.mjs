// The Crypt's rules: earning, raising, digging, upgrades, milestones and the
// cap on time uncounted. Plain Node, no clock: every time is passed in.
import * as crypt from '../crypt.js';
import { parseCommand } from '../offline.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

const HOUR = 3600000;
const T0 = 1_800_000_000_000;
const RATE = crypt.RATE_PER_HOUR;
const near = (a, b) => Math.abs(a - b) < 1e-9;

// --- Earning and raising ---------------------------------------------------------
// A new garden starts with enough for its first moss sprite; most checks here
// start from nothing, to count exactly.
const started = crypt.fresh(T0);
check('a new garden starts with enough for its first moss sprite', started.souls === crypt.BASE_COST && crypt.raise(started, 1, 'digger', T0).ok);
function blank(t) {
  const x = crypt.fresh(t);
  x.souls = 0;
  return x;
}
const c = blank(T0);
check('a new crypt is empty', c.souls === 0 && c.skeletons === 0 && crypt.view(c).nextCost === crypt.BASE_COST);
check('a ghost is worth one soul', crypt.earn(c, 'caught', 7) === 7 && c.souls === 7);
check('a file is worth five', crypt.earn(c, 'reaped', 2) === 10 && c.souls === 17);
check('a finished hourglass is worth its minutes', crypt.earn(c, 'focus', 25) === 25 && c.souls === 42);
check('an unknown deed is worth nothing', crypt.earn(c, 'cheat', 1e9) === 0 && crypt.earn(c, 'caught', -5) === 0 && crypt.earn(c, 'caught', NaN) === 0 && c.souls === 42);
check('deeds are counted for good', c.deeds.caught === 7 && c.deeds.reaped === 2 && c.deeds.glasses === 1 && c.deeds.longest === 25, JSON.stringify(c.deeds));

let out = crypt.raise(c);
check('souls raise a skeleton', out.ok && out.raised === 1 && c.skeletons === 1 && c.souls === 42 - crypt.BASE_COST);
check('the next one costs more', crypt.view(c).nextCost === crypt.cost(1) && crypt.cost(1) > crypt.BASE_COST, String(crypt.cost(1)));
out = crypt.raise(c);
check('too few souls raise nothing, and say why', !out.ok && out.error.includes('costs ' + crypt.cost(1)) && c.skeletons === 1, out.error);

// --- Digging -------------------------------------------------------------------------
const held = c.souls;
check('a skeleton digs at the set rate', near(crypt.settle(c, T0 + HOUR), RATE) && near(c.souls, held + RATE));
check('nothing is dug twice', crypt.settle(c, T0 + HOUR) === 0);
check('half an hour digs half as much', near(crypt.settle(c, T0 + 1.5 * HOUR), RATE / 2));
check('time uncounted pays out eight hours at most', near(crypt.settle(c, T0 + 101.5 * HOUR), RATE * 8));
check('a clock set back digs nothing and takes nothing', crypt.settle(c, T0) === 0 && c.souls > held && c.at === T0);
check('the total counts every soul ever held', near(c.total, 42 + RATE * 9.5), String(c.total));

c.souls = 1000;
out = crypt.raise(c, 3);
check('several can be raised at once', out.ok && out.raised === 3 && c.skeletons === 4);
c.souls = crypt.cost(4) + 1;
out = crypt.raise(c, 10);
check('asking for more than the souls allow raises what they can', out.ok && out.raised === 1 && c.skeletons === 5);
const seen = crypt.view(c);
check('the page is shown whole souls', Number.isInteger(seen.souls) && seen.perHour === 5 * RATE && seen.skeletons === 5, JSON.stringify([seen.souls, seen.perHour]));

// --- Upgrades ------------------------------------------------------------------------
const u = blank(T0);
u.skeletons = 4;
u.souls = 10;
out = crypt.buy(u, 'shovels');
check('an upgrade needs its price', !out.ok && /costs 60/.test(out.error) && u.upgrades.shovels === 0, out.error);
check('an unknown upgrade is refused', !crypt.buy(u, 'cheat').ok && !crypt.buy(u, '__proto__').ok);
u.souls = 1e6;
out = crypt.buy(u, 'shovels');
check('sharper shovels dig a quarter faster', out.ok && out.level === 1 && near(crypt.perHour(u), 4 * RATE * 1.25) && u.souls === 1e6 - 60);
crypt.buy(u, 'shovels');
check('each level costs more and adds again', near(crypt.perHour(u), 4 * RATE * 1.5) && crypt.upgradeCost(u, 'shovels') > 110);
check('deeper graves raise the cap on time uncounted', crypt.capHours(u) === 8 && crypt.buy(u, 'graves').ok && crypt.capHours(u) === 12);
u.at = T0;
check('and the dig pays for the longer night', near(crypt.settle(u, T0 + 100 * HOUR), crypt.perHour(u) * 12));
crypt.buy(u, 'sand');
check('finer sand makes an hourglass worth more', crypt.earn(u, 'focus', 20) === 30);
check('a ghost lure makes more ghosts golden', crypt.goldenChance(u) === 0.1 && crypt.buy(u, 'lure').ok && crypt.goldenChance(u) > 0.1);
crypt.buy(u, 'graves');
crypt.buy(u, 'graves');
out = crypt.buy(u, 'graves');
check('an upgrade stops at its last level', !out.ok && /no further/.test(out.error) && u.upgrades.graves === 3 && crypt.upgradeCost(u, 'graves') === null, out.error);
const shop = crypt.view(u).upgrades;
check('the card is told each upgrade\'s level, price and effect', shop.length === 4 && shop[0].level === 2 && shop[0].cost === 200 &&
  shop[0].now === '+50% gathering' && shop[1].cost === null && shop[1].next === null, JSON.stringify(shop.slice(0, 2)));

// --- Milestones ----------------------------------------------------------------------
const m = blank(T0);
let did = crypt.deed(m, 'focus', 25, T0);
check('the first hourglass is a milestone, paid at once', did.gained === 25 && did.reached.length === 1 && did.reached[0].name === 'First sand' && m.souls === 40, JSON.stringify(did));
did = crypt.deed(m, 'focus', 25, T0);
check('a milestone pays only once', did.reached.length === 0 && m.souls === 65);
let acted = crypt.act(m, { raise: 1 }, T0);
check('raising the first skeleton reaches one', acted.ok && acted.reached.some((r) => r.name === 'It stirs') && m.souls === 65 - 25 + 10, JSON.stringify(acted));
acted = crypt.act(m, { buy: 'lure' }, T0);
check('a failed purchase reaches nothing', !acted.ok && acted.reached.length === 0);
m.total = 249;
m.souls = 0;
did = crypt.deed(m, 'caught', 1, T0);
check('souls ever held reach one too', did.reached.some((r) => r.name === 'A full urn') && m.souls === 31, JSON.stringify(did));
const chain = blank(T0);
chain.total = 2499 - 15;
check('one reward can reach the next milestone', crypt.deed(chain, 'focus', 1, T0).reached.map((r) => r.name).join() === 'First sand,A full urn,A full meadow');
const list = crypt.view(m).milestones;
check('the card is told which are done', list.length === crypt.MILESTONES.length && list.filter((x) => x.done).length === 3 && list.every((x) => x.how && x.reward > 0));
check('every milestone and upgrade has its own id', new Set(crypt.MILESTONES.map((x) => x.id)).size === crypt.MILESTONES.length &&
  new Set(crypt.UPGRADES.map((x) => x.id)).size === crypt.UPGRADES.length);

// --- Saved state -----------------------------------------------------------------------
const bad = crypt.clean({ souls: -5, skeletons: 1e9, total: 'x', at: T0 + 9e15, upgrades: { shovels: 99, cheat: 5, graves: -1 }, done: ['bones1', 'nope', 7], deeds: 'x' }, T0);
check('a damaged save is made safe', bad.souls === 0 && bad.skeletons === crypt.MAX_SKELETONS && bad.total === 0 && bad.at === T0 &&
  bad.upgrades.shovels === 10 && bad.upgrades.graves === 0 && !('cheat' in bad.upgrades) && bad.done.join() === 'bones1' && bad.deeds.caught === 0, JSON.stringify(bad));
const old = crypt.clean({ souls: 40, skeletons: 2, total: 90, at: T0 }, T0);
check('a save from before upgrades still loads', old.souls === 40 && old.skeletons === 2 && old.upgrades.shovels === 0 && old.done.length === 0);
check('and is paid for milestones it already met', crypt.reach(old).some((r) => r.name === 'It stirs'));
// The count was set by hand above; any action gives each skeleton its start time.
crypt.act(u, {}, u.at);
check('a round trip through JSON changes nothing', JSON.stringify(crypt.clean(JSON.parse(JSON.stringify(u)), u.at)) === JSON.stringify(u));

// --- The plain commands that reach it ------------------------------------------------------
const heard = async (text, result) => {
  let got = null;
  const run = parseCommand(text);
  if (!run) return null;
  const reply = await run({ tool: async (name, input) => { got = { name, ...input }; return result; }, memory: { list: () => [] } });
  return { ...got, reply };
};
let got = await heard('raise 3 skeletons', { ok: true, result: { raised: 3, souls: 12 } });
check('"raise 3 skeletons" raises three', got && got.name === 'raise_worker' && got.count === 3 && /3 moss sprites planted/.test(got.reply), JSON.stringify(got));
got = await heard('Raise a skeleton', { ok: false, error: 'Not enough souls.' });
check('"raise a skeleton" says why it could not', got && got.count === 1 && got.reply === 'Not enough souls.', JSON.stringify(got));
got = await heard('crypt', { ok: true, result: { souls: 40, skeletons: 2, perHour: 3, nextCost: 40 } });
check('"crypt" reports the garden', got && got.name === 'get_crypt' && /40 souls/.test(got.reply) && /2 workers gathering: 3/.test(got.reply), JSON.stringify(got));
got = await heard('buy shovels', { ok: true, result: { bought: 'Green thumbs', level: 2, souls: 5 } });
check('"buy shovels" buys the upgrade', got && got.name === 'buy_upgrade' && got.upgrade === 'shovels' && /Green thumbs, level 2\. 5 souls left/.test(got.reply), JSON.stringify(got));
got = await heard('upgrade the ghost lure', { ok: false, error: 'Not enough souls.' });
check('"upgrade the ghost lure" finds the lure', got && got.upgrade === 'lure' && got.reply === 'Not enough souls.', JSON.stringify(got));
got = await heard('upgrades', { ok: true, result: { upgrades: crypt.view(u).upgrades } });
check('"upgrades" lists them with prices', got && /Green thumbs 2\/10: 200 souls for \+75% gathering/.test(got.reply) && /Deeper roots 3\/3 \(done\)/.test(got.reply), got && got.reply);
got = await heard('milestones', { ok: true, result: { milestonesReached: '3 of 17', nextMilestones: ['Feed him a file (+10 souls)'] } });
check('"milestones" says how many and what is next', got && /3 of 17 milestones reached/.test(got.reply) && /Feed him a file/.test(got.reply), got && got.reply);
got = await heard('my name is Sam, remember that', { ok: true, result: { id: 'm1' } });
check('"..., remember that" keeps the note', got && got.name === 'remember' && got.note === 'My name is Sam' && got.reply === 'Kept.', JSON.stringify(got));
got = await heard('summon', { ok: true, result: 'cast' });
check('"summon" is still the ghost game', got && got.name === 'cast' && got.ability === 'summon');

// Reaping: skeletons ripen as they dig, and burst into their ghosts.
const r = blank(T0);
r.souls = 1000;
crypt.act(r, { raise: 3 }, T0);
check('a new skeleton holds one ghost', crypt.ripeness(r.born[0], r.born[0]) === 1);
check('and one more for every hour it digs', crypt.ripeness(r.born[0], r.born[0] + 3.5 * HOUR) === 4);
check('six at most', crypt.ripeness(r.born[0], r.born[0] + 100 * HOUR) === crypt.MAX_RIPE);
const second = r.born[1];
const t2 = r.born[0] + 2 * HOUR;
out = crypt.act(r, { reap: 0 }, t2);
check('reaping a skeleton lets its ghosts loose', out.ok && out.ghosts === 3 && r.loose === 3, JSON.stringify(out));
check('and it rests a while, a grave where it fell, then rises empty', r.skeletons === 3 && r.born[0] === second && r.born[2] === t2 + crypt.REST_MS &&
  crypt.perHour(r, t2) === 2 * crypt.RATE_PER_HOUR && crypt.perHour(r, t2 + crypt.REST_MS) === 3 * crypt.RATE_PER_HOUR, JSON.stringify(r.born));
check('a resting one cannot be reaped again', !crypt.act(r, { reap: 2 }, t2).ok);
check('reaping one that is not there is refused', !crypt.act(r, { reap: 7 }, t2).ok && r.skeletons === 3);
const before = r.souls;
out = crypt.act(r, { hunt: { caught: 2, golden: 1, points: 60 } }, t2);
check('ghosts caught bank souls, golden ones three times as much', out.caught === 2 && out.gained === 40 && Math.round(r.souls - before) >= 40, JSON.stringify(out));
check('the rest are lost', r.loose === 0);
check('the points are kept', r.score === 60 && crypt.view(r).rank === 'Groundskeeper' && crypt.view(r).nextRank.at === crypt.RANKS[1].at);
out = crypt.act(r, { hunt: { caught: 5, points: 999 } }, t2);
check('a hunt cannot claim ghosts that were never loose', out.caught === 0 && out.points === 0 && r.score === 60, JSON.stringify(out));
crypt.act(r, { reap: 0 }, t2);
r.score = crypt.RANKS[1].at - 50;
out = crypt.act(r, { hunt: { caught: 1, points: 50 } }, t2);
check('a new rank pays once', out.ranked.length === 1 && out.ranked[0].name === 'Ghost catcher' && out.ranked[0].reward === crypt.RANKS[1].reward && crypt.view(r).rank === 'Ghost catcher', JSON.stringify(out));
check('reaping with none says to raise one', /No moss sprites/.test(crypt.reap(blank(T0)).error));

// Summon's Gathering: every skeleton at once, one more ghost for each past the first.
const t3 = t2 + 3 * HOUR;
const holds = r.born.map((t) => crypt.ripeness(t, t3));
out = crypt.act(r, { gather: true }, t3);
check('a Gathering takes every skeleton\'s ghosts, and one more for each past the first',
  out.ok && out.gathered === 3 && out.ghosts === holds.reduce((a, b) => a + b, 0) + 2 && r.loose === out.ghosts, JSON.stringify([out, holds]));
check('and they all rise again empty', r.skeletons === 3 && r.born.every((t) => crypt.ripeness(t, t3) === 1) && new Set(r.born).size === 3);
out = crypt.act(r, { hunt: { caught: out.ghosts, points: 10 } }, t3);
check('a big hunt can bank every ghost it let loose', out.caught === holds.reduce((a, b) => a + b, 0) + 2, JSON.stringify(out));
const full = blank(T0);
full.souls = 1e6;
crypt.act(full, { raise: 8 }, T0);
out = crypt.act(full, { gather: true }, T0 + 100 * HOUR);
check('eight full skeletons make the most a hunt can hold', out.ghosts === 8 * crypt.MAX_RIPE + 7 && out.ghosts <= crypt.MAX_LOOSE, String(out.ghosts));
const empty = blank(T0);
out = crypt.act(empty, { gather: true }, T0);
check('with no skeletons the grave gives a first one instead', out.ok && out.gathered === 0 && out.ghosts === 0 && empty.skeletons === 1 && empty.loose === 0, JSON.stringify(out));

// A skeleton for his own soul, and the wraith.
const souls0 = r.souls;
out = crypt.act(r, { summon: true }, t3);
check('a skeleton can be raised without banked souls', out.ok && r.skeletons === 4 && r.souls === souls0);
r.wraiths.open = null;
check('no wraith abroad, no win to claim', !crypt.act(r, { wraith: { won: true } }, t3).ok);
r.wraiths.open = { tier: 0, at: t3 };
out = crypt.act(r, { wraith: { won: true } }, t3);
check('a beaten wraith pays by its tier and his rank (no sprite rises any more)', out.won && out.gained === crypt.WRAITH_SOULS + crypt.WRAITH_PER_RANK && r.skeletons === 4, JSON.stringify(out));
check('and only once', !crypt.act(r, { wraith: { won: true } }, t3).ok);
const souls1 = r.souls;
r.wraiths.open = { tier: 1, at: t3 };
out = crypt.act(r, { wraith: { won: false } }, t3);
check('an escaped wraith pays nothing', out.ok && !out.won && r.souls === souls1 && r.skeletons === 4);
// Workers: the ghoul, the bat and the will-o'-wisp, unlocked by rank.
const k = blank(T0);
k.souls = 1e5;
crypt.act(k, { raise: 2 }, T0);
out = crypt.act(k, { raise: 1, kind: 'snail' }, T0);
check('a ghoul waits for a rank', !out.ok && /Ghost catcher/.test(out.error), out.error);
k.rank = 3;
const plainNext = crypt.kindCost(k, 'digger');
out = crypt.act(k, { raise: 1, kind: 'snail' }, T0);
check('a ghoul costs twice the next skeleton', out.ok && out.kind === 'snail' && crypt.view(k).bones[2].kind === 'snail' &&
  crypt.kindCost(crypt.clean({ ...k, kinds: k.kinds.slice(0, 2), born: k.born.slice(0, 2), skeletons: 2 }, T0), 'snail') === plainNext * 2);
check('a ghoul digs twice as much', crypt.perHour(k) === 4 * crypt.RATE_PER_HOUR, String(crypt.perHour(k)));
const twoHours = T0 + 2 * HOUR;
check('without a wisp, two hours ripen to three', crypt.view({ ...k }).bones && crypt.ripeness(k.born[0], twoHours, crypt.ripenSpeed(k)) === 3);
out = crypt.act(k, { raise: 1, kind: 'wisp' }, T0);
check('a will-o\'-wisp gathers nothing', out.ok && crypt.perHour(k) === 4 * crypt.RATE_PER_HOUR);
crypt.act(k, { raise: 2, kind: 'wisp' }, T0);
check('three wisps at most', !crypt.act(k, { raise: 1, kind: 'wisp' }, T0).ok && crypt.view(k).kinds.find((x) => x.id === 'wisp').count === 3);
check('and with three, they ripen three-quarters faster', crypt.ripenSpeed(k) === 1.75 && crypt.ripeness(k.born[0], twoHours, crypt.ripenSpeed(k)) === 4);
check('a wisp cannot be reaped', /cannot be reaped/.test(crypt.act(k, { reap: k.kinds.indexOf('wisp') }, twoHours).error || ''));
out = crypt.act(k, { gather: true }, twoHours);
// Two sprites at four ghosts, the toadstool at two (half as fast), and one more for each past the first.
check('a Gathering takes the sprites and the toadstools, and each comes back as itself', out.gathered === 3 && out.ghosts === 4 + 4 + 2 + 2 &&
  k.kinds.join() === 'wisp,wisp,wisp,digger,digger,snail', JSON.stringify([out, k.kinds]));

// The toadstool grows its ghosts slowly, three at most, and comes back a toadstool.
const ts = blank(T0);
ts.souls = 1e4; ts.rank = 2;
crypt.act(ts, { raise: 1, kind: 'snail' }, T0);
crypt.act(ts, { raise: 1, kind: 'moth' }, T0);
out = crypt.act(ts, { reap: ts.kinds.indexOf('snail') }, T0 + 9 * HOUR);
check('a toadstool can be reaped: three ghosts at most, however long it grew', out.ok && out.ghosts === 3 && out.kind === 'snail', JSON.stringify(out));
check('and it comes back a toadstool, after resting', ts.kinds[ts.born.indexOf(T0 + 9 * HOUR + crypt.REST_MS)] === 'snail', JSON.stringify([ts.born, ts.kinds]));
crypt.act(ts, { hunt: { caught: 0 } }, T0 + 9 * HOUR);
const mothAt = ts.kinds.indexOf('moth');
out = crypt.act(ts, { reap: mothAt }, T0 + 9 * HOUR);
check('a moth can be reaped: two spirit-lights', out.ok && out.ghosts === 2 && out.lights === 2 && ts.loose === 2, JSON.stringify(out));
check('and rests as a cocoon, then comes back a moth', ts.kinds.filter((x) => x === 'moth').length === 1 &&
  /cocoon/.test(crypt.act(ts, { reap: ts.kinds.indexOf('moth') }, T0 + 9 * HOUR).error || ''));
const toadOnly = blank(T0);
toadOnly.souls = 1e4; toadOnly.rank = 1;
crypt.act(toadOnly, { raise: 1, kind: 'snail' }, T0);
out = crypt.act(toadOnly, { gather: true }, T0);
check('with only a toadstool, a Gathering gathers it', out.ok && out.gathered === 1 && out.ghosts === 1 && toadOnly.kinds.join() === 'snail');
const gnone = blank(T0);
out = crypt.act(gnone, { gather: true }, T0);
check('with nothing at all, a Gathering plants a moss sprite', out.ok && out.gathered === 0 && gnone.kinds.join() === 'digger');
// The frog: half as much again, a ghost every hour and a half, four at most.
const fr = blank(T0);
fr.souls = 1e4; fr.rank = 1;
crypt.act(fr, { raise: 1, kind: 'frog' }, T0);
check('a frog gathers half as much again', crypt.perHour(fr) === 1.5 * crypt.RATE_PER_HOUR);
out = crypt.act(fr, { reap: 0 }, T0 + 3.1 * HOUR);
check('and grows a ghost every hour and a half', out.ok && out.ghosts === 3 && out.kind === 'frog', JSON.stringify(out));

// The caterpillar: a moth starts as one, and only a turned moth can be reaped.
const cat = blank(T0);
cat.souls = 1e4; cat.rank = 2;
crypt.act(cat, { raise: 1, kind: 'moth' }, T0);
check('a moth starts as a caterpillar (resting three hours, the last half a cocoon)', cat.born[0] === T0 + crypt.METAMORPHOSIS_MS &&
  /cocoon/.test(crypt.act(cat, { reap: 0 }, T0 + HOUR).error || ''));
out = crypt.act(cat, { reap: 0 }, T0 + crypt.METAMORPHOSIS_MS + 1000);
check('once turned, a moth can be reaped for two spirit-lights', out.ok && out.lights === 2);

// The bee: pollen gives a worker a ghost at once; a worker once an hour, the bees once every 20 minutes.
const hive = blank(T0);
hive.souls = 1e5; hive.rank = 2;
crypt.act(hive, { raise: 2 }, T0);
check('no bees, no pollen', !crypt.act(hive, { pollinate: 0 }, T0).ok);
crypt.act(hive, { raise: 1, kind: 'bee' }, T0);
out = crypt.act(hive, { pollinate: 0 }, T0 + 1000);
check('a bee gives a worker a ghost at once', out.ok && out.ripe === 2, JSON.stringify(out));
check('the bees rest between flowers', /resting/.test(crypt.act(hive, { pollinate: 1 }, T0 + 2000).error || ''));
check('a worker once an hour', /within the hour/.test(crypt.act(hive, { pollinate: 0 }, T0 + crypt.POLLEN_MS + 2000).error || ''));
check('another worker after the bees have rested', crypt.act(hive, { pollinate: 1 }, T0 + crypt.POLLEN_MS + 2000).ok);
check('pollen survives a save', crypt.clean(JSON.parse(JSON.stringify(hive)), T0 + crypt.POLLEN_MS + 3000).boosts[hive.born[0]].n === 1);
const reapedId = hive.born[0];
out = crypt.act(hive, { reap: 0 }, T0 + crypt.POLLEN_MS + 3000);
check('a reaped worker gives its pollen ghost too, and starts afresh', out.ghosts === 2 && !hive.boosts[reapedId] && Object.keys(hive.boosts).length === 1, JSON.stringify([out, hive.boosts]));
check('a bee cannot be reaped', /cannot be reaped/.test(crypt.act(hive, { reap: hive.kinds.indexOf('bee') }, T0 + HOUR).error || ''));

// The robin: workers rest less. The ladybug: more spirit-lights.
const nest = blank(T0);
nest.souls = 1e6; nest.rank = 4;
crypt.act(nest, { raise: 1 }, T0);
check('a reaped worker rests 30 minutes without robins', crypt.restMs(nest) === 30 * 60000);
crypt.act(nest, { raise: 1, kind: 'robin' }, T0);
check('20 with one robin', crypt.restMs(nest) === 20 * 60000);
crypt.act(nest, { raise: 1, kind: 'robin' }, T0);
check('15 with two, and two at most', crypt.restMs(nest) === 15 * 60000 && !crypt.act(nest, { raise: 1, kind: 'robin' }, T0).ok);
out = crypt.act(nest, { reap: nest.kinds.indexOf('digger') }, T0 + HOUR);
check('and a reaped one comes back that much sooner', nest.born.includes(T0 + HOUR + 15 * 60000), JSON.stringify(nest.born));
const before2 = crypt.goldenChance(nest);
crypt.act(nest, { raise: 3, kind: 'ladybug' }, T0);
check('each ladybug brings luck: more spirit-lights', crypt.goldenChance(nest) === Math.round((before2 + 0.15) * 100) / 100 && crypt.view(nest).goldenChance === crypt.goldenChance(nest));

check('kinds survive a save', crypt.clean(JSON.parse(JSON.stringify(k)), twoHours).kinds.join() === k.kinds.join());
const batty = blank(T0);
batty.souls = 1e5;
crypt.act(batty, { raise: 1 }, T0);
check('a bat waits for Soul warden', /Soul warden/.test(crypt.act(batty, { raise: 1, kind: 'moth' }, T0).error || ''));
batty.rank = 2;
out = crypt.act(batty, { raise: 3, kind: 'moth' }, T0);
check('bats dig nothing, and three at most', out.raised === 3 && crypt.perHour(batty) === crypt.RATE_PER_HOUR && !crypt.act(batty, { raise: 1, kind: 'moth' }, T0).ok &&
  crypt.view(batty).kinds.find((x) => x.id === 'moth').count === 3 && crypt.MOTH_CATCHES === 2);
check('a wisp waits for Shade hunter', /Shade hunter/.test(crypt.act(batty, { raise: 1, kind: 'wisp' }, T0).error || ''));
const oldSave = crypt.clean({ skeletons: 2, born: [T0, T0 + 1], kinds: ['digger', 'lantern'], at: T0 }, T0 + 5);
check('a lantern bearer from an old save becomes a wisp', oldSave.kinds.join() === 'digger,wisp' && crypt.ripenSpeed(oldSave) === 1.25);
const older = crypt.clean({ skeletons: 4, born: [T0, T0 + 1, T0 + 2, T0 + 3], kinds: ['ghoul', 'bat', 'digger', 'toadstool'], at: T0 }, T0 + 5);
check('a ghoul, a bat and a toadstool from an old save become a snail, a moth and a snail', older.kinds.join() === 'snail,moth,digger,snail', older.kinds.join());
check('an unknown kind is refused', !crypt.act(k, { raise: 1, kind: 'dragon' }).ok);

// Sweeping their dirt.
const broom = blank(T0);
out = crypt.act(broom, { sweep: 1 }, T0);
check('a swept mound pays a soul', out.ok && out.gained === 1 && broom.souls === 1 && broom.total === 1);
out = crypt.act(broom, { sweep: 1000 }, T0);
check('never more than there can be mounds', out.gained === crypt.MOST_MOUNDS);
check('and nothing is nothing', !crypt.act(broom, { sweep: 0 }, T0).ok && !crypt.act(broom, { sweep: 'lots' }, T0).ok);

check('every skeleton is known by its own start time', new Set(r.born).size === r.born.length);
const legacy = crypt.clean({ skeletons: 3, souls: 5 }, T0);
check('skeletons from before ripening start ripening on load', legacy.born.length === 3 && legacy.born[0] === T0 && legacy.loose === 0);

// --- His Arts and robes -----------------------------------------------------------
const ar = blank(T0);
ar.souls = crypt.BASE_COST + crypt.ARTS.find((a) => a.id === 'scythe').costs[0];
crypt.act(ar, { raise: 1 }, T0);
check('a new reaper has no arts, and wears crimson', crypt.view(ar, T0).arts.every((a) => a.level === 0) && crypt.view(ar, T0).robe === 'crimson');
let ao = crypt.act(ar, { art: 'scythe' }, T0);
check('souls teach him an art', ao.ok && ao.level === 1 && crypt.view(ar, T0).arts.find((a) => a.id === 'scythe').level === 1, JSON.stringify(ao));
check('not one he cannot pay for', !crypt.act(ar, { art: 'hood' }, T0).ok && !crypt.act(ar, { art: 'flight' }, T0).ok);
const ripeA = crypt.view(ar, T0 + 3 * 3600000).bones[0].ripe;
ao = crypt.act(ar, { reap: 0 }, T0 + 3 * 3600000);
check('a keen scythe brings one more ghost out of a sprout reaped by hand', ao.ok && ao.ghosts === ripeA + 1, JSON.stringify([ripeA, ao.ghosts]));
ar.souls = 600;
check('a robe is bought, and worn', crypt.act(ar, { robe: 'midnight' }, T0).ok && crypt.view(ar, T0).robe === 'midnight' && Math.floor(ar.souls) === 100);
check('worn again for nothing', crypt.act(ar, { robe: 'crimson' }, T0).ok && crypt.act(ar, { robe: 'midnight' }, T0).ok && Math.floor(ar.souls) === 100);
check('not one he cannot pay for', !crypt.act(ar, { robe: 'void' }, T0).ok && crypt.view(ar, T0).robe === 'midnight');
const arSaved = crypt.clean(JSON.parse(JSON.stringify(ar)), T0);
check('arts and robes survive a save', arSaved.arts.scythe === 1 && arSaved.robe === 'midnight' && arSaved.robes.includes('midnight'));
check('a robe never bought is not worn from a save', crypt.clean({ robe: 'gold', robes: ['crimson'] }, T0).robe === 'crimson');

// --- Wraiths, by tier ------------------------------------------------------------------
const wr = blank(T0);
wr.souls = 100;
wr.rank = crypt.RANKS.length - 2; // a Wraith lord: every tier answers him
crypt.act(wr, { raise: 2 }, T0);
const realRandom = Math.random;
Math.random = () => 0.9;
out = crypt.act(wr, { gather: true }, T0 + 3 * 3600000);
check('most Gatherings, no wraith', out.ok && !out.wraith && wr.wraiths.since === 1);
Math.random = () => 0.1;
const tg = T0 + 4 * 3600000;
crypt.act(wr, { hunt: { caught: 0 } }, tg);
out = crypt.act(wr, { gather: true }, tg);
Math.random = realRandom;
check('sometimes one rises: the first tier', out.wraith && out.wraith.tier === 0 && out.wraith.hp === crypt.WRAITHS[0].hp && wr.wraiths.open.tier === 0, JSON.stringify(out.wraith));
crypt.act(wr, { dragon: { adopt: true } }, tg);
wr.dragon.stage = 2;
out = crypt.act(wr, { wraith: { won: true } }, tg + 30000);
check('beaten the first time: souls, Dragon Scales and a relic, and the next tier is up', out.won && out.first && out.scales === crypt.WRAITHS[0].scales &&
  out.relic && wr.dragon.scales === crypt.WRAITHS[0].scales && crypt.view(wr, tg).wraiths.next.tier === 1, JSON.stringify(out));
out = crypt.act(wr, { wraithCall: true }, tg + 60000);
check('a drake can call one: the next tier', out.ok && out.wraith.tier === 1 && out.wraith.name === 'Hollow wraith', JSON.stringify(out));
crypt.act(wr, { wraith: { won: false } }, tg + 70000);
check('but not again for a while', !crypt.act(wr, { wraithCall: true }, tg + 120000).ok);
out = crypt.act(wr, { wraithCall: true }, tg + 60000 + crypt.WRAITH_CALL_MS);
check('later, it can; and a tier that won is fought again', out.ok && out.wraith.tier === 1);
check('a wraith not fought in time is gone', !crypt.act(wr, { wraith: { won: true } }, tg + 60000 + crypt.WRAITH_CALL_MS + crypt.WRAITH_OPEN_MS + 1).ok);
wr.wraiths.beaten = crypt.WRAITHS.length;
check('all beaten, the king answers', crypt.nextWraith(wr) === crypt.WRAITHS.length - 1);
wr.wraiths.open = { tier: crypt.WRAITHS.length - 1, at: tg };
const sc = wr.dragon.scales;
out = crypt.act(wr, { wraith: { won: true } }, tg + 1000);
check('a tier beaten before pays souls, no more scales', out.won && !out.first && wr.dragon.scales === sc, JSON.stringify(out));
const ws = crypt.clean(JSON.parse(JSON.stringify(wr)), tg + 60000 + crypt.WRAITH_CALL_MS + 10);
check('the wraiths survive a save', ws.wraiths.beaten === crypt.WRAITHS.length && ws.wraiths.calledAt === wr.wraiths.calledAt);
const hatchling = blank(T0);
crypt.act(hatchling, { dragon: { adopt: true } }, T0);
hatchling.dragon.stage = 1;
check('a hatchling cannot call one', !crypt.act(hatchling, { wraithCall: true }, T0).ok);
const lowly = blank(T0);
lowly.wraiths.beaten = 3;
check('a tier answers only a reaper of its rank (a Groundskeeper meets the first)', crypt.nextWraith(lowly) === 0);
check('a called wraith tires the dragon', wr.dragon.energy <= 100 - crypt.WRAITH_CALL_ENERGY);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll crypt checks passed');
process.exit(failures ? 1 : 0);
