// Browser smoke tests: load the site in Chromium and exercise every feature.
// Run with `npm test`. Each check prints PASS or FAIL; any failure exits non-zero.
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const server = await serve();
const URL_ = `http://127.0.0.1:${server.address().port}/y2k-site/`;
const browser = await chromium.launch();
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

// One page at a time: pages left open keep animating and slow the others down.
let lastContext = null;

async function open({ width = 1366, height = 850, storage = {}, hint = true } = {}) {
  if (lastContext) await lastContext.close();
  const context = lastContext = await browser.newContext({ viewport: { width, height }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(([items, skipHint]) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    if (skipHint) localStorage.setItem('y2k-hint-seen', '1');
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, [storage, hint]);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) page.errors.push(r.status() + ' ' + r.url()); });
  await page.goto(URL_);
  await page.waitForTimeout(400);
  return page;
}

const act = (page, name) => page.click(`[data-ghost-action="${name}"]`, { force: true }).then(() => page.waitForTimeout(250));
const speech = (page) => page.textContent('#ghost-speech');
const soul = (page) => page.evaluate(() => +document.getElementById('ghostMana').getAttribute('aria-valuenow'));
const hasClass = (page, sel, cls) => page.evaluate(([s, c]) => document.querySelector(s).classList.contains(c), [sel, cls]);

try {
  // Load, theme
  let page = await open();
  check('page loads without errors', page.errors.length === 0, page.errors.join('; '));
  check('starts in dark mode', !(await hasClass(page, 'body', 'light-mode')));
  await page.click('#themeBtn');
  await page.reload(); await page.waitForTimeout(300);
  check('light mode is remembered', await hasClass(page, 'body', 'light-mode'));

  // First-visit hint
  page = await open({ hint: false });
  await page.waitForTimeout(4400);
  check('first visit hint opens the Music Box', (await speech(page)) === 'Drag me to a song.' && await hasClass(page, '.song-ring', 'is-open'));

  // Music, game card, dialogs, copy
  page = await open();
  await page.click('#musicTab');
  await page.click('.song-mark[data-song="0"]');
  await page.waitForTimeout(300);
  check('a song plays and labels the bubble', (await speech(page)) === 'Lamp' && await hasClass(page, '.song-mark[data-song="0"]', 'is-on'));
  await page.click('.song-mark[data-song="0"]');
  check('clicking the playing song stops it', (await speech(page)) === '✦ listen');
  await page.click('#portfolioTab');
  for (const i of [0, 1, 2, 3]) {
    await page.click(`.game-mark[data-game="${i}"]`);
    await page.waitForTimeout(150);
  }
  const card = await page.evaluate(() => {
    const r = document.getElementById('gameCard').getBoundingClientRect();
    return { title: document.getElementById('gameCardTitle').textContent, inView: r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth };
  });
  check('game card shows the picked game on screen', card.title === 'Expelled' && card.inView, JSON.stringify(card));
  await page.click('#gameCardClose');
  await page.click('#portfolioTab');
  for (const section of ['setup', 'contact']) {
    await page.click(`[data-target="${section}"]`);
    await page.waitForTimeout(350);
    const shown = await page.evaluate((s) => document.getElementById(s).classList.contains('active'), section);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(350);
    check(`${section} dialog opens and Escape closes it`, shown && !(await hasClass(page, '#modalContainer', 'active')));
  }
  await page.click('[data-target="contact"]'); await page.waitForTimeout(350);
  await page.click('[data-copy]'); await page.waitForTimeout(150);
  check('copy button copies the email', (await page.evaluate(() => navigator.clipboard.readText())) === 'dylthesage@gmail.com');
  check('no errors after music, cards and dialogs', page.errors.length === 0, page.errors.join('; '));

  // Reaper stays on screen and off the nav
  page = await open({ width: 360, height: 640 });
  let offScreen = 0, onNav = 0, worst = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const g = document.getElementById('ghost-pet-container').getBoundingClientRect();
      const hits = [...document.querySelectorAll('nav.bottom-nav button')].some((b) => {
        const n = b.getBoundingClientRect();
        return !(g.right < n.left || g.left > n.right || g.bottom < n.top || g.top > n.bottom);
      });
      return { off: g.bottom > innerHeight + 1 || g.right > innerWidth + 1, by: Math.round(g.bottom - innerHeight), say: document.getElementById('ghost-speech').textContent, hits };
    });
    if (r.off) { offScreen++; worst = Math.max(worst, r.by); console.log('      off by', r.by, 'px, bubble:', r.say); }
    if (r.hits) onNav++;
  }
  check('reaper column stays on screen', offScreen === 0, offScreen + ' samples off');
  check('reaper stays off the nav', onNav === 0, onNav + ' samples overlapping');
  check('no sideways scroll on a phone', (await page.evaluate(() => document.documentElement.scrollWidth)) <= 360);

  // Soul: spending, trickle, rest by keyboard
  page = await open();
  await act(page, 'summon');
  check('summon starts a catch round with a timer ring', !(await page.evaluate(() => document.getElementById('huntRing').hidden)));
  const afterSummon = await soul(page);
  await page.waitForTimeout(4300);
  check('soul trickles back away from the circle', (await soul(page)) > afterSummon);
  await page.focus('#rest-circle');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => +document.getElementById('ghostMana').getAttribute('aria-valuenow') >= 100, null, { timeout: 30000 }).catch(() => {});
  check('Enter on the rest circle walks him over and refills soul', (await soul(page)) >= 100, 'soul ' + (await soul(page)));

  // Wail and Shroud
  page = await open();
  await act(page, 'summon');
  await page.waitForTimeout(2500);
  await act(page, 'wail');
  check('wail cries out and shakes the page', (await speech(page)) === 'Begone.' && await hasClass(page, 'body', 'is-shaking'));
  await page.waitForTimeout(2500);
  const before = await page.textContent('#scoreCount');
  await act(page, 'shroud');
  check('shroud fades him into mist', await hasClass(page, '#ghost-character', 'is-shrouded'));
  await page.waitForTimeout(4600);
  const after = await page.textContent('#scoreCount');
  check('ghosts drift to the shrouded reaper and are caught', Number(after) > Number(before), before + ' -> ' + after);
  check('no errors from wail and shroud', page.errors.length === 0, page.errors.join('; '));

  // Rites
  const rite = async (seq, expectSpeech, extra) => {
    const p = await open();
    for (const a of seq) await act(p, a);
    await p.waitForTimeout(200);
    const said = await speech(p);
    const ok = expectSpeech.test(said) && (!extra || await extra(p));
    check(`rite ${seq.join(' > ')}`, ok, said);
    check(`  ...is recorded in the Grimoire`, (await p.textContent('#ritesCount')).startsWith('1/'));
    if (p.errors.length) check('  ...without errors', false, p.errors.join('; '));
    return p;
  };
  await rite(['reap', 'hex', 'summon'], /^(Your best|No mark)/, (p) => p.evaluate(() => !document.getElementById('bestBadge').classList.contains('is-secret')));
  await rite(['reap', 'reap', 'reap'], /Harvest/, (p) => p.evaluate(() => !!document.querySelector('.harvest-sweep')));
  await rite(['hex', 'hex', 'hex'], /Eclipse/, (p) => hasClass(p, 'body', 'is-eclipse'));
  await rite(['hex', 'summon', 'reap'], /song wakes/, (p) => p.evaluate(() => !document.querySelector('.song-mark[data-song="6"]').classList.contains('is-sealed')));
  await rite(['lantern', 'lantern', 'lantern'], /Vigil/, (p) => hasClass(p, 'body', 'is-vigil'));
  await rite(['lantern', 'hex', 'lantern'], /Marked/, (p) => p.evaluate(() => !!document.querySelector('.sigil')));
  await rite(['wail', 'wail', 'wail'], /BANSHEE/, (p) => hasClass(p, 'body', 'is-shaking'));
  await rite(['shroud', 'summon', 'shroud'], /answer/, (p) => p.evaluate(() =>
    document.querySelectorAll('.prey-ghost').length >= 5 && document.getElementById('ghost-character').classList.contains('is-shrouded')));

  // The last rite completes the Grimoire and plays the Requiem
  page = await open({ storage: { 'y2k-rites': '["best","eclipse","wraith","vigil","sigil","banshee","seance"]' } });
  check('seven of eight rites are remembered', (await page.textContent('#ritesCount')) === '7/8');
  for (const a of ['reap', 'reap', 'reap']) await act(page, a);
  await page.waitForTimeout(3600);
  const done = await page.evaluate(() => ({
    badge: document.getElementById('ritesCount').textContent,
    complete: document.getElementById('ritesBadge').classList.contains('is-complete'),
    end: !document.getElementById('grimoireEnd').hidden,
    say: document.getElementById('ghost-speech').textContent
  }));
  check('finding every rite completes the Grimoire and plays the Requiem', done.badge === '8/8' && done.complete && done.end && done.say === 'Requiem', JSON.stringify(done));

  // Forget wipes rites and scores after asking once more
  await page.click('#ritesBadge'); await page.waitForTimeout(350);
  await page.click('#forgetAsk');
  check('forget asks before wiping', await page.isVisible('#forgetYes'));
  await page.click('#forgetYes');
  await page.waitForLoadState('load'); await page.waitForTimeout(400);
  check('forget clears every rite', (await page.textContent('#ritesCount')) === '0/8' && await hasClass(page, '#ritesBadge', 'is-secret'));

  page = await open();
  await act(page, 'reap');
  await page.waitForTimeout(2500);
  await act(page, 'hex');
  await act(page, 'summon');
  check('a broken chain casts no rite', (await page.textContent('#ritesCount')) === '0/' + (await page.evaluate(() => document.querySelectorAll('#riteList .rite').length)));

  page = await open({ storage: { 'y2k-rites': '["best","wraith"]' } });
  check('found rites are remembered', (await page.textContent('#ritesCount')).startsWith('2/') && !(await hasClass(page, '.song-mark[data-song="6"]', 'is-sealed')));
  await page.click('#ritesBadge'); await page.waitForTimeout(350);
  check('Grimoire lists found rites by name', (await page.$$eval('.rite.is-found h3', (h) => h.map((x) => x.textContent))).join() === 'Tally,Wraith');
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
