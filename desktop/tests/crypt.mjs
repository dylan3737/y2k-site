// The Crypt's rules: earning, raising, digging and the cap on time uncounted.
// Plain Node, no clock: every time is passed in.
import * as crypt from '../crypt.js';
import { parseCommand } from '../offline.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

const HOUR = 3600000;
const T0 = 1_800_000_000_000;

const c = crypt.fresh(T0);
check('a new crypt is empty', c.souls === 0 && c.skeletons === 0 && crypt.view(c).nextCost === 25);

check('a ghost is worth one soul, and is bound as a spirit', crypt.earn(c, 'caught', 7) === 7 && c.souls === 7 && c.spirits === 7);
check('a file is worth five', crypt.earn(c, 'reaped', 2) === 10 && c.souls === 17);
check('a finished hourglass is worth its minutes', crypt.earn(c, 'focus', 25) === 25 && c.souls === 42);
check('an unknown deed is worth nothing', crypt.earn(c, 'cheat', 1e9) === 0 && crypt.earn(c, 'caught', -5) === 0 && crypt.earn(c, 'caught', NaN) === 0 && c.souls === 42);

let out = crypt.raise(c);
check('souls raise a skeleton', out.ok && out.raised === 1 && c.skeletons === 1 && c.souls === 17);
check('the next one costs the same', crypt.view(c).nextCost === 25 && crypt.cost(100) === 25, String(crypt.view(c).nextCost));
out = crypt.raise(c);
check('too few souls raise nothing, and say why', !out.ok && /costs 25/.test(out.error) && c.skeletons === 1 && c.souls === 17, out.error);

// One skeleton digs 6 souls an hour; the 7 spirits earn 7 more.
check('a skeleton digs six souls an hour, and each spirit earns one', Math.abs(crypt.settle(c, T0 + HOUR) - 13) < 1e-9 && Math.abs(c.souls - 30) < 1e-9);
check('nothing is dug twice', crypt.settle(c, T0 + HOUR) === 0);
check('half an hour digs half as much', Math.abs(crypt.settle(c, T0 + 1.5 * HOUR) - 6.5) < 1e-9);
check('time uncounted pays out eight hours at most', Math.abs(crypt.settle(c, T0 + 101.5 * HOUR) - 104) < 1e-9);
check('a clock set back digs nothing and takes nothing', crypt.settle(c, T0) === 0 && c.souls > 70 && c.at === T0);
check('the total counts every soul ever held', Math.abs(c.total - (42 + 13 + 6.5 + 104)) < 1e-9, String(c.total));

c.souls = 1000;
out = crypt.raise(c, 3);
check('several can be raised at once', out.ok && out.raised === 3 && c.skeletons === 4);
c.souls = crypt.cost(4) + 1;
out = crypt.raise(c, 10);
check('asking for more than the souls allow raises what they can', out.ok && out.raised === 1 && c.skeletons === 5);
const seen = crypt.view(c);
// By now the crypt has gathered over 100 souls: depth 1, a tenth more on all it earns.
check('the page is shown whole souls', Number.isInteger(seen.souls) && seen.depth === 1 && seen.digPerHour === 33 && seen.perHour === 41 && seen.skeletons === 5, JSON.stringify(seen));

const bad = crypt.clean({ souls: -5, skeletons: 1e9, total: 'x', at: T0 + 9e15 }, T0);
check('a damaged save is made safe', bad.souls === 0 && bad.skeletons === crypt.MAX_SKELETONS && bad.total === 0 && bad.at === T0, JSON.stringify(bad));
check('a missing save is an empty crypt', crypt.clean(undefined, T0).skeletons === 0);

// Upgrades, bought with souls; each level costs twice the last.
const u = crypt.fresh(T0);
check('a new crypt has no upgrades', Object.values(u.upgrades).every((n) => n === 0) && crypt.view(u).upgrades.length === 5);
u.souls = 1000; u.skeletons = 2;
check('a fresh hunt lasts 15 seconds, with 15% of ghosts golden',
  JSON.stringify(crypt.hunt(u)) === JSON.stringify({ seconds: 15, pace: 1, golden: 0.15 }), JSON.stringify(crypt.hunt(u)));
let b = crypt.buy(u, 'shovels');
check('shovels can be bought', b.ok && b.level === 1 && b.spent === 40 && u.souls === 960);
check('the next level costs twice as much', crypt.upgradeCost(u, 'shovels') === 80);
check('shovels make skeletons dig half as fast again', crypt.perHour(u) === 18);
crypt.buy(u, 'lantern'); crypt.buy(u, 'bell');
const h = crypt.hunt(u);
check('the lantern lengthens and slows the hunt, the bell gilds it', h.seconds === 18 && Math.abs(h.pace - 0.85) < 1e-9 && Math.abs(h.golden - 0.21) < 1e-9, JSON.stringify(h));
crypt.buy(u, 'vault');
check('the vault counts four more hours away', crypt.awayCap(u) === 12 && crypt.view(u).awayCapHours === 12);
u.at = T0;
check('the vault lets more away time pay out', Math.abs(crypt.settle(u, T0 + 100 * HOUR) - 18 * 12) < 1e-9);
for (let i = 0; i < 9; i++) crypt.buy(u, 'bell');
check('an upgrade stops at its best', u.upgrades.bell === 3 && crypt.upgradeCost(u, 'bell') === null && /at its best/.test(crypt.buy(u, 'bell').error));
u.souls = 5;
b = crypt.buy(u, 'lantern');
check('too few souls buy nothing, and say why', !b.ok && /Lantern costs 60/.test(b.error) && u.upgrades.lantern === 1, b.error);
check('an unknown upgrade is refused', !crypt.buy(u, 'moat').ok);
const saved = crypt.clean({ upgrades: { shovels: 99, bell: -2, lantern: 1.5, moat: 3 } }, T0);
check('damaged upgrades are made safe', JSON.stringify(saved.upgrades) === JSON.stringify({ shovels: 5, vault: 0, urns: 0, lantern: 0, bell: 0 }), JSON.stringify(saved.upgrades));

// Spirits: every ghost caught is bound in the crypt, and earns a soul an hour.
const g = crypt.fresh(T0);
crypt.earn(g, 'caught', 10);
check('ghosts caught bank souls and bind spirits', g.souls === 10 && g.spirits === 10);
check('each spirit earns a soul an hour, with no skeletons at all', crypt.perHour(g) === 10 && Math.abs(crypt.settle(g, T0 + HOUR) - 10) < 1e-9);
crypt.earn(g, 'reaped', 3);
check('only ghosts become spirits', g.spirits === 10);
crypt.earn(g, 'caught', 40);
check('the crypt holds 25 spirits at first', g.spirits === 25 && crypt.view(g).spiritRoom === 25);
g.souls = 100;
check('urns make room for 25 more', crypt.buy(g, 'urns').ok && crypt.spiritRoom(g) === 50);
crypt.earn(g, 'caught', 5);
check('and the next ghosts fill it', g.spirits === 30);
g.skeletons = 2;
const gv = crypt.view(g);
check('the crypt says what each half earns', gv.digPerHour === 12 && gv.spiritsPerHour === 30 && gv.perHour === 42, JSON.stringify(gv));
// Depths: the more souls ever gathered, the more everything earns.
const d = crypt.fresh(T0);
d.skeletons = 2; d.spirits = 10;
check('a new crypt is at depth 0, with the next at 100 souls', crypt.view(d).depth === 0 && crypt.view(d).nextDepthAt === 100 && crypt.perHour(d) === 22);
d.total = 600;
check('600 souls gathered is depth 2: a fifth more on everything', crypt.view(d).depth === 2 && crypt.view(d).depthBonus === 20 &&
  Math.abs(crypt.perHour(d) - 26.4) < 1e-9 && crypt.view(d).nextDepthAt === 2000);
d.total = 1e6;
check('the deepest depth has no next', crypt.view(d).depth === crypt.DEPTHS.length && crypt.view(d).nextDepthAt === null);
check('spending souls never makes it shallower', (d.souls = 500, crypt.buy(d, 'shovels').ok) && crypt.view(d).depth === crypt.DEPTHS.length);
check('a damaged save cannot hold more spirits than room', crypt.clean({ spirits: 999 }, T0).spirits === 25 && crypt.clean({ spirits: 999, upgrades: { urns: 2 } }, T0).spirits === 75);
check('an old save without upgrades still loads', crypt.clean({ souls: 3, skeletons: 1 }, T0).upgrades.shovels === 0);

// The plain commands that reach it.
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
got = await heard('crypt', { ok: true, result: { souls: 40, skeletons: 2, perHour: 12, nextCost: 34 } });
check('"crypt" reports the horde', got && got.name === 'get_crypt' && /40 souls/.test(got.reply) && /2 skeletons digging: 12/.test(got.reply), JSON.stringify(got));
got = await heard('buy a bone bell', { ok: true, result: { upgrade: 'bell', level: 1, spent: 30, souls: 10 } });
check('"buy a bone bell" buys the bell', got && got.name === 'buy_upgrade' && got.upgrade === 'bell' && /level 1/.test(got.reply) && /10 souls left/.test(got.reply), JSON.stringify(got));
got = await heard('upgrade shovels', { ok: false, error: 'Not enough souls.' });
check('"upgrade shovels" says why it could not', got && got.upgrade === 'shovels' && got.reply === 'Not enough souls.', JSON.stringify(got));
got = await heard('buy a deeper vault', { ok: true, result: { upgrade: 'vault', level: 1, spent: 50, souls: 0 } });
check('"buy a deeper vault" buys the vault', got && got.upgrade === 'vault', JSON.stringify(got));
got = await heard('buy lantern', { ok: true, result: { upgrade: 'lantern', level: 2, spent: 60, souls: 1 } });
check('"buy lantern" buys the lantern', got && got.upgrade === 'lantern' && /1 soul left/.test(got.reply), JSON.stringify(got));
got = await heard('buy urns', { ok: true, result: { upgrade: 'urns', level: 1, spent: 40, souls: 2 } });
check('"buy urns" buys urns', got && got.upgrade === 'urns', JSON.stringify(got));
got = await heard('crypt', { ok: true, result: { souls: 9, skeletons: 1, nextCost: 25, digPerHour: 6, spirits: 12, spiritRoom: 25, spiritsPerHour: 12, upgrades: [] } });
check('"crypt" counts the spirits too', got && /12 spirits bound \(room for 25\): 12 souls an hour/.test(got.reply), JSON.stringify(got));
got = await heard('summon', { ok: true, result: 'cast' });
check('"summon" is still the ghost game', got && got.name === 'cast' && got.ability === 'summon');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll crypt checks passed');
process.exit(failures ? 1 : 0);
