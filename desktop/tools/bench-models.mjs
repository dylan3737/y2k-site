// Scores local models on Speak's own work: the system prompt and tools the app
// sends, and requests a user would make. It runs each model the way the app
// does, in llama-server through freemind.js:
//   node tools/fetch-llama-server.mjs          (once, for llama-server)
//   node tools/bench-models.mjs <model.gguf> [more.gguf ...]
// For each model it prints how many requests it handled right, and the
// average time to a finished answer (the first includes loading the model).
// `forModel` counts only the requests the app gives the model: clear commands
// never reach it, because the plain-command parser does them (see quick() in
// oracle.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM, SMALL_MODEL_NOTE, TOOL_DEFS, FREE_TOOLS_EXCLUDE } from '../oracle.js';
import { createFreeMind, serverPath } from '../freemind.js';
import { parseCommand } from '../offline.js';

// The local date and time leads every message, as in the app.
const STAMP = '[Mon, Nov 16, 2026, 02:00 PM] ';

// A request, and what counts as handling it: the tool and its input, or (with
// tool null) an answer in words that uses no tool.
const CASES = [
  { ask: 'remind me in 20 minutes to check the oven', tool: 'send_raven', ok: (i) => i.minutes === 20 && /oven/i.test(i.text) },
  { ask: 'remind me at 3pm to call Sam', tool: 'send_raven', ok: (i) => i.minutes === 60 && /sam/i.test(i.text) },
  { ask: 'start a 25 minute focus timer', tool: 'set_hourglass', ok: (i) => i.minutes === 25 },
  { ask: 'stop the timer', tool: 'stop_hourglass', ok: () => true },
  { ask: 'break my screen', tool: 'cast', ok: (i) => ['shatter', 'slash'].includes(i.ability) },
  { ask: 'set my screen on fire', tool: 'cast', ok: (i) => i.ability === 'burn' },
  { ask: "let's play the ghost game", tool: 'cast', ok: (i) => i.ability === 'summon' },
  { ask: 'my name is Sam, remember that', tool: 'remember', ok: (i) => /sam/i.test(i.note) },
  { ask: "how's my crypt doing?", tool: 'get_crypt', ok: () => true },
  { ask: 'raise two skeletons', tool: 'raise_worker', ok: (i) => i.count === 2 },
  { ask: 'buy the sharper shovels upgrade', tool: 'buy_upgrade', ok: (i) => i.upgrade === 'shovels' },
  { ask: 'summarize what I copied', tool: 'read_clipboard', ok: () => true },
  { ask: 'what is the capital of France?', tool: null, ok: (text) => /paris/i.test(text) },
  { ask: 'what is 17 times 23?', tool: null, ok: (text) => /391/.test(text) },
  { ask: 'give me a one-line pep talk', tool: null, ok: (text) => text.trim().length > 10 },
  { ask: 'how do I burn a CD?', tool: null, ok: (text) => text.trim().length > 10 },
  { ask: 'explain what a black hole is, in one sentence', tool: null, ok: (text) => /gravit|light/i.test(text) },
  { ask: 'what is a good name for a black cat?', tool: null, ok: (text) => text.trim().length > 2 },
  { ask: 'cut my screen in half', tool: 'cast', ok: (i) => i.ability === 'slash' },
  { ask: 'what is on my clipboard right now?', tool: 'read_clipboard', ok: () => true }
];
const reachesModel = (c) => !parseCommand(c.ask, new Date(), { withModel: true });

// What the page would answer, so a model that calls a tool can finish its reply.
const ANSWERS = {
  send_raven: { id: 'r1', due: '3:00 PM' }, set_hourglass: { minutes: 25, endsAt: '2:25 PM' }, stop_hourglass: { stopped: true },
  cast: 'cast', remember: { id: 'm1' }, get_crypt: { souls: 140, skeletons: 3, perHour: 4.5, nextCost: 49 },
  raise_worker: { raised: 2, souls: 12 }, buy_upgrade: { bought: 'Sharper shovels', level: 1, souls: 80 },
  read_clipboard: { text: 'Meeting moved to Thursday at 10. Bring the Q3 numbers.' }
};

const here = path.dirname(fileURLToPath(import.meta.url));
const server = process.env.REAPER_LLAMA_SERVER || serverPath({ packaged: false, here: path.join(here, '..') });
if (!fs.existsSync(server)) {
  console.error('No llama-server at ' + server + '. Run: node tools/fetch-llama-server.mjs');
  process.exit(1);
}

for (const given of process.argv.slice(2)) {
  // A models folder holding just this file, as the app's would.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  const file = path.basename(given);
  fs.symlinkSync(path.resolve(given), path.join(dir, file));
  const mind = createFreeMind({
    dir, server, system: SYSTEM + SMALL_MODEL_NOTE,
    tools: TOOL_DEFS.filter((t) => !FREE_TOOLS_EXCLUDE.includes(t.name)),
    model: { name: file, file, bytes: fs.statSync(given).size, url: '' }
  });
  let right = 0;
  let modelRight = 0;
  let totalMs = 0;
  let firstMs = 0;
  const misses = [];
  for (const c of CASES) {
    // Each request starts a new conversation.
    mind.reset();
    const calls = [];
    const start = performance.now();
    let text = '';
    try {
      await mind.ask(STAMP + c.ask, {
        onText: (piece) => { text += piece; },
        use: async (name, input) => {
          calls.push({ name, input });
          return { ok: true, result: ANSWERS[name] || { ok: true } };
        }
      });
    } catch (err) {
      text = 'ERROR ' + err.message;
    }
    const ms = performance.now() - start;
    if (!firstMs) firstMs = ms;
    else totalMs += ms;
    const call = calls[0];
    const good = c.tool ? !!call && call.name === c.tool && c.ok(call.input) : !calls.length && c.ok(text);
    if (good && reachesModel(c)) modelRight += 1;
    if (good) right += 1;
    else misses.push(c.ask + ' -> ' + (call ? call.name + JSON.stringify(call.input) : JSON.stringify(text.slice(0, 80))));
  }
  mind.unload();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify({
    model: file, right: right + '/' + CASES.length,
    forModel: modelRight + '/' + CASES.filter(reachesModel).length,
    firstSeconds: +(firstMs / 1000).toFixed(1),
    avgSeconds: +(totalMs / (CASES.length - 1) / 1000).toFixed(1),
    misses
  }));
}
