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
  shop[0].now === '+50% digging' && shop[1].cost === null && shop[1].next === null, JSON.stringify(shop.slice(0, 2)));

// --- Milestones ----------------------------------------------------------------------
const m = crypt.fresh(T0);
let did = crypt.deed(m, 'focus', 25, T0);
check('the first hourglass is a milestone, paid at once', did.gained === 25 && did.reached.length === 1 && did.reached[0].name === 'First sand' && m.souls === 40, JSON.stringify(did));
did = crypt.deed(m, 'focus', 25, T0);
check('a milestone pays only once', did.reached.length === 0 && m.souls === 65);
let acted = crypt.act(m, { raise: 1 }, T0);
check('raising the first skeleton reaches one', acted.ok && acted.reached.some((r) => r.name === 'It moves') && m.souls === 65 - 25 + 10, JSON.stringify(acted));
acted = crypt.act(m, { buy: 'lure' }, T0);
check('a failed purchase reaches nothing', !acted.ok && acted.reached.length === 0);
m.total = 249;
m.souls = 0;
did = crypt.deed(m, 'caught', 1, T0);
check('souls ever held reach one too', did.reached.some((r) => r.name === 'A full urn') && m.souls === 31, JSON.stringify(did));
const chain = crypt.fresh(T0);
chain.total = 2499 - 15;
check('one reward can reach the next milestone', crypt.deed(chain, 'focus', 1, T0).reached.map((r) => r.name).join() === 'First sand,A full urn,An ossuary');
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
check('and is paid for milestones it already met', crypt.reach(old).some((r) => r.name === 'It moves'));
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
check('"raise 3 skeletons" raises three', got && got.name === 'raise_skeleton' && got.count === 3 && /3 skeletons risen/.test(got.reply), JSON.stringify(got));
got = await heard('Raise a skeleton', { ok: false, error: 'Not enough souls.' });
check('"raise a skeleton" says why it could not', got && got.count === 1 && got.reply === 'Not enough souls.', JSON.stringify(got));
got = await heard('crypt', { ok: true, result: { souls: 40, skeletons: 2, perHour: 3, nextCost: 40 } });
check('"crypt" reports the horde', got && got.name === 'get_crypt' && /40 souls/.test(got.reply) && /2 skeletons digging: 3/.test(got.reply), JSON.stringify(got));
got = await heard('buy shovels', { ok: true, result: { bought: 'Sharper shovels', level: 2, souls: 5 } });
check('"buy shovels" buys the upgrade', got && got.name === 'buy_upgrade' && got.upgrade === 'shovels' && /Sharper shovels, level 2\. 5 souls left/.test(got.reply), JSON.stringify(got));
got = await heard('upgrade the ghost lure', { ok: false, error: 'Not enough souls.' });
check('"upgrade the ghost lure" finds the lure', got && got.upgrade === 'lure' && got.reply === 'Not enough souls.', JSON.stringify(got));
got = await heard('upgrades', { ok: true, result: { upgrades: crypt.view(u).upgrades } });
check('"upgrades" lists them with prices', got && /Sharper shovels 2\/10: 200 souls for \+75% digging/.test(got.reply) && /Deeper graves 3\/3 \(done\)/.test(got.reply), got && got.reply);
got = await heard('milestones', { ok: true, result: { milestonesReached: '3 of 17', nextMilestones: ['Feed him a file (+10 souls)'] } });
check('"milestones" says how many and what is next', got && /3 of 17 milestones reached/.test(got.reply) && /Feed him a file/.test(got.reply), got && got.reply);
got = await heard('summon', { ok: true, result: 'cast' });
check('"summon" is still the ghost game', got && got.name === 'cast' && got.ability === 'summon');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll crypt checks passed');
process.exit(failures ? 1 : 0);
