// Browser checks for the desktop companion's page (desktop/renderer). In a tab
// the page uses its stand-in for the Electron bridge, so this needs no Electron.
// Run with `npm run test:desktop`.
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const server = await serve();
const URL_ = `http://127.0.0.1:${server.address().port}/y2k-site/desktop/renderer/index.html`;
// Software WebGL, so the shader effects (Vortex, Burn, Melt) run without a GPU.
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

let context = null;
async function open(storage = {}) {
  if (context) await context.close();
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // The first-run guide has been seen, and the garden starts empty (a real new
  // one starts with enough for a sprite), unless a test says otherwise.
  await context.addInitScript((items) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('reaper-companion', JSON.stringify(items));
  }, { guided: true, crypt: { souls: 0 }, ...storage });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) page.errors.push(r.status() + ' ' + r.url()); });
  await page.goto(URL_);
  await page.waitForTimeout(300);
  return page;
}

// Sends a Speak tool call into the page; the outcome lands in window.__toolOut.
const toolCallOn = (page, name, input) => page.evaluate(([n, i]) => {
  window.__toolOut = undefined;
  const id = String(Math.random());
  const off = window.__companion.on('tool-result', (r) => { if (r.id === id) { off(); window.__toolOut = r.outcome; } });
  window.__companion.emit('tool-call', { id, name: n, input: i });
}, [name, input]);

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

// Open his ring and cast. During a hunt a ghost can be flying over him, and a
// click there catches it instead (as it should), so try until the ring is open.
async function castFromRing(page, id) {
  for (let i = 0; i < 6 && !(await visible(page, '#ring')); i++) {
    await page.click('#body', { force: true });
    await page.waitForTimeout(260);
  }
  // The screen effects are behind the Effects button.
  if (!(await page.$(`.ring-btn[data-id="${id}"]`)) && (await page.$('.ring-btn[data-id="effects"]'))) {
    await page.click('.ring-btn[data-id="effects"]', { force: true, timeout: 5000 });
    await page.waitForTimeout(150);
  }
  await page.click(`.ring-btn[data-id="${id}"]`, { force: true, timeout: 5000 });
  await page.waitForTimeout(150);
}

try {
  // The first-run guide, walked through as a newcomer would.
  {
    const g = await open({ guided: false, wander: false, muted: true, crypt: undefined });
    const step = () => g.evaluate(() => window.__reaper.guide.step);
    check('the first time, the guide shows instead of a greeting', !!(await g.waitForSelector('.guide', { timeout: 4000 }).catch(() => null)) && (await step()) === 0);
    const b = await g.locator('#body').boundingBox();
    await g.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await g.mouse.down();
    await g.mouse.move(b.x + b.width / 2 - 120, b.y + b.height / 2 - 60, { steps: 8 });
    await g.mouse.up();
    await g.waitForTimeout(600);
    check('guide: dragging him and letting go is step one done', (await step()) === 1, String(await step()));
    await g.evaluate(() => window.__reaper.retarget());
    await g.click('#body', { force: true });
    await g.waitForTimeout(600);
    check('guide: opening his ring is step two', (await step()) === 2, String(await step()));
    await g.click('.ring-btn[data-id="crypt"]', { force: true });
    await g.waitForTimeout(600);
    check('guide: opening the Garden is step three', (await step()) === 3, String(await step()));
    check('a new garden has just enough for a moss sprite', (await g.evaluate(() => window.__reaper.crypt.get().souls)) >= 25);
    await g.click('#card [aria-label^="Raise a moss sprite"]');
    await g.waitForTimeout(600);
    check('guide: raising a first sprite is step four; reaping is explained, with Next', (await step()) === 4 &&
      /reap/.test(await g.textContent('.guide')) && !!(await g.$('.guide .chip:has-text("Next")')), String(await step()));
    await g.click('.guide .chip:has-text("Next")');
    await g.waitForTimeout(300);
    await g.evaluate(() => window.__reaper.dragon.open());
    await g.waitForTimeout(200);
    await g.click('#card .chip:has-text("Take the egg")');
    await g.waitForTimeout(600);
    check('guide: taking the egg leads to the last step, about Speak', (await step()) === 6 && /Speak/.test(await g.textContent('.guide')), String(await step()));
    await g.click('.guide .chip:has-text("Done")');
    await g.waitForTimeout(300);
    check('done, the guide goes, and is remembered', !(await g.$('.guide')) && (await g.evaluate(() => window.__companion.read().guided)) === true);
    await g.reload();
    await g.waitForSelector('#body');
    await g.waitForTimeout(2200);
    check('and does not come back by itself', !(await g.$('.guide')));
    const shown = await g.evaluate(() => window.__reaper.abilities.runTool('show_guide', {}));
    check('Speak can show it again', shown.ok && !!(await g.$('.guide')));
    await g.click('.guide .chip:has-text("Skip the guide")');
    await g.waitForTimeout(200);
    check('and it can be skipped', !(await g.$('.guide')));
    check('no errors in the guide', g.errors.length === 0, g.errors.join('; '));
  }

  let page = await open({ wander: false });
  check('page loads without errors', page.errors.length === 0, page.errors.join('; '));
  check('reaper is drawn', await visible(page, '#body'));
  check('soul starts full', (await soul(page)) === 100);

  // The ring
  await page.click('#body', { force: true });
  await page.waitForTimeout(300);
  const buttons = await page.$$eval('.ring-btn', (b) => b.map((x) => x.dataset.id));
  const EFFECT_IDS = ['slash', 'shatter', 'glitch', 'vortex', 'burn', 'melt', 'soulrip'];
  check('click opens the ring: ten buttons, the effects behind one', buttons.length === 10 && buttons.includes('effects') &&
    buttons.includes('dragonbreath') && buttons.includes('dragon') && !buttons.some((b) => EFFECT_IDS.includes(b)), buttons.join(','));
  const overlap = await page.$$eval('.ring-btn', (b) => {
    const boxes = b.map((x) => x.getBoundingClientRect());
    return boxes.some((a, i) => boxes.some((c, j) => i < j && a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom));
  });
  check('ring buttons do not overlap', !overlap);
  const onScreen = await page.$$eval('.ring-btn', (b) => b.every((x) => {
    const r = x.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }));
  check('every ring button is on screen', onScreen);
  await page.click('.ring-btn[data-id="effects"]');
  await page.waitForTimeout(250);
  const fx = await page.$$eval('.ring-btn', (b) => b.map((x) => x.dataset.id));
  check('Effects opens a ring of the seven effects, and Back', fx.length === 8 && EFFECT_IDS.every((id) => fx.includes(id)) && fx.includes('back'), fx.join(','));
  await page.click('.ring-btn[data-id="back"]');
  await page.waitForTimeout(250);
  check('Back returns to the main ring', (await page.$$('.ring-btn')).length === 10 && !!(await page.$('.ring-btn[data-id="effects"]')));
  await page.keyboard.press('Escape');
  check('Escape closes the ring', !(await visible(page, '#ring')));

  // Hum toggles
  const humming = () => page.evaluate(() => window.__reaper.abilities.byId.hum.active());
  await castFromRing(page, 'hum');
  check('Hum starts the music box', await humming());
  check('Hum costs 5 soul', (await soul(page)) === 95);
  await castFromRing(page, 'hum');
  check('casting Hum again stops it for free', !(await humming()) && (await soul(page)) >= 95);

  // Reaping: drop him on a skeleton, and hunt what bursts out
  page = await open({ wander: false, muted: true, soul: 80,
    crypt: { souls: 0, skeletons: 1, born: [Date.now() - 3.5 * 3600000], total: 0, at: Date.now() } });
  check('a skeleton that dug 3.5 hours holds 4 ghosts', (await page.evaluate(() => window.__reaper.crypt.get().bones[0].ripe)) === 4);
  const bone = await page.locator('.field .digger').boundingBox();
  const from = await bodyCenter(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // His feet are half his height below his middle; land them on the skeleton.
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + (bone.x + bone.width / 2 - from.x) * i / 12, from.y + (bone.y + bone.height / 2 - 57 - from.y) * i / 12);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(150);
  check('the skeleton under him lights up', await page.$eval('.field .digger', (n) => n.classList.contains('is-aimed')));
  await page.mouse.up();
  await page.waitForTimeout(400);
  check('dropping him on it reaps it: its 4 ghosts burst out, and a seed is left where it was', (await page.$$('.ghost:not(.is-caught)')).length === 4 &&
    (await page.$$('.field .digger')).length === 0 && (await page.$$('.field .seed')).length === 1 &&
    (await page.evaluate(() => window.__reaper.crypt.get().bones[0].rest)) === 30,
  String((await page.$$('.ghost')).length));
  check('he says so', (await page.textContent('#bubble')).includes('4 ghosts'), await page.textContent('#bubble'));
  const before = await soul(page);
  await page.waitForTimeout(600);
  const at = await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('.ghost:not(.is-caught)'), (n) => n.getBoundingClientRect())
      .find((b) => b.left > 0 && b.right < innerWidth && b.top > 0 && b.bottom < innerHeight);
    return r && { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (at) await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(100);
  check('clicking a ghost catches it for points', /SCORE [1-9]/.test(await page.textContent('.score')), await page.textContent('.score'));
  check('a caught ghost gives soul back', (await soul(page)) > before);
  // Slash during a hunt catches every ghost still loose, which ends the hunt.
  await castFromRing(page, 'slash');
  await page.waitForTimeout(150);
  check('Slash draws the cut', !!(await page.$('.slash-line')));
  await page.waitForTimeout(1400);
  check('Slash catches every loose ghost, and the hunt ends', (await page.$$('.ghost:not(.is-caught)')).length === 0 &&
    !(await page.evaluate(() => window.__reaper.abilities.hunting)));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__reaper.crypt.get());
  check('the crypt pays for the catch and keeps the score', after.souls >= 40 && after.score >= 40 && after.skeletons === 1,
    JSON.stringify({ souls: after.souls, score: after.score }));
  const best = await page.evaluate(() => window.__companion.read().best);
  check('best score is saved', best >= 40, String(best));

  // Summon: the Gathering. Every skeleton bursts at once, for one big hunt.
  const ripeFor = (h) => Date.now() - h * 3600000;
  page = await open({ wander: false, muted: true, soul: 100,
    crypt: { souls: 0, skeletons: 3, born: [ripeFor(2.5), ripeFor(2.4), ripeFor(2.3)], total: 0, at: Date.now() } });
  await page.evaluate(() => { Math.random = () => 0.9; });
  await castFromRing(page, 'summon');
  await page.waitForTimeout(400);
  check('Summon gathers every skeleton: 3 ghosts each, and one more for each past the first', (await page.$$('.ghost:not(.is-caught)')).length === 11,
    String((await page.$$('.ghost')).length));
  check('he calls them', (await page.textContent('#bubble')).includes('The garden answers'), await page.textContent('#bubble'));
  check('and they all rest a while, seeds where they stood', (await page.$$('.field .seed')).length === 3 && (await page.$$('.field .digger')).length === 0 &&
    (await page.evaluate(() => window.__reaper.crypt.get().bones.every((b) => b.rest === 30))),
  JSON.stringify({ seeds: (await page.$$('.field .seed')).length, diggers: (await page.$$('.field .digger')).length, bones: await page.evaluate(() => window.__reaper.crypt.get().bones) }));
  await castFromRing(page, 'slash');
  await page.waitForTimeout(2200);
  const feast = await page.evaluate(() => window.__reaper.crypt.get());
  check('the big hunt pays for every ghost', feast.souls >= 110 && !(await page.evaluate(() => window.__reaper.abilities.hunting)), String(feast.souls));
  await page.waitForTimeout(2000);
  check('no wraith when the dice say not', !(await page.$('.wraith')));

  // Sometimes something else answers the call: a wraith, after the hunt.
  page = await open({ wander: false, muted: true, soul: 100, crypt: { souls: 0, skeletons: 1, total: 0, at: Date.now() } });
  await page.evaluate(() => { Math.random = () => 0.1; });
  await castFromRing(page, 'summon');
  await page.waitForTimeout(300);
  await castFromRing(page, 'slash');
  await page.waitForTimeout(3600);
  check('sometimes a wraith answers too, once the hunt is over', !!(await page.$('.wraith')) && (await page.textContent('.score')).startsWith('WRAITH'),
    await page.textContent('#bubble'));
  const soulsBefore = await page.evaluate(() => window.__reaper.crypt.get().souls);
  for (let i = 0; i < 12; i++) {
    const w = await page.$eval('.wraith', (n) => { const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }).catch(() => null);
    if (!w) break;
    await page.mouse.click(w.x, w.y);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  const won = await page.evaluate(() => window.__reaper.crypt.get());
  check('struck 12 times, it is banished: souls, and a skeleton rises', (await page.textContent('#bubble')).includes('Banished') &&
    won.souls >= soulsBefore + 60 && won.skeletons === 2, await page.textContent('#bubble'));

  // With no workers, Summon is never for nothing: the soil gives a first one.
  page = await open({ wander: false, muted: true, soul: 100 });
  await castFromRing(page, 'summon');
  await page.waitForTimeout(400);
  check('with no skeletons, Summon raises the first', (await page.evaluate(() => window.__reaper.crypt.get().skeletons)) === 1 &&
    (await page.$$('.field .digger')).length === 1 && (await page.textContent('#bubble')).includes('Grow'), await page.textContent('#bubble'));

  // The sprites live: they work, then wander off; a full one blooms and leaks wisps; they hop when he comes near.
  page = await open({ wander: false, muted: true,
    crypt: { souls: 0, skeletons: 2, born: [ripeFor(7), ripeFor(0.2)], total: 0, at: Date.now() } });
  await page.waitForTimeout(1000);
  const startX = await page.$$eval('.field .digger', (ns) => ns.map((n) => n.getBoundingClientRect().left));
  await page.evaluate(() => { Math.random = () => 0.3; window.__reaper.crypt.stir(); });
  await page.waitForTimeout(1200);
  check('done working, a sprite walks somewhere new, and leaves no dirt behind', (await page.$$('.mound')).length === 0 &&
    (await page.$$('.field .digger.is-walking')).length === 2 &&
    (await page.$$eval('.field .digger', (ns) => ns.map((n) => n.getBoundingClientRect().left))).some((x, i) => Math.abs(x - startX[i]) > 10));
  check('a full one rattles and leaks wisps', (await page.$$('.field .digger.is-ripe')).length === 1 && (await page.$$('.wisp')).length > 0);
  check('each sprite\'s sprout shows how ripe it is: a bloom when full, a seedling when new', await page.evaluate(() => {
    const stages = [...document.querySelectorAll('.field .digger')].map((n) => n.style.getPropertyValue('--stage')).sort();
    const bloom = document.querySelector('.field .digger.is-ripe .sprout');
    return stages.join() === '1,6' && !!bloom && /sprout\.png/.test(getComputedStyle(bloom).backgroundImage);
  }));
  check('a rare ghost is a spirit-light', await page.evaluate(() => {
    const g = document.createElement('div');
    g.className = 'ghost is-golden';
    document.body.appendChild(g);
    const look = getComputedStyle(g, '::before').backgroundImage;
    g.remove();
    return /spiritlight\.png/.test(look);
  }));
  // Picking one up: it dangles, and dropped, it falls back to the ground.
  await page.evaluate(() => window.__reaper.crypt.stir());
  await page.waitForTimeout(100);
  const pick = await page.locator('.field .digger').last().boundingBox();
  await page.mouse.move(pick.x + pick.width / 2, pick.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(pick.x + pick.width / 2 + i * 25, pick.y + 20 - i * 30);
    await page.waitForTimeout(20);
  }
  const up = await page.locator('.field .digger').last().boundingBox();
  check('a skeleton can be picked up and carried', !!(await page.$('.field .digger.is-held')) &&
    up.y < pick.y - 150 && up.x > pick.x + 150, JSON.stringify([pick, up]));
  check('and while it is held, the reaper cannot be aimed at it', (await page.evaluate((p) => window.__reaper.crypt.diggerAt(p), { x: up.x + up.width / 2, y: up.y + 20 })) === -1);
  await page.mouse.up();
  await page.waitForTimeout(800);
  const landed = await page.locator('.field .digger').last().boundingBox();
  check('let go, it falls back to the ground where it was dropped, and digs', Math.abs(landed.y + landed.height - 800) < 2 &&
    Math.abs((landed.x + landed.width / 2) - (up.x + up.width / 2)) < 15 && !(await page.$('.digger.is-held')), JSON.stringify([up, landed]));
  // Stirred until it is not walking (a walker is never startled), then he comes
  // near where it is right now.
  await page.evaluate(() => {
    const crypt = window.__reaper.crypt;
    for (let i = 0; i < 4 && document.querySelector('.field .digger').classList.contains('is-walking'); i++) crypt.stir();
    const r = document.querySelector('.field .digger').getBoundingClientRect();
    crypt.near({ x: r.left + r.width / 2, y: r.top }, true);
  });
  check('one hops when he comes near', (await page.$$('.field .digger.is-startled')).length >= 1);

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
  await page.click('#card .chip >> text="1 min"');
  const sentAt = Date.now();
  await page.click('#card .chip:has-text("Send")');
  const ravens = await page.evaluate(() => window.__companion.read().ravens);
  check('a raven is scheduled and saved', ravens.length === 1 && ravens[0].text === 'Feed the cat');
  check('a raven can be sent for one minute', Math.abs(ravens[0].at - sentAt - 60000) < 2000, String(ravens[0].at - sentAt));
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
  out = await tool('cast', { ability: 'hum' });
  check('cast runs an ability', out.ok && await page.evaluate(() => window.__reaper.abilities.byId.hum.active()));
  await page.evaluate(() => window.__reaper.abilities.cast('hum'));
  out = await tool('cast', { ability: 'speak' });
  check('cast refuses abilities outside its list', out.ok === false);
  out = await tool('get_harvest', {});
  check('get_harvest reports the day', out.ok && 'activeMinutes' in out.result && out.result.hourglassMinutesLeft === 25);

  // Speak card: a new user is offered the free mind, not asked for a key
  page = await open({ wander: false });
  await castFromRing(page, 'speak');
  check('Speak opens its card', await visible(page, '#card textarea'));
  await page.waitForTimeout(150);
  check('it offers the free mind\'s download, and asks for no key', await page.isVisible('#card .chip:has-text("Download")') &&
    !(await visible(page, '#card input[type=password]')) && (await page.textContent('#card')).includes('2.3 GB'), await page.textContent('#card'));
  await page.fill('#card textarea', 'hello');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check('the question shows in the card', (await page.textContent('.line.you')) === 'hello');
  check('the free mind\'s offer has no key button', !(await page.isVisible('#card .chip:has-text("Use a key")')));
  // The download, with its progress.
  const seenProgress = page.evaluate(() => new Promise((resolve) => {
    const widths = [];
    const look = setInterval(() => {
      const fill = document.querySelector('#card .progress span');
      if (fill) widths.push(fill.style.width);
      if (window.__companion.free && window.__companion.free.installed) { clearInterval(look); resolve(widths); }
    }, 10);
  }));
  await page.click('#card .chip:has-text("Download")');
  const widths = await seenProgress;
  await page.waitForTimeout(150);
  check('the download shows its progress', widths.some((w) => w !== '0.0%' && w !== '100.0%'), widths.join(' '));
  check('when it is done he is ready to talk', (await page.textContent('.log')).includes('his mind is here') &&
    !(await page.isVisible('#card .chip:has-text("Download")')));
  // A mind that would not wake offers the other ways.
  await page.evaluate(() => window.__companion.emit('speech', { type: 'error', code: 'free', message: 'My free mind would not wake.' }));
  await page.waitForTimeout(100);
  check('trouble with the free mind is shown', (await page.textContent('.log')).includes('would not wake'));
  // Ollama, for those who run it, from the tray menu (Mind).
  await page.evaluate(() => window.__reaper.speak.close());
  await page.evaluate(async () => {
    const { companion } = await import('./bridge.js');
    window.__companion.local = { running: false, models: [], using: null };
    await companion.brain({ kind: 'ollama' });
  });
  await page.evaluate(() => window.__companion.emit('speech', { type: 'error', code: 'local', message: 'Ollama is not running.' }));
  await page.evaluate(() => window.__reaper.speak.open());
  await page.waitForTimeout(150);
  check('trouble with Ollama offers the other ways', await page.isVisible('#card .chip:has-text("Commands only")'));
  await page.click('#card .chip:has-text("Commands only")');
  await page.waitForTimeout(150);
  check('he can go without a mind', (await page.textContent('.log')).includes('no mind borrowed') &&
    (await page.evaluate(() => window.__companion.read().brain)) === 'offline');
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
  const lines = await page.$$eval('.log .line:not(.oops)', (l) => l.map((x) => x.className.replace('line ', '') + ':' + x.firstChild.textContent));
  const tail = lines.slice(-4).join(' | ');
  check('his answer streams in, with the spell between his words',
    tail === 'you:remind me | him:As you wish. | cast:✦ sends a raven | him:Done.', tail);

  // The Crypt: deeds bank souls, souls raise skeletons, skeletons dig
  page = await open({ wander: false });
  const banked = () => page.textContent('#card .crypt-souls');
  await page.evaluate(() => window.__reaper.abilities.cast('crypt'));
  check('the Garden opens empty', (await banked()) === '0 souls' && await page.isDisabled('#card .chip.solid'));
  await page.evaluate(async () => {
    const { companion } = await import('./bridge.js');
    companion.stat('caught', 12);
    companion.stat('reaped', 2);
    companion.stat('focus', 1, 25);
  });
  await page.waitForTimeout(100);
  // 12 ghosts, 2 files (10) and 25 minutes, plus two first-time milestones (10 and 15).
  check('ghosts, files and a finished hourglass bank souls', (await banked()) === '72 souls', await banked());
  await page.waitForTimeout(1300);
  check('a milestone is announced', /Milestone: .*First sand/.test(await page.textContent('#bubble')), await page.textContent('#bubble'));
  await page.click('#card .chip.solid');
  await page.waitForTimeout(200);
  check('souls raise a skeleton', (await banked()) === '57 souls' &&
    (await page.textContent('#card')).includes('One worker gathers 1.5 souls an hour'), await page.textContent('#card'));
  check('the moss sprite works on screen', (await page.$$('.field .digger')).length === 1);
  // It wanders, so follow it with the cursor till it fades (or a second passes).
  const isFaded = () => page.$eval('.field .digger', (n) => n.classList.contains('is-faded'));
  let fadedOver = false, bones;
  for (let i = 0; i < 20 && !fadedOver; i++) {
    bones = await page.locator('.field .digger').boundingBox();
    await page.mouse.move(bones.x + bones.width / 2, bones.y + bones.height / 2);
    await page.waitForTimeout(50);
    fadedOver = await isFaded();
  }
  await page.mouse.move(bones.x + bones.width / 2, Math.max(5, bones.y - 160));
  let fadedAway = true;
  for (let i = 0; i < 20 && fadedAway; i++) { await page.waitForTimeout(50); fadedAway = await isFaded(); }
  check('a skeleton fades while the cursor is over it, and comes back after', fadedOver && !fadedAway);
  check('the next one costs more', (await page.textContent('#card .chip.solid')).includes('32'));
  check('the other workers wait for a rank',
    await page.isDisabled('#card .chip[data-kind="snail"]') && await page.isDisabled('#card .chip[data-kind="bee"]') &&
    await page.isDisabled('#card .chip[data-kind="ladybug"]') &&
    (await page.textContent('#card .crypt-kinds')).includes('Opens at Ghost catcher'));

  // Upgrades
  await page.evaluate(async () => (await import('./bridge.js')).companion.stat('focus', 1, 50));
  await page.click('#card .chip[data-tab="upgrades"]');
  check('the upgrades are listed with prices', (await page.$$('#card .crypt-item')).length === 4 &&
    (await page.textContent('#card .crypt-item')).includes('Green thumbs 0/10') && (await page.textContent('#card .crypt-item .chip')) === '60');
  await page.click('#card .crypt-item .chip');
  await page.waitForTimeout(200);
  // 57 + 50 minutes + 50 (a 50-minute hourglass) - 60 + 20 (the first upgrade).
  check('souls buy an upgrade', (await banked()) === '117 souls' && (await page.textContent('#card .crypt-item')).includes('Green thumbs 1/10') &&
    (await page.evaluate(() => window.__reaper.crypt.get().perHour)) === 1.9, await banked());
  check('what he cannot afford cannot be clicked', await page.isDisabled('#card .crypt-item:nth-child(3) .chip'));
  await page.click('#card .chip[data-tab="milestones"]');
  check('milestones show what is reached and what is ahead', (await page.textContent('#card .crypt-page')).includes('5 of 17 reached') &&
    (await page.$$('#card .crypt-item.is-done')).length === 5 && (await page.$$('#card .crypt-item')).length === 17);

  // Speak's tools for it
  out = await tool('get_crypt', {});
  check('Speak can count the crypt', out.ok && out.result.souls === 117 && out.result.skeletons === 1 && out.result.nextCost === 32 &&
    out.result.milestonesReached === '5 of 17' && out.result.nextMilestones.length === 3 && out.result.upgrades[0].level === 1, JSON.stringify(out));
  out = await tool('buy_upgrade', { upgrade: 'graves' });
  check('Speak can buy an upgrade', out.ok && out.result.level === 1 && out.result.souls === 27, JSON.stringify(out));
  out = await tool('buy_upgrade', { upgrade: 'lure' });
  check('Speak cannot buy one without the souls', !out.ok && /Not enough souls/.test(out.error), JSON.stringify(out));
  out = await tool('buy_upgrade', { upgrade: 'cheat' });
  check('or one that does not exist', !out.ok && /No such upgrade/.test(out.error), JSON.stringify(out));
  out = await tool('raise_worker', {});
  check('Speak cannot raise a skeleton without the souls', !out.ok && /Not enough souls/.test(out.error), JSON.stringify(out));
  // Speak and the dragon.
  out = await tool('dragon', { action: 'status' });
  check('Speak knows when there is no dragon yet', out.ok && /egg to take/.test(out.result.dragon), JSON.stringify(out));
  out = await tool('cast', { ability: 'dragonbreath' });
  check('Dragonbreath needs a dragon', !out.ok && /no dragon/i.test(out.error), JSON.stringify(out));
  out = await tool('dragon', { action: 'adopt' });
  check('Speak can take the egg when asked', out.ok && out.result.stage === 'egg', JSON.stringify(out));
  out = await tool('dragon', { action: 'status' });
  check('and tell how it is', out.ok && out.result.stage === 'egg' && typeof out.result.warmth === 'number' && Array.isArray(out.result.perks), JSON.stringify(out).slice(0, 200));
  out = await tool('dragon', { action: 'feed', souls: 5000 });
  check('a silly feeding is refused', !out.ok);
  out = await tool('dragon', { action: 'train', kind: 'hunt' });
  check('an egg cannot be trained, and Speak says why', !out.ok && /hatched/.test(out.error), JSON.stringify(out));
  await page.evaluate(() => window.__companion.emit('settings', { minions: false }));
  check('skeletons can be kept off the screen', (await page.$$('.field .digger')).length === 0);
  // Shut for two hours with one skeleton and sharper shovels: 3.75 souls, told on the way in.
  await page.evaluate(() => {
    const saved = window.__companion.read();
    saved.crypt.at -= 2 * 3600000;
    localStorage.setItem('reaper-companion', JSON.stringify({ ...saved, greeted: new Date().toDateString() }));
  });
  await page.reload();
  await page.waitForSelector('#body');
  await page.waitForTimeout(1900);
  check('he says what was dug while the app was shut', (await page.textContent('#bubble')).includes('The garden gathered 3 souls'), await page.textContent('#bubble'));
  check('and it is in the crypt, with the upgrades kept', (await page.evaluate(() => window.__reaper.crypt.get().souls)) === 30 &&
    (await page.evaluate(() => window.__reaper.crypt.get().awayCapHours)) === 12);
  // Back from being away
  await page.evaluate(() => {
    window.__companion.emit('away', { away: true });
    window.__companion.emit('away', { away: false, minutes: 90, dug: 9 });
  });
  await page.waitForTimeout(100);
  const back = await page.textContent('#bubble');
  check('coming back reports the dig', back.includes('Gone') && back.includes('The garden gathered 9 souls'), back);

  // The other kinds, at a rank that opens them
  {
    // A sprite, and a moth that has already turned; the rest raised from the card.
    page = await open({ wander: false, muted: true, crypt: { souls: 5000, skeletons: 2, born: [Date.now() - 3600000, Date.now() - 4 * 3600000],
      kinds: ['digger', 'moth'], rank: 4, score: 3000, total: 0, at: Date.now() } });
    await page.evaluate(() => window.__reaper.abilities.cast('crypt'));
    for (const kind of ['snail', 'frog', 'bee', 'robin', 'ladybug', 'wisp']) {
      await page.click('#card .chip[data-kind="' + kind + '"]');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
    const look = await page.evaluate(() => {
      const bg = (sel) => { const n = document.querySelector(sel); return n ? getComputedStyle(n).backgroundImage : ''; };
      return { sprite: bg('.field .digger.is-digger'), sprout: bg('.field .digger.is-digger .sprout'), snail: bg('.field .digger.is-snail'),
        snailBloom: bg('.field .digger.is-snail .bloom'), frog: bg('.field .digger.is-frog'), frogBloom: bg('.field .digger.is-frog .bloom'),
        robin: bg('.field .digger.is-robin'), ladybug: bg('.field .digger.is-ladybug'), bee: bg('.field .bee'), moth: bg('.field .moth'), wisp: bg('.field .wisp-worker') };
    });
    check('each worker comes as its own creature', Object.entries({ sprite: 'sprite', sprout: 'sprout', snail: 'snail', snailBloom: 'bloom', frog: 'frog',
      frogBloom: 'bloom', robin: 'robin', ladybug: 'ladybug', bee: 'bee', moth: 'moth', wisp: 'wisp' }).every(([k, file]) => new RegExp(file + '\\.png').test(look[k])),
    JSON.stringify(look));
    check('a flying moth shows one of its own frames', await page.evaluate(async () => {
      const b = document.querySelector('.field .moth');
      b.classList.add('is-flying');
      const seen = new Set();
      for (let i = 0; i < 12; i++) { seen.add(getComputedStyle(b).backgroundPositionX); await new Promise((r) => setTimeout(r, 37)); }
      return [...seen].every((x) => ['0px', '-56px', '-112px', '-168px'].includes(x));
    }));
    check('the snail works across its own whole sheet', (await page.$eval('.field .digger.is-snail', (n) => getComputedStyle(n).getPropertyValue('--sheet-w').trim())) === '224px');
    // One sprite, a snail at twice, a frog at half as much again; the rest gather nothing.
    check('snails and frogs gather more; the helpers nothing', (await page.evaluate(() => window.__reaper.crypt.get().perHour)) === 6.8,
      String(await page.evaluate(() => window.__reaper.crypt.get().perHour)));
    const g = await page.locator('.field .digger.is-snail').boundingBox();
    check('a snail can be aimed at for reaping', (await page.evaluate((p) => {
      const i = window.__reaper.crypt.diggerAt(p);
      return i >= 0 ? window.__reaper.crypt.get().bones[i].kind : null;
    }, { x: g.x + g.width / 2, y: g.y + 10 })) === 'snail');
    // The bee flies to a worker and pollinates it: a ghost on the spot.
    let pollinated = false;
    for (let i = 0; i < 12 && !pollinated; i++) {
      await page.waitForTimeout(500);
      pollinated = await page.evaluate(() => Object.keys((window.__companion.read().crypt || {}).boosts || {}).length > 0);
    }
    check('a bee pollinates a worker, which grows a ghost', pollinated);
    const rb = await page.locator('.field .digger.is-robin').boundingBox();
    check('a robin cannot', (await page.evaluate((p) => window.__reaper.crypt.diggerAt(p), { x: rb.x + rb.width / 2, y: rb.y + 10 })) === -1);

    // A moth can be picked up and put somewhere else.
    await page.evaluate(() => { const m = document.querySelector('.field .moth'); m.style.transitionDuration = '0s'; m.style.left = '600px'; m.style.top = '200px'; });
    await page.waitForTimeout(50);
    const mb = await page.locator('.field .moth').boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(mb.x + mb.width / 2 - i * 40, mb.y + mb.height / 2 + i * 30); await page.waitForTimeout(20); }
    const held = await page.locator('.field .moth').boundingBox();
    check('a moth can be picked up and carried', !!(await page.$('.field .moth.is-held')) && held.x < mb.x - 150 && held.y > mb.y + 120, JSON.stringify([mb, held]));
    await page.mouse.up();
    await page.waitForTimeout(100);
    check('let go, it flies on', !(await page.$('.field .moth.is-held')) && !!(await page.$('.field .moth.is-flying')));

    // In a hunt, a moth takes ghosts that would get away (one that is about, not a cocoon).
    const skeletonAt = await page.evaluate(() => window.__reaper.crypt.get().bones.findIndex((b) => b.kind === 'digger'));
    const caughtBefore = await page.evaluate(() => window.__companion.read().crypt.deeds.caught);
    await page.evaluate((i) => window.__reaper.abilities.reapAt(i), skeletonAt);
    // Until the hunt has run out (and the moth has been).
    await page.waitForTimeout(1000);
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__reaper.abilities.hunting)); i++) await page.waitForTimeout(500);
    await page.waitForTimeout(600);
    const batted = await page.evaluate(() => window.__reaper.crypt.get());
    // Nobody clicks: every ghost would get away, but the moth takes two (10 points each, no combo).
    // (Counted as ghosts, not points: a ladybug makes a spirit-light, worth three, likelier.)
    const caughtAfter = await page.evaluate(() => window.__companion.read().crypt.deeds.caught);
    check('when the hunt runs out, the moth catches two ghosts getting away', caughtAfter - caughtBefore === 2 && !(await page.$('.ghost:not(.is-caught)')), JSON.stringify({ score: batted.score, bubble: await page.textContent('#bubble') }));
    // Dropped on a moth, he reaps it: two spirit-lights, and a cocoon at the top.
    await page.evaluate(() => { const m = document.querySelector('.field .moth'); m.style.transitionDuration = '0s'; m.style.left = '300px'; m.style.top = '6px'; });
    await page.waitForTimeout(50);
    const mothAt = await page.evaluate(() => window.__reaper.crypt.diggerAt({ x: -999, y: -999 }, { left: 290, top: 0, right: 382, bottom: 114 }));
    check('his figure touching a moth aims at it', mothAt >= 0 && (await page.evaluate((i) => window.__reaper.crypt.get().bones[i].kind, mothAt)) === 'moth');
    await page.evaluate((i) => window.__reaper.abilities.reapAt(i), mothAt);
    await page.waitForTimeout(400);
    check('a reaped moth gives two spirit-lights', (await page.$$('.ghost.is-golden:not(.is-caught)')).length === 2 && (await page.$$('.ghost:not(.is-caught)')).length === 2,
      String((await page.$$('.ghost')).length));
    check('and rests as a cocoon at the top', (await page.$$('.field .cocoon')).length === 1 && !(await page.$('.field .moth')));
    await castFromRing(page, 'slash');
    await page.waitForTimeout(1800);
  }

  // The dragon: an egg to take and warm; it hatches, grows, trains, and ascends.
  page = await open({ wander: false, muted: true, crypt: { souls: 2000, skeletons: 0, total: 0, at: Date.now() } });
  await castFromRing(page, 'dragon');
  await page.waitForTimeout(150);
  check('the Dragon card offers an egg', (await page.textContent('#card')).includes('Take the egg'));
  await page.click('#card .chip:has-text("Take the egg")');
  await page.waitForTimeout(300);
  check('taken, the egg sits in the garden', !!(await page.$('.field .dragon.is-egg')) && (await page.textContent('#card')).includes('Warmth'));
  const eggBox = await page.locator('.field .dragon').boundingBox();
  await page.mouse.click(eggBox.x + eggBox.width / 2, eggBox.y + eggBox.height / 2);
  await page.waitForTimeout(300);
  check('clicking it warms it', (await page.evaluate(() => window.__reaper.dragon.get().warmth)) === 3);
  // Warm enough (as if hours had passed): it hatches.
  await page.evaluate(() => {
    const saved = window.__companion.read();
    saved.crypt.dragon.warmth = 99.5;
    saved.crypt.dragon.at = Date.now() - 3600000;
    localStorage.setItem('reaper-companion', JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForSelector('#body');
  await page.waitForTimeout(400);
  await page.evaluate(async () => { const { companion } = await import('./bridge.js'); const o = await companion.crypt({}); window.__reaper.crypt.update(o.crypt); });
  await page.waitForTimeout(400);
  check('warm enough, it hatches', (await page.evaluate(() => window.__reaper.dragon.get().stage)) === 'hatchling' && !!(await page.$('.field .dragon.is-hatchling')),
    await page.evaluate(() => JSON.stringify(window.__reaper.dragon.get())));
  check('the hatchling shows its own picture', /dragon-hatchling-[a-z]+\.png/.test(await page.$eval('.field .dragon', (n) => n.style.backgroundImage)));
  await page.evaluate(() => window.__reaper.dragon.open());
  await page.waitForTimeout(150);
  check('the card shows how hungry it is', /Hunger/.test(await page.textContent('#card')));
  await page.click('#card .chip[data-feed="bite"]');
  await page.waitForTimeout(250);
  check('fed a bite, it grows', (await page.evaluate(() => window.__reaper.dragon.get().xp)) > 0 && (await page.evaluate(() => window.__reaper.crypt.get().souls)) < 2000);
  await page.click('#card .chip[data-feed="fill"]');
  await page.waitForTimeout(250);
  check('filled up, it is full till tomorrow, and offers no more', /full till tomorrow/i.test(await page.textContent('#card')) &&
    !(await page.$('#card .chip[data-feed="bite"]')), await page.textContent('#card'));
  check('the card is small: no scrolling to reach training', await page.$eval('#card', (n) => n.scrollHeight <= n.clientHeight + 1 && n.getBoundingClientRect().height < 320));
  // Training starts its drill (a flight lesson); left alone, it still learns a little.
  await page.click('#card .chip[data-train="garden"]');
  check('training starts a drill', !!(await page.waitForSelector('.drill-ring', { timeout: 2000 }).catch(() => null)));
  await page.waitForTimeout(11800);
  check('trained, it learns, and tires', (await page.evaluate(() => window.__reaper.dragon.get().train.garden)) === 1 &&
    (await page.evaluate(() => window.__reaper.dragon.get().energy)) === 75);
  // Its favourite food: a snail from the garden.
  await page.evaluate(() => {
    const saved = window.__companion.read();
    Object.assign(saved.crypt, { skeletons: 1, born: [Date.now() - 3600000], kinds: ['snail'], rank: 1 });
    localStorage.setItem('reaper-companion', JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForSelector('#body');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__reaper.dragon.open());
  await page.waitForTimeout(150);
  const xpSnail = await page.evaluate(() => window.__reaper.dragon.get().xp);
  check('with a snail in the garden, the card offers its favourite', !!(await page.$('#card .chip[data-feed="snail"]')));
  await page.click('#card .chip[data-feed="snail"]');
  await page.waitForTimeout(300);
  check('it eats the snail, and grows', (await page.evaluate(() => window.__reaper.dragon.get().xp)) > xpSnail &&
    !(await page.$('.field .digger.is-snail')) && !(await page.$('#card .chip[data-feed="snail"]')));

  // An elder with a strong bond ascends: scales, and an egg of a new element.
  await page.evaluate(() => {
    const saved = window.__companion.read();
    Object.assign(saved.crypt.dragon, { stage: 4, xp: 5000, bond: 90, branch: 'hunter' });
    localStorage.setItem('reaper-companion', JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForSelector('#body');
  await page.waitForTimeout(400);
  const wasElement = await page.evaluate(() => window.__reaper.dragon.get().element);
  check('an elder is drawn as one', !!(await page.$('.field .dragon.is-elder')));
  await page.evaluate(() => window.__reaper.dragon.open());
  await page.waitForTimeout(150);
  check('ascension and perks are on their own tab', !(await page.$('#card .chip[data-perk]')));
  await page.click('#card .chip[data-tab="ascend"]');
  await page.waitForTimeout(150);
  await page.click('#card .chip:has-text("Ascend ·")');
  await page.waitForTimeout(300);
  const ascended = await page.evaluate(() => window.__reaper.dragon.get());
  check('it ascends: an egg of a new element, a lineage higher, and scales kept', ascended.stage === 'egg' && ascended.element !== wasElement &&
    ascended.lineage === 1 && ascended.scales >= 10, JSON.stringify(ascended));
  await page.click('#card .chip[data-perk="power"]');
  await page.waitForTimeout(250);
  check('scales buy a perk', (await page.evaluate(() => window.__reaper.dragon.get().perks.find((p) => p.id === 'power').level)) === 1);
  // Training you play: target practice, a flight lesson, fetch.
  page = await open({ wander: false, muted: true, crypt: { souls: 0, skeletons: 0, total: 0, at: Date.now(),
    dragon: { element: 'storm', stage: 2, xp: 150, bond: 50, energy: 100, lineage: 0, scales: 0, at: Date.now(), caredAt: Date.now() } } });
  const xpStart = await page.evaluate(() => window.__reaper.dragon.get().xp);
  const practice = page.evaluate(() => window.__reaper.dragon.drill('hunt'));
  for (let i = 0; i < 30; i++) {
    const orb = await page.$('.drill-orb:not(.is-popped)');
    if (orb) { const b = await orb.boundingBox(); if (b) await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }
    await page.waitForTimeout(300);
  }
  const shot = await practice;
  const afterHunt = await page.evaluate(() => window.__reaper.dragon.get());
  check('target practice: click the lights, and how well it went is how much it learns', shot.ok && shot.quality >= 0.5 &&
    afterHunt.train.hunt === 1 && afterHunt.xp - xpStart >= 20, JSON.stringify({ q: shot.quality, xp: afterHunt.xp - xpStart }));
  const lesson = page.evaluate(() => window.__reaper.dragon.drill('garden'));
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    const ring = await page.$('.drill-ring:not(.is-passed)');
    if (!ring) break;
    const b = await ring.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
  }
  const flown = await lesson;
  check('a flight lesson: it follows the cursor through the rings', flown.ok && flown.quality >= 0.75, JSON.stringify(flown).slice(0, 120));
  const fetching = page.evaluate(() => window.__reaper.dragon.drill('tricks'));
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(700);
    const ball = await page.$('.drill-ball');
    if (!ball) break;
    const b = await ball.boundingBox();
    await page.mouse.move(b.x + 12, b.y + 12);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) { await page.mouse.move(b.x + 12 - i * 60, b.y + 12 - i * 20); await page.waitForTimeout(16); }
    await page.mouse.up();
    await page.waitForTimeout(1600);
  }
  const fetched = await fetching;
  check('fetch: throw the ball and it brings it back; three throws', fetched.ok && fetched.quality > 0.2 &&
    (await page.evaluate(() => window.__reaper.dragon.get().train.tricks)) === 1, JSON.stringify(fetched).slice(0, 120));
  check('three drills tire it', (await page.evaluate(() => window.__reaper.dragon.get().energy)) === 25);
  // Dragonbreath: a storm drake breathes lightning across the screen.
  const bolts = page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const seen = new MutationObserver((list) => {
      for (const m of list) for (const a of m.addedNodes) if (a.classList && a.classList.contains('breath-bolt')) n++;
    });
    seen.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { seen.disconnect(); resolve(n); }, 900);
  }));
  const breathed = await page.evaluate(() => window.__reaper.abilities.cast('dragonbreath'));
  check('Dragonbreath: a storm dragon breathes lightning across the screen', breathed.ok !== false && (await bolts) >= 3, JSON.stringify(breathed));

  // A hunter breathes on ghosts in a hunt.
  page = await open({ wander: false, muted: true, crypt: { souls: 0, skeletons: 1, born: [Date.now() - 5 * 3600000], total: 0, at: Date.now(),
    dragon: { element: 'ember', stage: 3, xp: 500, bond: 80, energy: 100, branch: 'hunter', lineage: 0, scales: 0, at: Date.now(), caredAt: Date.now() } } });
  // Caught ghosts leave the page a moment later, so count the catches as they happen.
  await page.evaluate(() => {
    window.__breathed = 0;
    new MutationObserver((ms) => { for (const m of ms) if (m.target.classList && m.target.classList.contains('is-caught') && m.oldValue && !m.oldValue.includes('is-caught')) window.__breathed++; })
      .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
  await page.evaluate(() => window.__reaper.abilities.reapAt(0));
  await page.waitForTimeout(3600);
  check('a hunter dragon breathes on ghosts and catches them', (await page.evaluate(() => window.__breathed)) >= 1 && (await page.$$('.dragon-breath')).length >= 0,
    String(await page.evaluate(() => window.__breathed)));

  // A moth starts as a caterpillar on the ground, then hangs as a cocoon.
  page = await open({ wander: false, muted: true, crypt: { souls: 0, skeletons: 2, born: [Date.now() + 2 * 3600000, Date.now() + 10 * 60000],
    kinds: ['moth', 'moth'], rank: 2, total: 0, at: Date.now() } });
  check('a young moth is a caterpillar on the ground, an older one a cocoon', (await page.$$('.field .digger.is-caterpillar')).length === 1 &&
    (await page.$$('.field .cocoon')).length === 1 && !(await page.$('.field .moth')));

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

  check('no errors along the way', page.errors.length === 0, page.errors.join('; '));

  // Speak's new tools: Look and the clipboard ask first.
  page = await open({ wander: false });
  const toolCall = (name, input) => page.evaluate(([n, i]) => {
    window.__toolOut = undefined;
    const id = String(Math.random());
    const off = window.__companion.on('tool-result', (r) => { if (r.id === id) { off(); window.__toolOut = r.outcome; } });
    window.__companion.emit('tool-call', { id, name: n, input: i });
  }, [name, input]);
  const toolOut = async () => {
    for (let i = 0; i < 40; i++) {
      const out = await page.evaluate(() => window.__toolOut);
      if (out) return out;
      await page.waitForTimeout(50);
    }
    return null;
  };
  await page.evaluate(() => { window.__companion.shot = 'data:image/jpeg;base64,AAAA'; window.__companion.clipboard = 'secret plans'; });
  await toolCall('look_at_screen', {});
  await page.waitForTimeout(150);
  check('Look asks before it looks', await visible(page, '.ask') && (await page.textContent('.ask')).includes('screen'));
  await page.click('.ask .chip:has-text("Not now")');
  let outcome = await toolOut();
  check('declining Look sends nothing', outcome && outcome.ok === false && !outcome.image);
  await toolCall('look_at_screen', {});
  await page.waitForTimeout(150);
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('allowing Look sends the picture', outcome && outcome.ok && outcome.image === 'data:image/jpeg;base64,AAAA');
  await toolCall('read_clipboard', {});
  await page.waitForTimeout(150);
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('allowing the clipboard reads it', outcome && outcome.ok && outcome.result.text === 'secret plans');
  await toolCall('copy_to_clipboard', { text: 'a draft' });
  outcome = await toolOut();
  check('copy_to_clipboard copies', outcome && outcome.ok && (await page.evaluate(() => window.__companion.clipboard)) === 'a draft');
  // The web reads freely; opening anything or looking through files asks first.
  await toolCall('web_search', { query: 'grim reaper' });
  outcome = await toolOut();
  check('web_search answers without asking', outcome && outcome.ok && outcome.result.results.length === 1 && !(await page.$('.ask:not(.is-answered)')));
  await toolCall('read_webpage', { url: 'https://example.com/' });
  outcome = await toolOut();
  check('read_webpage reads a page', outcome && outcome.ok && outcome.result.text.includes('example.com'));
  await toolCall('open_app', { name: 'Spotify' });
  await page.waitForTimeout(150);
  check('open_app asks first', (await page.textContent('.ask:not(.is-answered)')).includes('Open Spotify?'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Not now")');
  outcome = await toolOut();
  check('declined, nothing opens', outcome && !outcome.ok && !(await page.evaluate(() => window.__companion.opened || [])).length);
  await toolCall('open_app', { name: 'Spotify' });
  await page.waitForTimeout(150);
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('allowed, the app opens', outcome && outcome.ok && (await page.evaluate(() => window.__companion.opened)).includes('app:Spotify'));
  await toolCall('open_url', { url: 'https://example.com/a' });
  await page.waitForTimeout(150);
  check('open_url asks first, naming the site', (await page.textContent('.ask:not(.is-answered)')).includes('example.com/a'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('and opens it', outcome && outcome.ok && (await page.evaluate(() => window.__companion.opened)).includes('https://example.com/a'));
  await toolCall('open_url', { url: 'file:///etc/passwd' });
  outcome = await toolOut();
  check('open_url takes only web addresses', outcome && !outcome.ok);
  await toolCall('find_files', { query: 'resume' });
  await page.waitForTimeout(150);
  check('find_files asks first', (await page.textContent('.ask:not(.is-answered)')).includes('resume'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('and lists what it found', outcome && outcome.ok && outcome.result.files[0].path === '~/Documents/resume.txt');
  await toolCall('open_file', { path: '~/Documents/resume.txt', reveal: true });
  await page.waitForTimeout(150);
  check('open_file asks first', (await page.textContent('.ask:not(.is-answered)')).includes('Show resume.txt in Finder?'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('and shows it', outcome && outcome.ok && (await page.evaluate(() => window.__companion.opened)).includes('show:~/Documents/resume.txt'));

  await toolCall('github_read', { what: 'prs' });
  outcome = await toolOut();
  check('GitHub reads without asking', outcome && outcome.ok && outcome.result.pullRequests[0].number === 7 && !(await page.$('.ask:not(.is-answered)')));
  await toolCall('github_act', { action: 'merge_pr', number: 7 });
  await page.waitForTimeout(150);
  check('changing GitHub asks first, in so many words', (await page.textContent('.ask:not(.is-answered)')).includes('merge_pr #7'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Not now")');
  outcome = await toolOut();
  check('declined, GitHub is left alone', outcome && !outcome.ok && !(await page.evaluate(() => (window.__companion.github || { done: [] }).done.length)));
  await toolCall('github_act', { action: 'delete_repo' });
  outcome = await toolOut();
  check('and what it cannot do is not even asked', outcome && !outcome.ok && !(await page.$('.ask:not(.is-answered)')));

  await toolCall('work_on_myself', { request: 'make the ghosts slower' });
  await page.waitForTimeout(150);
  check('working on himself asks first, saying with what', (await page.textContent('.ask:not(.is-answered)')).includes('his own coding mind') &&
    (await page.textContent('.ask:not(.is-answered)')).includes('make the ghosts slower'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Allow")');
  outcome = await toolOut();
  check('allowed, a Terminal opens on his own engine', outcome && outcome.ok && (await page.evaluate(() => window.__companion.selfWork[0].engine)) === 'local');
  await toolCall('work_on_myself', { request: 'add a bone hound', engine: 'claude' });
  await page.waitForTimeout(150);
  check('or with Claude, for a big job', (await page.textContent('.ask:not(.is-answered)')).includes('Claude Code'));
  await page.click('.ask:not(.is-answered) .chip:has-text("Not now")');
  outcome = await toolOut();
  check('declined, nothing opens', outcome && !outcome.ok && (await page.evaluate(() => window.__companion.selfWork.length)) === 1);

  await toolCall('spotify', { action: 'play', query: 'Blue Monday' });
  outcome = await toolOut();
  check('Speak can play a song on Spotify, without asking', outcome && outcome.ok && outcome.result.playing.startsWith('Blue Monday') &&
    (await page.evaluate(() => window.__companion.spotify[0].query)) === 'Blue Monday');
  await toolCall('spotify', { action: 'dance' });
  outcome = await toolOut();
  check('but only what Spotify can do', outcome && !outcome.ok);

  await toolCall('cast', { ability: 'vanish' });
  outcome = await toolOut();
  await page.waitForTimeout(1100);
  check('Speak can cast Vanish', outcome && outcome.ok && (await mode(page)) === 'vanish');

  // A finished reply can be copied.
  await page.evaluate(() => {
    // Vanish (cast above) closed the card; open it again.
    window.__reaper.speak.open();
    const e = (d) => window.__companion.emit('speech', d);
    const box = document.querySelector('#card textarea');
    box.value = 'draft a note';
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    e({ type: 'delta', text: 'Dear living,' });
    e({ type: 'done' });
  });
  await page.click('.line.him .copy', { force: true });
  check('a reply has a copy button that copies it', (await page.evaluate(() => window.__companion.clipboard)) === 'Dear living,');

  // The Hourglass ends with a choice (when no other card is open).
  await page.evaluate(() => window.__reaper.speak.close());
  await page.evaluate(() => window.__reaper.abilities.restore({ hourglass: { ends: Date.now() + 500, total: 25 * 60000 } }));
  await page.waitForTimeout(1600);
  check('a finished Hourglass offers a break', (await page.textContent('#card')).includes('Break 5'));
  await page.click('#card .chip:has-text("Break 5")');
  const glassNow = await page.evaluate(() => window.__companion.read().hourglass);
  check('Break 5 starts a five-minute break', glassNow && glassNow.total === 5 * 60000 && glassNow.rest === true);

  // Low soul, mute, and the day's greeting.
  page = await open({ wander: false, soul: 10, muted: true, ravens: [{ id: 'x', at: Date.now() + 60000, text: 'Soon' }] });
  check('low soul makes him faint', await page.evaluate(() => document.getElementById('reaper').classList.contains('is-faint')));
  await page.waitForTimeout(1500);
  check('the first visit of the day gets a greeting with the ravens', /raven flies today|ravens fly today/.test(await page.textContent('#bubble')) || new Date().getHours() < 5);
  check('the greeting is remembered for the day', (await page.evaluate(() => window.__companion.read().greeted)) === await page.evaluate(() => new Date().toDateString()) || new Date().getHours() < 5);
  await page.evaluate(() => window.__reaper.abilities.cast('hum'));
  check('Hum refuses while muted', (await page.textContent('#bubble')).includes('muted'));
  check('no errors in the new features', page.errors.length === 0, page.errors.join('; '));

  // Fixes from review.
  page = await open({ wander: false, soul: 50, greeted: new Date().toDateString() });
  await toolCallOn(page, 'read_clipboard', {});
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__companion.emit('tool-cancel', { id: 'any' }));
  await page.waitForTimeout(100);
  check('Hush withdraws a waiting permission question', await page.evaluate(() => {
    const q = document.querySelector('.ask');
    return !!q && q.classList.contains('is-answered') && window.__toolOut && window.__toolOut.ok === false;
  }));
  await page.evaluate(() => window.__reaper.speak.close());
  await page.evaluate(() => window.__reaper.speak.open());
  await page.evaluate(() => window.__reaper.abilities.cast('vanish'));
  await page.waitForTimeout(1100);
  check('Vanish closes an open card', (await mode(page)) === 'vanish' && !(await visible(page, '#card')));
  await page.click('#body', { force: true });
  await page.evaluate(() => window.__companion.emit('away', { away: true }));
  await page.click('#body', { force: true });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__companion.emit('away', { away: false, minutes: 30 }));
  check('waking him with a click still counts the time away', (await page.textContent('#bubble')).includes('Gone 30 min') && (await soul(page)) === 100);
  await page.evaluate(() => window.__reaper.speak.open());
  await page.evaluate(() => window.__reaper.abilities.restore({ hourglass: { ends: Date.now() + 300, total: 25 * 60000 } }));
  await page.waitForTimeout(1400);
  check('a finished Hourglass leaves an open Speak card alone', await visible(page, '#card textarea'));
  check('no errors in the fixes', page.errors.length === 0, page.errors.join('; '));

  // Shatter and Glitch, over a small stand-in picture of the "screen".
  page = await open({ wander: false, greeted: new Date().toDateString() });
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = '#3a6';
    g.fillRect(0, 0, 64, 40);
    window.__companion.shot = c.toDataURL('image/png');
  });
  await page.mouse.move(400, 300);
  await page.evaluate(() => window.__reaper.abilities.cast('shatter'));
  await page.waitForTimeout(500);
  check('Shatter draws over the screen', (await page.$$('.fx-canvas')).length === 1);
  check('Shatter costs 25 soul', (await soul(page)) === 75);
  await page.evaluate(() => window.__reaper.abilities.cast('glitch'));
  check('one screen effect at a time', (await page.textContent('#bubble')).includes('One ruin at a time'));
  await page.waitForTimeout(2400);
  check('Shatter cleans up after itself', (await page.$$('.fx-canvas')).length === 0);
  check('Shatter says it mended the screen', (await page.textContent('#bubble')).includes('Mended'));
  await page.evaluate(() => window.__reaper.abilities.cast('glitch'));
  await page.waitForTimeout(500);
  check('Glitch draws over the screen', (await page.$$('.fx-canvas')).length === 1);
  await page.waitForTimeout(1500);
  check('Glitch cleans up after itself', (await page.$$('.fx-canvas')).length === 0);
  await toolCallOn(page, 'cast', { ability: 'shatter' });
  await page.waitForTimeout(200);
  check('Speak can cast Shatter', await page.evaluate(() => !!window.__toolOut && window.__toolOut.ok));
  await page.waitForTimeout(2600);
  check('no errors in Shatter and Glitch', page.errors.length === 0, page.errors.join('; '));

  // Vortex, Burn, Melt and Soul Rip, each start to finish.
  page = await open({ wander: false, soul: 100, greeted: new Date().toDateString() });
  await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = '#36a';
    g.fillRect(0, 0, 64, 40);
    window.__companion.shot = c.toDataURL('image/png');
  });
  await page.mouse.move(500, 300);
  for (const [id, ms, done] of [['vortex', 2900, 'gives it back'], ['burn', 3300, 'Ashes'], ['melt', 2600, 'Set again'], ['soulrip', 2800, 'Delicious']]) {
    await page.evaluate((i) => window.__reaper.abilities.cast(i), id);
    await page.waitForTimeout(600);
    check(id + ' draws over the screen', (await page.$$('.fx-canvas')).length === 1);
    await page.waitForTimeout(ms);
    check(id + ' cleans up after itself', (await page.$$('.fx-canvas')).length === 0);
    const said = await page.textContent('#bubble');
    check(id + ' finishes on the real screen', said.includes(done), said);
  }
  // 95 spent, plus a little regained while they ran.
  check('the four cost 95 soul in all', (await soul(page)) <= 10, String(await soul(page)));
  check('no errors in the new four', page.errors.length === 0, page.errors.join('; '));
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll desktop checks passed');
process.exit(failures ? 1 : 0);
