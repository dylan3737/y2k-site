// Browser checks for the desktop companion's page (desktop/renderer). In a tab
// the page uses its stand-in for the Electron bridge, so this needs no Electron.
// Run with `npm run test:desktop`.
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const server = await serve();
const URL_ = `http://127.0.0.1:${server.address().port}/y2k-site/desktop/renderer/index.html`;
const browser = await chromium.launch();
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

let context = null;
async function open(storage = {}) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((items) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('reaper-companion', JSON.stringify(items));
  }, storage);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) page.errors.push(r.status() + ' ' + r.url()); });
  await page.goto(URL_);
  await page.waitForTimeout(300);
  return page;
}

const mode = (page) => page.evaluate(() => window.__reaper.mode);
const soul = (page) => page.evaluate(() => window.__reaper.soul);
const visible = (page, sel) => page.evaluate((s) => {
  const n = document.querySelector(s);
  return !!n && !n.closest('[hidden]') && getComputedStyle(n).display !== 'none';
}, sel);
const bodyCenter = (page) => page.evaluate(() => {
  const r = document.getElementById('body').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

async function castFromRing(page, id) {
  if (!(await visible(page, '#ring'))) await page.click('#body', { force: true });
  await page.waitForTimeout(260);
  await page.click(`.ring-btn[data-id="${id}"]`, { force: true });
  await page.waitForTimeout(150);
}

try {
  let page = await open({ wander: false });
  check('page loads without errors', page.errors.length === 0, page.errors.join('; '));
  check('reaper is drawn', await visible(page, '#body'));
  check('soul starts full', (await soul(page)) === 100);

  // The ring
  await page.click('#body', { force: true });
  await page.waitForTimeout(300);
  const buttons = await page.$$eval('.ring-btn', (b) => b.map((x) => x.dataset.id));
  check('click opens the ring of ten abilities', buttons.length === 10, buttons.join(','));
  const onScreen = await page.$$eval('.ring-btn', (b) => b.every((x) => {
    const r = x.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }));
  check('every ring button is on screen', onScreen);
  await page.keyboard.press('Escape');
  check('Escape closes the ring', !(await visible(page, '#ring')));

  // Eclipse toggles
  await castFromRing(page, 'eclipse');
  check('Eclipse darkens the screen', await visible(page, '#eclipse'));
  check('Eclipse costs 10 soul', (await soul(page)) === 90);
  await page.mouse.move(300, 300);
  const cx = await page.evaluate(() => document.getElementById('eclipse').style.getPropertyValue('--cx'));
  check('Eclipse light follows the cursor', cx === '300px', cx);
  await castFromRing(page, 'eclipse');
  await page.waitForTimeout(900);
  check('casting Eclipse again ends it for free', !(await visible(page, '#eclipse')) && (await soul(page)) >= 90);

  // Summon
  await castFromRing(page, 'summon');
  await page.waitForTimeout(1500);
  const ghosts = await page.$$('.ghost:not(.is-caught)');
  check('Summon releases ghosts', ghosts.length >= 6, String(ghosts.length));
  const before = await soul(page);
  // Click one that has flown well onto the screen, where it is now.
  const at = await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('.ghost:not(.is-caught)'), (n) => n.getBoundingClientRect())
      .find((b) => b.left > 60 && b.right < innerWidth - 60);
    return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (at) await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(100);
  check('clicking a ghost catches it', /SOULS [1-9]/.test(await page.textContent('.score')));
  check('a caught ghost gives soul back', (await soul(page)) > before);
  // Slash during a hunt reaps every ghost
  await castFromRing(page, 'slash');
  await page.waitForTimeout(150);
  check('Slash draws the cut', !!(await page.$('.slash-line')));
  await page.waitForTimeout(1200);
  check('Slash reaps every loose ghost', (await page.$$('.ghost:not(.is-caught)')).length <= 1);
  await page.waitForTimeout(9000);
  check('the hunt ends and ghosts leave', (await page.$$('.ghost')).length === 0);
  const best = await page.evaluate(() => window.__companion.read().best);
  check('best catch is saved', best >= 1, String(best));

  // Hourglass
  page = await open({ wander: false });
  await castFromRing(page, 'hourglass');
  check('Hourglass opens its card', await visible(page, '#card'));
  await page.click('#card .chip:has-text("25 min")');
  await page.waitForTimeout(1100);
  check('picking a length starts the sand', await visible(page, '#sand'));
  check('the hourglass costs 10 soul', (await soul(page)) === 90);
  const saved = await page.evaluate(() => window.__companion.read().hourglass);
  check('the timer is saved', !!saved && saved.total === 25 * 60000);

  // Raven
  await castFromRing(page, 'raven');
  await page.fill('#card input', 'Feed the cat');
  await page.click('#card .chip:has-text("5 min")');
  await page.click('#card .chip:has-text("Send")');
  const ravens = await page.evaluate(() => window.__companion.read().ravens);
  check('a raven is scheduled and saved', ravens.length === 1 && ravens[0].text === 'Feed the cat');
  page = await open({ wander: false, ravens: [{ id: 'r1', at: Date.now() - 1000, text: 'Stretch' }] });
  await page.waitForTimeout(1300);
  check('a due raven flies in with its note', (await page.textContent('.raven-note')).includes('Stretch'));
  await page.click('.raven-note .chip:has-text("Done")');
  check('Done sends the raven away', !(await page.$('.raven-note')));

  // Tools from Speak, through the bridge
  const tool = (name, input) => page.evaluate(([n, i]) => new Promise((resolve) => {
    const id = String(Math.random());
    const off = window.__companion.on('tool-result', (r) => { if (r.id === id) { off(); resolve(r.outcome); } });
    window.__companion.emit('tool-call', { id, name: n, input: i });
  }), [name, input]);
  let out = await tool('send_raven', { text: 'Oven', minutes: 0 });
  check('a tool call with bad input is refused', out.ok === false);
  out = await tool('send_raven', { text: 'Oven', minutes: 20 });
  check('send_raven schedules a reminder', out.ok === true && !!out.result.id);
  out = await tool('list_ravens', {});
  check('list_ravens lists it', out.ok && out.result.some((r) => r.text === 'Oven'));
  out = await tool('cancel_raven', { id: out.result[0].id });
  check('cancel_raven cancels it', out.ok && out.result.cancelled === true);
  out = await tool('set_hourglass', { minutes: 25.5 });
  check('set_hourglass refuses a fraction', out.ok === false);
  out = await tool('set_hourglass', { minutes: 25 });
  check('set_hourglass starts the sand', out.ok && await visible(page, '#sand'));
  out = await tool('cast', { ability: 'eclipse' });
  check('cast runs an ability', out.ok && await visible(page, '#eclipse'));
  out = await tool('cast', { ability: 'speak' });
  check('cast refuses abilities outside its list', out.ok === false);
  out = await tool('get_harvest', {});
  check('get_harvest reports the day', out.ok && 'activeMinutes' in out.result && out.result.hourglassMinutesLeft === 25);

  // Speak card
  page = await open({ wander: false });
  await castFromRing(page, 'speak');
  check('Speak opens its card', await visible(page, '#card textarea'));
  check('without a key it asks for one', await visible(page, '#card input[type=password]'));
  await page.fill('#card textarea', 'hello');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('the question shows in the card', (await page.textContent('.line.you')) === 'hello');
  check('an error is shown in the card', (await page.$$('.line.oops, #card input[type=password]')).length > 0);
  // A streamed answer with a tool call in the middle
  await page.evaluate(() => {
    const e = (d) => window.__companion.emit('speech', d);
    const box = document.querySelector('#card textarea');
    box.value = 'remind me';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    e({ type: 'delta', text: 'As you ' });
    e({ type: 'delta', text: 'wish.' });
    e({ type: 'tool', name: 'send_raven', input: { text: 'x', minutes: 5 } });
    e({ type: 'delta', text: 'Done.' });
    e({ type: 'done' });
  });
  const lines = await page.$$eval('.log .line:not(.oops)', (l) => l.map((x) => x.className.replace('line ', '') + ':' + x.textContent));
  const tail = lines.slice(-4).join(' | ');
  check('his answer streams in, with the spell between his words',
    tail === 'you:remind me | him:As you wish. | cast:✦ sends a raven | him:Done.', tail);

  // Away and back
  page = await open({ wander: false, soul: 50 });
  await page.evaluate(() => window.__companion.emit('away', { away: true }));
  check('he sleeps while the computer is idle', (await mode(page)) === 'sleep');
  await page.evaluate(() => window.__companion.emit('away', { away: false, minutes: 12 }));
  check('he wakes and says how long you were gone', (await page.textContent('#bubble')).includes('Gone 12 min'));
  check('sleep restores soul', (await soul(page)) > 90);

  // Drag, rest, throw
  page = await open({ wander: false, soul: 40 });
  let c = await bodyCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(c.x - i * 20, c.y - i * 10); await page.waitForTimeout(30); }
  await page.waitForTimeout(250);
  await page.mouse.up();
  check('setting him down gently makes him rest', (await mode(page)) === 'rest');
  await page.waitForTimeout(1000);
  check('resting refills soul', (await soul(page)) > 45);
  c = await bodyCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(c.x + i * 60, c.y + i * 10); await page.waitForTimeout(16); }
  await page.mouse.up();
  check('flinging him throws him', (await mode(page)) === 'fly');
  await page.waitForTimeout(3500);
  const p = await page.evaluate(() => ({ ...window.__reaper.pos }));
  check('a thrown reaper stays on screen', p.x >= 0 && p.y >= 0 && p.x <= 1280 - 92 && p.y <= 800 - 114, JSON.stringify(p));
  check('he settles after a throw', (await mode(page)) !== 'fly');

  // Vanish and come back; come here
  await castFromRing(page, 'vanish');
  await page.waitForTimeout(1000);
  check('Vanish sends him to the corner', (await mode(page)) === 'vanish');
  await page.click('#body', { force: true });
  check('clicking him brings him back', (await mode(page)) === 'wander');
  await page.mouse.move(400, 300);
  await page.evaluate(() => window.__companion.emit('command', 'come'));
  c = await bodyCenter(page);
  check('Come here steps him to the cursor', Math.abs(c.x - 400) < 60, JSON.stringify(c));

  // Harvest and Reap say something
  await castFromRing(page, 'harvest');
  await page.waitForTimeout(200);
  check('Harvest reads the day', (await page.textContent('#bubble')).includes('harvest'));

  check('no errors along the way', page.errors.length === 0, page.errors.join('; '));
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll desktop checks passed');
process.exit(failures ? 1 : 0);
