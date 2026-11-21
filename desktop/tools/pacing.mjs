// Plays the Crypt for a few weeks as three kinds of user and prints when each
// purchase and milestone lands, so the numbers in crypt.js can be tuned from
// what happens rather than from feel. Nothing here is random: a round of
// Summon is worth its average.
//
//   node tools/pacing.mjs            three profiles, 28 days, a line a day
//   node tools/pacing.mjs typical    one profile, with every purchase
//   node tools/pacing.mjs typical 60 ...for 60 days
import * as crypt from '../crypt.js';

const HOUR = 3600000;
const MIN = 60000;

// A working day: when the app is open, and what the user does in it.
// `ghosts` is ghosts clicked in one round of Summon; golden ones count for 3.
const PROFILES = {
  casual: { blurb: '4 h a day, one 25-minute hourglass, Summon every other day', open: 4, glasses: [25], summons: 0.5, ghosts: 9, files: 0.2, daysOff: 2 },
  typical: { blurb: '9 h a day, three 25-minute hourglasses, one Summon, a file every other day', open: 9, glasses: [25, 25, 25], summons: 1, ghosts: 12, files: 0.5, daysOff: 2 },
  heavy: { blurb: '12 h a day, six 25s and a 50, three Summons, two files, every day', open: 12, glasses: [25, 25, 25, 50, 25, 25, 25], summons: 3, ghosts: 15, files: 2, daysOff: 0 }
};

// What a soul spent here brings back: hours until a purchase has paid for itself.
function payback(c, profile, option) {
  const perDay = (n) => n / 24;
  const workdays = (7 - profile.daysOff) / 7;
  if (option.kind === 'skeleton') return option.cost / (crypt.RATE_PER_HOUR * (1 + 0.25 * c.upgrades.shovels));
  const before = crypt.view(c);
  const trial = structuredClone(c);
  trial.upgrades[option.id] += 1;
  const after = crypt.view(trial);
  let gain = 0; // souls an hour, averaged over the week
  if (option.id === 'shovels') gain = after.perHour - before.perHour;
  if (option.id === 'graves') gain = before.perHour * Math.max(0, Math.min(after.awayCapHours, 24 - profile.open) - Math.min(before.awayCapHours, 24 - profile.open)) / 24;
  if (option.id === 'sand') {
    const minutes = profile.glasses.reduce((a, b) => a + b, 0);
    gain = perDay(minutes * workdays) * (parseFloat(after.upgrades[2].now) - parseFloat(before.upgrades[2].now));
  }
  if (option.id === 'lure') gain = perDay(profile.summons * profile.ghosts * 2 * (after.goldenChance - before.goldenChance) * workdays);
  return gain > 0 ? option.cost / gain : Infinity;
}

function play(name, days, log) {
  const profile = PROFILES[name];
  let now = Date.UTC(2026, 0, 5, 9); // a Monday, 9 in the morning
  const c = crypt.fresh(now);
  const firsts = {};
  const at = () => {
    const hours = (now - Date.UTC(2026, 0, 5, 9)) / HOUR;
    return 'day ' + (Math.floor((hours + 9) / 24) + 1) + ' ' + String(Math.floor((hours + 9) % 24)).padStart(2, '0') + ':' + String(Math.round((hours * 60) % 60)).padStart(2, '0');
  };
  const note = (what) => { if (log) console.log('  ' + at().padEnd(13) + what); };
  const first = (key) => { if (!(key in firsts)) firsts[key] = at(); };
  const told = (reached) => reached.forEach((m) => note('milestone: ' + m.name + ' (+' + m.reward + ')'));

  // Spend on whatever pays for itself soonest, as long as he can afford it.
  function shop() {
    for (;;) {
      const options = [{ kind: 'skeleton', cost: crypt.cost(c.skeletons) }];
      for (const u of crypt.UPGRADES) {
        const price = crypt.upgradeCost(c, u.id);
        if (price !== null) options.push({ kind: 'upgrade', id: u.id, name: u.name, cost: price });
      }
      const pick = options.filter((o) => o.cost <= c.souls).sort((a, b) => payback(c, profile, a) - payback(c, profile, b))[0];
      if (!pick) return;
      const out = crypt.act(c, pick.kind === 'skeleton' ? { raise: 1 } : { buy: pick.id }, now);
      if (!out.ok) return;
      if (pick.kind === 'skeleton') {
        first('skeleton ' + c.skeletons);
        note('skeleton ' + c.skeletons + ' for ' + pick.cost + '  -> ' + crypt.view(c).perHour + ' souls/h');
      } else {
        first('upgrade');
        note(pick.name + ' ' + c.upgrades[pick.id] + ' for ' + pick.cost);
      }
      told(out.reached);
    }
  }
  const did = (key, n) => { told(crypt.deed(c, key, n, now).reached); shop(); };

  const rows = [];
  let carry = { summons: 0, files: 0 };
  for (let day = 0; day < days; day++) {
    const start = now;
    const working = day % 7 < 7 - profile.daysOff;
    if (working) {
      // Opening the app pays for the night; then the day's deeds, spread out.
      crypt.settle(c, now);
      shop();
      const deeds = profile.glasses.map((m) => ['focus', m]);
      carry.summons += profile.summons;
      carry.files += profile.files;
      for (; carry.summons >= 1; carry.summons--) deeds.push(['caught', Math.round(profile.ghosts * (1 + 2 * crypt.goldenChance(c)))]);
      for (; carry.files >= 1; carry.files--) deeds.push(['reaped', 1]);
      const gap = (profile.open * HOUR) / (deeds.length + 1);
      let next = start + gap;
      for (let t = start; t < start + profile.open * HOUR; t += MIN) {
        now = t;
        // While open, the digging is counted every minute, as the app does.
        crypt.settle(c, now);
        if (deeds.length && t >= next) {
          did(...deeds.shift());
          next += gap;
        }
        if ((t - start) % HOUR === 0) shop();
      }
    }
    now = start + 24 * HOUR;
    const v = crypt.view(c);
    rows.push({
      day: day + 1, souls: v.souls, skeletons: v.skeletons, 'souls/h': v.perHour,
      upgrades: crypt.UPGRADES.map((u) => c.upgrades[u.id]).join('/'), milestones: c.done.length + '/' + crypt.MILESTONES.length,
      'ever held': v.total
    });
  }
  return { rows, firsts, profile };
}

const [only, span] = process.argv.slice(2);
const days = Number(span) || 28;
for (const name of only ? [only] : Object.keys(PROFILES)) {
  if (!PROFILES[name]) {
    console.error('No such profile. There are: ' + Object.keys(PROFILES).join(', '));
    process.exit(1);
  }
  console.log('\n' + name.toUpperCase() + ': ' + PROFILES[name].blurb);
  const { rows, firsts } = play(name, days, !!only);
  console.table(only ? rows : rows.filter((r) => [1, 2, 3, 5, 7, 14, 21, 28].includes(r.day) || r.day === days));
  const wanted = ['skeleton 1', 'upgrade', 'skeleton 5', 'skeleton 10', 'skeleton 25'];
  console.log(wanted.map((k) => k + ': ' + (firsts[k] || 'not in ' + days + ' days')).join('   '));
  console.log('upgrades are ' + crypt.UPGRADES.map((u) => u.id).join('/'));
}
