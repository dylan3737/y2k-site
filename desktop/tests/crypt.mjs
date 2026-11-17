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

check('a ghost is worth one soul', crypt.earn(c, 'caught', 7) === 7 && c.souls === 7);
check('a file is worth five', crypt.earn(c, 'reaped', 2) === 10 && c.souls === 17);
check('a finished hourglass is worth its minutes', crypt.earn(c, 'focus', 25) === 25 && c.souls === 42);
check('an unknown deed is worth nothing', crypt.earn(c, 'cheat', 1e9) === 0 && crypt.earn(c, 'caught', -5) === 0 && crypt.earn(c, 'caught', NaN) === 0 && c.souls === 42);

let out = crypt.raise(c);
check('souls raise a skeleton', out.ok && out.raised === 1 && c.skeletons === 1 && c.souls === 17);
check('the next one costs more', crypt.view(c).nextCost === 29, String(crypt.view(c).nextCost));
out = crypt.raise(c);
check('too few souls raise nothing, and say why', !out.ok && /costs 29/.test(out.error) && c.skeletons === 1 && c.souls === 17, out.error);

check('a skeleton digs six souls an hour', Math.abs(crypt.settle(c, T0 + HOUR) - 6) < 1e-9 && Math.abs(c.souls - 23) < 1e-9);
check('nothing is dug twice', crypt.settle(c, T0 + HOUR) === 0);
check('half an hour digs half as much', Math.abs(crypt.settle(c, T0 + 1.5 * HOUR) - 3) < 1e-9);
check('time uncounted pays out eight hours at most', Math.abs(crypt.settle(c, T0 + 101.5 * HOUR) - 48) < 1e-9);
check('a clock set back digs nothing and takes nothing', crypt.settle(c, T0) === 0 && c.souls > 70 && c.at === T0);
check('the total counts every soul ever held', Math.abs(c.total - (42 + 6 + 3 + 48)) < 1e-9, String(c.total));

c.souls = 1000;
out = crypt.raise(c, 3);
check('several can be raised at once', out.ok && out.raised === 3 && c.skeletons === 4);
c.souls = crypt.cost(4) + 1;
out = crypt.raise(c, 10);
check('asking for more than the souls allow raises what they can', out.ok && out.raised === 1 && c.skeletons === 5);
const seen = crypt.view(c);
check('the page is shown whole souls', Number.isInteger(seen.souls) && seen.perHour === 30 && seen.skeletons === 5, JSON.stringify(seen));

const bad = crypt.clean({ souls: -5, skeletons: 1e9, total: 'x', at: T0 + 9e15 }, T0);
check('a damaged save is made safe', bad.souls === 0 && bad.skeletons === crypt.MAX_SKELETONS && bad.total === 0 && bad.at === T0, JSON.stringify(bad));
check('a missing save is an empty crypt', crypt.clean(undefined, T0).skeletons === 0);

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
got = await heard('summon', { ok: true, result: 'cast' });
check('"summon" is still the ghost game', got && got.name === 'cast' && got.ability === 'summon');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll crypt checks passed');
process.exit(failures ? 1 : 0);
