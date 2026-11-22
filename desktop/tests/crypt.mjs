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
const c = crypt.fresh(T0);
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
const u = crypt.fresh(T0);
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
const m = crypt.fresh(T0);
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
const chain = crypt.fresh(T0);
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
const r = crypt.fresh(T0);
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
check('the points are kept', r.score === 60 && crypt.view(r).rank === 'Groundskeeper' && crypt.view(r).nextRank.at === 100);
out = crypt.act(r, { hunt: { caught: 5, points: 999 } }, t2);
check('a hunt cannot claim ghosts that were never loose', out.caught === 0 && out.points === 0 && r.score === 60, JSON.stringify(out));
crypt.act(r, { reap: 0 }, t2);
out = crypt.act(r, { hunt: { caught: 1, points: 50 } }, t2);
check('a new rank pays once', out.ranked.length === 1 && out.ranked[0].name === 'Ghost catcher' && out.ranked[0].reward === 30 && crypt.view(r).rank === 'Ghost catcher', JSON.stringify(out));
check('reaping with none says to raise one', /No moss sprites/.test(crypt.reap(crypt.fresh(T0)).error));

// Summon's Gathering: every skeleton at once, one more ghost for each past the first.
const t3 = t2 + 3 * HOUR;
const holds = r.born.map((t) => crypt.ripeness(t, t3));
out = crypt.act(r, { gather: true }, t3);
check('a Gathering takes every skeleton\'s ghosts, and one more for each past the first',
  out.ok && out.gathered === 3 && out.ghosts === holds.reduce((a, b) => a + b, 0) + 2 && r.loose === out.ghosts, JSON.stringify([out, holds]));
check('and they all rise again empty', r.skeletons === 3 && r.born.every((t) => crypt.ripeness(t, t3) === 1) && new Set(r.born).size === 3);
out = crypt.act(r, { hunt: { caught: out.ghosts, points: 10 } }, t3);
check('a big hunt can bank every ghost it let loose', out.caught === holds.reduce((a, b) => a + b, 0) + 2, JSON.stringify(out));
const full = crypt.fresh(T0);
full.souls = 1e6;
crypt.act(full, { raise: 8 }, T0);
out = crypt.act(full, { gather: true }, T0 + 100 * HOUR);
check('eight full skeletons make the most a hunt can hold', out.ghosts === 8 * crypt.MAX_RIPE + 7 && out.ghosts <= crypt.MAX_LOOSE, String(out.ghosts));
const empty = crypt.fresh(T0);
out = crypt.act(empty, { gather: true }, T0);
check('with no skeletons the grave gives a first one instead', out.ok && out.gathered === 0 && out.ghosts === 0 && empty.skeletons === 1 && empty.loose === 0, JSON.stringify(out));

// A skeleton for his own soul, and the wraith.
const souls0 = r.souls;
out = crypt.act(r, { summon: true }, t3);
check('a skeleton can be raised without banked souls', out.ok && r.skeletons === 4 && r.souls === souls0);
out = crypt.act(r, { wraith: { won: true } }, t3);
check('a beaten wraith pays by rank, and a skeleton rises', out.won && out.gained === crypt.WRAITH_SOULS + crypt.WRAITH_PER_RANK && out.raised === 1 && r.skeletons === 5, JSON.stringify(out));
const souls1 = r.souls;
out = crypt.act(r, { wraith: { won: false } }, t3);
check('an escaped wraith pays nothing', !out.won && r.souls === souls1 && r.skeletons === 5);
// Workers: the ghoul, the bat and the will-o'-wisp, unlocked by rank.
const k = crypt.fresh(T0);
k.souls = 1e5;
crypt.act(k, { raise: 2 }, T0);
out = crypt.act(k, { raise: 1, kind: 'toadstool' }, T0);
check('a ghoul waits for a rank', !out.ok && /Ghost catcher/.test(out.error), out.error);
k.rank = 3;
const plainNext = crypt.kindCost(k, 'digger');
out = crypt.act(k, { raise: 1, kind: 'toadstool' }, T0);
check('a ghoul costs twice the next skeleton', out.ok && out.kind === 'toadstool' && crypt.view(k).bones[2].kind === 'toadstool' &&
  crypt.kindCost(crypt.clean({ ...k, kinds: k.kinds.slice(0, 2), born: k.born.slice(0, 2), skeletons: 2 }, T0), 'toadstool') === plainNext * 2);
check('a ghoul digs twice as much', crypt.perHour(k) === 4 * crypt.RATE_PER_HOUR, String(crypt.perHour(k)));
out = crypt.act(k, { reap: 2 }, T0 + 5 * HOUR);
check('a ghoul cannot be reaped', !out.ok && /holds no ghosts/.test(out.error) && crypt.view(k).bones[2].ripe === 0);
const twoHours = T0 + 2 * HOUR;
check('without a wisp, two hours ripen to three', crypt.view({ ...k }).bones && crypt.ripeness(k.born[0], twoHours, crypt.ripenSpeed(k)) === 3);
out = crypt.act(k, { raise: 1, kind: 'wisp' }, T0);
check('a will-o\'-wisp digs nothing', out.ok && crypt.perHour(k) === 4 * crypt.RATE_PER_HOUR);
crypt.act(k, { raise: 2, kind: 'wisp' }, T0);
check('three wisps at most', !crypt.act(k, { raise: 1, kind: 'wisp' }, T0).ok && crypt.view(k).kinds.find((x) => x.id === 'wisp').count === 3);
check('and with three, they ripen three-quarters faster', crypt.ripenSpeed(k) === 1.75 && crypt.ripeness(k.born[0], twoHours, crypt.ripenSpeed(k)) === 4);
out = crypt.act(k, { gather: true }, twoHours);
check('a Gathering takes only the ones that hold ghosts', out.gathered === 2 && out.ghosts === 4 + 4 + 1 && k.skeletons === 6 &&
  k.kinds.filter((x) => x === 'digger').length === 2 && k.kinds[0] === 'toadstool', JSON.stringify([out, k.kinds]));
const ghoulsOnly = crypt.fresh(T0);
ghoulsOnly.souls = 1e4; ghoulsOnly.rank = 1;
crypt.act(ghoulsOnly, { raise: 1, kind: 'toadstool' }, T0);
out = crypt.act(ghoulsOnly, { gather: true }, T0);
check('with only ghouls, a Gathering raises a skeleton instead', out.ok && out.gathered === 0 && ghoulsOnly.kinds.join() === 'toadstool,digger');
check('kinds survive a save', crypt.clean(JSON.parse(JSON.stringify(k)), twoHours).kinds.join() === k.kinds.join());
const batty = crypt.fresh(T0);
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
const older = crypt.clean({ skeletons: 3, born: [T0, T0 + 1, T0 + 2], kinds: ['ghoul', 'bat', 'digger'], at: T0 }, T0 + 5);
check('a ghoul and a bat from an old save become a toadstool and a moth', older.kinds.join() === 'toadstool,moth,digger');
check('an unknown kind is refused', !crypt.act(k, { raise: 1, kind: 'dragon' }).ok);

// Sweeping their dirt.
const broom = crypt.fresh(T0);
out = crypt.act(broom, { sweep: 1 }, T0);
check('a swept mound pays a soul', out.ok && out.gained === 1 && broom.souls === 1 && broom.total === 1);
out = crypt.act(broom, { sweep: 1000 }, T0);
check('never more than there can be mounds', out.gained === crypt.MOST_MOUNDS);
check('and nothing is nothing', !crypt.act(broom, { sweep: 0 }, T0).ok && !crypt.act(broom, { sweep: 'lots' }, T0).ok);

check('every skeleton is known by its own start time', new Set(r.born).size === r.born.length);
const legacy = crypt.clean({ skeletons: 3, souls: 5 }, T0);
check('skeletons from before ripening start ripening on load', legacy.born.length === 3 && legacy.born[0] === T0 && legacy.loose === 0);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll crypt checks passed');
process.exit(failures ? 1 : 0);
