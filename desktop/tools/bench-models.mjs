// Scores local models on Speak's own work: the system prompt and tools the app
// sends, and requests a user would make. Run it with node-llama-cpp installed:
//   node tools/bench-models.mjs <model.gguf> [more.gguf ...]
// For each model it prints load time, how many requests it handled right, the
// average time to a finished answer, and generation speed.
import path from 'node:path';
import { getLlama, LlamaChatSession, defineChatSessionFunction } from 'node-llama-cpp';
import { SYSTEM, TOOL_DEFS } from '../oracle.js';

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
  { ask: 'raise two skeletons', tool: 'raise_skeleton', ok: (i) => i.count === 2 },
  { ask: 'buy the sharper shovels upgrade', tool: 'buy_upgrade', ok: (i) => i.upgrade === 'shovels' },
  { ask: 'summarize what I copied', tool: 'read_clipboard', ok: () => true },
  { ask: 'what is the capital of France?', tool: null, ok: (text) => /paris/i.test(text) },
  { ask: 'what is 17 times 23?', tool: null, ok: (text) => /391/.test(text) },
  { ask: 'give me a one-line pep talk', tool: null, ok: (text) => text.trim().length > 10 }
];

// What the page would answer, so a model that calls a tool can finish its reply.
const ANSWERS = {
  send_raven: { id: 'r1', due: '3:00 PM' }, set_hourglass: { minutes: 25, endsAt: '2:25 PM' }, stop_hourglass: { stopped: true },
  cast: 'cast', remember: { id: 'm1' }, get_crypt: { souls: 140, skeletons: 3, perHour: 4.5, nextCost: 49 },
  raise_skeleton: { raised: 2, souls: 12 }, buy_upgrade: { bought: 'Sharper shovels', level: 1, souls: 80 },
  read_clipboard: { text: 'Meeting moved to Thursday at 10. Bring the Q3 numbers.' }
};

// Speak's tools in node-llama-cpp's shape. The app uses this same conversion.
function functionsFor(calls) {
  return Object.fromEntries(TOOL_DEFS.filter((t) => t.name !== 'look_at_screen').map((t) => [t.name, defineChatSessionFunction({
    description: t.description,
    params: Object.keys(t.input_schema.properties).length ? t.input_schema : undefined,
    handler: (input) => {
      calls.push({ name: t.name, input: input || {} });
      return ANSWERS[t.name] || { ok: true };
    }
  })]));
}

const llama = await getLlama({ gpu: false });
for (const file of process.argv.slice(2)) {
  const t0 = performance.now();
  const model = await llama.loadModel({ modelPath: file });
  const context = await model.createContext({ contextSize: 4096 });
  const loadMs = performance.now() - t0;
  const session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: SYSTEM });
  const fresh = session.getChatHistory();
  let right = 0;
  let totalMs = 0;
  let tokens = 0;
  let genMs = 0;
  const misses = [];
  for (const c of CASES) {
    // Each request starts a new conversation; the shared opening stays cached.
    session.setChatHistory(fresh);
    const calls = [];
    const start = performance.now();
    let text = '';
    let first = 0;
    let pieces = 0;
    try {
      text = await session.prompt(STAMP + c.ask, {
        functions: functionsFor(calls), maxTokens: 300, budgets: { thoughtTokens: 0 },
        onTextChunk: () => { if (!first) first = performance.now(); pieces += 1; }
      });
    } catch (err) {
      text = 'ERROR ' + err.message;
    }
    const ms = performance.now() - start;
    totalMs += ms;
    if (first) { tokens += pieces; genMs += performance.now() - first; }
    const call = calls[0];
    const good = c.tool ? !!call && call.name === c.tool && c.ok(call.input) : !calls.length && c.ok(text);
    if (good) right += 1;
    else misses.push(c.ask + ' -> ' + (call ? call.name + JSON.stringify(call.input) : JSON.stringify(text.slice(0, 80))));
  }
  console.log(JSON.stringify({
    model: path.basename(file), right: right + '/' + CASES.length, avgSeconds: +(totalMs / CASES.length / 1000).toFixed(1),
    tokensPerSecond: genMs ? +(tokens / (genMs / 1000)).toFixed(1) : null, loadSeconds: +(loadMs / 1000).toFixed(1),
    ramMB: Math.round(process.memoryUsage().rss / 1048576), misses
  }));
  await context.dispose();
  await model.dispose();
}
