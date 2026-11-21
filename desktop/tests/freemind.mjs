// The free mind with a real model: in plain Node through the oracle, and inside
// the Electron app. Needs the model file, so it is skipped unless given one:
//   REAPER_FREE_MODEL=/path/to/Qwen3.5-2B-Q4_K_M.gguf xvfb-run -a node tests/freemind.mjs
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createFreeMind, MODEL } from '../freemind.js';
import { createOracle, SYSTEM, SMALL_MODEL_NOTE, TOOL_DEFS, FREE_TOOLS_EXCLUDE } from '../oracle.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

const given = process.env.REAPER_FREE_MODEL;
if (!given || !fs.existsSync(given)) {
  console.log('SKIP  the free mind with a real model (set REAPER_FREE_MODEL to ' + MODEL.file + ')');
  process.exit(0);
}
// A models folder holding the given file under the name the app expects.
const dir = fs.mkdtempSync(path.join(tmpdir(), 'reaper-models-'));
fs.symlinkSync(path.resolve(given), path.join(dir, MODEL.file));

// --- In Node, through the oracle ---------------------------------------------------
const calls = [];
const notes = [];
const memory = { list: () => notes, add(text) { const n = { id: 'm' + notes.length, text }; notes.push(n); return n; }, remove: () => false };
const freeMind = createFreeMind({ dir, system: SYSTEM + SMALL_MODEL_NOTE, tools: TOOL_DEFS.filter((t) => !FREE_TOOLS_EXCLUDE.includes(t.name)) });
const oracle = createOracle({
  getKey: () => null, getBrain: () => ({ kind: 'free', model: null }), memory, freeMind,
  runTool: async (name, input) => { calls.push({ name, input }); return { ok: true, result: name === 'send_raven' ? { id: 'r1', due: '2:20 PM' } : 'cast' }; }
});
const ask = (text) => new Promise((resolve) => {
  const events = [];
  oracle.ask(text, (e) => { events.push(e); if (e.type === 'done' || e.type === 'error') resolve(events); });
});
const words = (events) => events.filter((e) => e.type === 'delta').map((e) => e.text).join('');

try {
  check('the model counts as downloaded', freeMind.status().installed);
  let t = performance.now();
  let events = await ask('remind me in 20 minutes to check the oven');
  const first = ((performance.now() - t) / 1000).toFixed(1);
  check('it sends a raven, with the right time', calls.some((c) => c.name === 'send_raven' && c.input.minutes === 20 && /oven/i.test(c.input.text)) &&
    events.at(-1).type === 'done', JSON.stringify(calls) + ' in ' + first + ' s, loading included');
  check('the page hears about the spell', events.some((e) => e.type === 'tool' && e.name === 'send_raven'));
  check('and he says something after it', words(events).trim().length > 0, words(events).slice(0, 100));
  t = performance.now();
  events = await ask('what is 17 times 23? Just the number.');
  check('it answers a plain question, with no spell', /391/.test(words(events)) && calls.length === 1,
    words(events).slice(0, 80) + ' in ' + ((performance.now() - t) / 1000).toFixed(1) + ' s');
  events = await ask('what did I just ask you to remind me about?');
  check('it remembers the conversation', /oven/i.test(words(events)), words(events).slice(0, 120));

  const hushed = new Promise((resolve) => oracle.ask('tell me a very long story about a lighthouse keeper', (e) => {
    if (e.type === 'error' || e.type === 'done') resolve(e);
  }));
  await new Promise((r) => setTimeout(r, 1500));
  oracle.stop();
  const ended = await Promise.race([hushed, new Promise((r) => setTimeout(() => r('timeout'), 5000))]);
  check('Hush stops it mid-answer', ended !== 'timeout' && ended.code === 'stopped', JSON.stringify(ended));
  events = await ask('say hi');
  check('and it answers again after', events.at(-1).type === 'done' && words(events).length > 0);
  await freeMind.unload();
} catch (err) {
  console.error(err);
  failures++;
}

// --- Inside the app -------------------------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, XDG_CONFIG_HOME: fs.mkdtempSync(path.join(tmpdir(), 'reaper-')), REAPER_MODELS_DIR: dir, OLLAMA_HOST: '127.0.0.1:1' };
delete env.ANTHROPIC_API_KEY;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.join(here, '..')], env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('#body');
  const state = await page.evaluate(() => window.companion.state());
  check('a new user starts with the free mind, already downloaded here', state.brain === 'free' && state.free.installed, JSON.stringify(state.free));
  const reply = await page.evaluate(() => new Promise((resolve) => {
    let text = '';
    const off = window.companion.onSpeech((e) => {
      if (e.type === 'delta') text += e.text;
      if (e.type === 'error' || e.type === 'done') { off(); resolve({ ...e, text }); }
    });
    window.companion.speak('what is 6 times 7? Just the number.');
    setTimeout(() => resolve({ type: 'timeout' }), 120000);
  }));
  check('the free mind runs inside the app', reply.type === 'done' && /42/.test(reply.text), JSON.stringify(reply).slice(0, 200));
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await app.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll free mind checks passed');
process.exit(failures ? 1 : 0);
