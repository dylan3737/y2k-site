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
  check('click opens the ring of fourteen abilities', buttons.length === 14, buttons.join(','));
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
  await page.keyboard.press('Escape');
  check('Escape closes the ring', !(await visible(page, '#ring')));

  // Hum toggles
  const humming = () => page.evaluate(() => window.__reaper.abilities.byId.hum.active());
  await castFromRing(page, 'hum');
  check('Hum starts the music box', await humming());
  check('Hum costs 5 soul', (await soul(page)) === 95);
  await castFromRing(page, 'hum');
  check('casting Hum again stops it for free', !(await humming()) && (await soul(page)) >= 95);

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
  // The free minds, offered beside the key form
  await page.click('#card .chip:has-text("Free local model")');
  await page.waitForTimeout(150);
  check('a local mind with no Ollama says how to get it', (await page.textContent('#card')).includes('ollama pull llama3.2') &&
    !(await visible(page, '#card input[type=password]')));
  await page.evaluate(() => { window.__companion.local = { running: true, models: ['llama3.2:latest'], using: 'llama3.2:latest' }; });
  await page.click('#card .chip:has-text("Try again")');
  await page.waitForTimeout(150);
  check('once Ollama answers, he borrows its model', (await page.textContent('.log')).includes('borrowing llama3.2:latest') &&
    (await page.$$('#card .chip:has-text("Try again")')).length === 0);
  await page.evaluate(() => window.__companion.emit('speech', { type: 'error', code: 'local', message: 'Ollama is not running.' }));
  check('trouble with the local mind offers the other ways', await page.isVisible('#card .chip:has-text("Commands only")'));
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
  await page.evaluate(() => window.__reaper.abilities.cast('crypt'));
  check('the Crypt opens empty', (await page.textContent('#card .crypt-souls')) === '0 souls' &&
    await page.isDisabled('#card .chip.solid'));
  await page.evaluate(async () => {
    const { companion } = await import('./bridge.js');
    companion.stat('caught', 12);
    companion.stat('reaped', 2);
    companion.stat('focus', 1, 25);
  });
  await page.waitForTimeout(100);
  check('ghosts, files and a finished hourglass bank souls', (await page.textContent('#card .crypt-souls')) === '47 souls',
    await page.textContent('#card .crypt-souls'));
  await page.click('#card .chip.solid');
  await page.waitForTimeout(200);
  check('souls raise a skeleton', (await page.textContent('#card .crypt-souls')) === '22 souls' &&
    (await page.textContent('#card')).includes('1 skeleton digs up 6 souls an hour'), await page.textContent('#card'));
  check('the skeleton digs on screen', (await page.$$('.field .digger')).length === 1);
  check('the next one costs 25, more than he has', (await page.textContent('#card .chip.solid')).includes('25') && await page.isDisabled('#card .chip.solid'));
  out = await tool('raise_skeleton', {});
  check('Speak cannot raise one without the souls', !out.ok && /Not enough souls/.test(out.error), JSON.stringify(out));
  out = await tool('get_crypt', {});
  check('Speak can count the crypt', out.ok && out.result.souls === 22 && out.result.skeletons === 1 && out.result.nextCost === 25, JSON.stringify(out));
  await page.evaluate(() => window.__companion.emit('settings', { minions: false }));
  check('skeletons can be kept off the screen', (await page.$$('.field .digger')).length === 0);
  // Shut for two hours with one skeleton: twelve souls, told on the way in.
  await page.evaluate(() => {
    const saved = window.__companion.read();
    saved.crypt.at -= 2 * 3600000;
    localStorage.setItem('reaper-companion', JSON.stringify({ ...saved, greeted: new Date().toDateString() }));
  });
  await page.reload();
  await page.waitForSelector('#body');
  await page.waitForTimeout(1900);
  check('he says what was dug while the app was shut', (await page.textContent('#bubble')).includes('The skeletons dug up 12 souls'), await page.textContent('#bubble'));
  check('and it is in the crypt', (await page.evaluate(() => window.__reaper.crypt.get().souls)) === 34);
  // Back from being away
  await page.evaluate(() => {
    window.__companion.emit('away', { away: true });
    window.__companion.emit('away', { away: false, minutes: 90, dug: 9 });
  });
  await page.waitForTimeout(100);
  const back = await page.textContent('#bubble');
  check('coming back reports the dig', back.includes('Gone') && back.includes('The skeletons dug up 9 souls'), back);

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
