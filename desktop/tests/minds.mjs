// Speak's free minds: a local model through a fake Ollama server, and the plain
// commands he follows with no model at all. Plain Node: no Electron, no Ollama.
import { createServer } from 'node:http';
import { createOracle } from '../oracle.js';
import { parseCommand } from '../offline.js';
import { ollamaHost } from '../ollama.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

// --- A stand-in for Ollama ---------------------------------------------------
const ndjson = (parts) => parts.map((p) => JSON.stringify(p)).join('\n') + '\n';
const words = (...pieces) => ndjson([
  ...pieces.map((content) => ({ message: { role: 'assistant', content }, done: false })),
  { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
]);
const calls = (name, args) => ndjson([
  { message: { role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] }, done: false },
  { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
]);

const requests = [];
let script = [];
let installed = [{ name: 'nomic-embed-text:latest' }, { name: 'gemma3:4b' }, { name: 'llama3.2:latest' }];
let abilities = { 'llama3.2:latest': ['completion', 'tools'], 'gemma3:4b': ['completion', 'vision'], 'llava:latest': ['completion', 'tools', 'vision'] };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.url === '/api/tags') return json(200, { models: installed });
    const sent = JSON.parse(body);
    if (req.url === '/api/show') {
      return abilities[sent.model] ? json(200, { capabilities: abilities[sent.model] }) : json(404, { error: 'model not found' });
    }
    requests.push(sent);
    const next = script.shift();
    if (next === 'no-tools' && sent.tools) return json(400, { error: 'registry.ollama.ai/library/x does not support tools' });
    if (next === 'missing') return json(404, { error: `model '${sent.model}' not found` });
    if (next === 'hang') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(ndjson([{ message: { role: 'assistant', content: 'Hm' }, done: false }]));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.end(next === 'no-tools' ? words('Just talk, then.') : next);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
process.env.OLLAMA_HOST = `127.0.0.1:${port}`;
// Claude must be unreachable here: nothing in this file may call the real API.
process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:1';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const toolCalls = [];
const notes = [];
const memory = {
  list: () => notes,
  add(text) { const n = { id: 'm' + (notes.length + 1), text }; notes.push(n); return n; },
  remove(id) { const i = notes.findIndex((n) => n.id === id); if (i < 0) return false; notes.splice(i, 1); return true; }
};
const ravens = [];
let brain = { kind: 'ollama', model: null };
let key = null;
const oracle = createOracle({
  getKey: () => key,
  getBrain: () => brain,
  memory,
  runTool: async (name, input) => {
    toolCalls.push({ name, input });
    if (name === 'send_raven') { ravens.push({ id: 'r' + (ravens.length + 1), text: input.text, due: 'soon' }); return { ok: true, result: { id: 'r1', due: '3:20 PM' } }; }
    if (name === 'list_ravens') return { ok: true, result: ravens };
    if (name === 'cancel_raven') { ravens.splice(ravens.findIndex((r) => r.id === input.id), 1); return { ok: true, result: { cancelled: true } }; }
    if (name === 'set_hourglass') return { ok: true, result: { minutes: input.minutes, endsAt: '4:00 PM' } };
    if (name === 'look_at_screen') return { ok: true, result: { seen: 'the screen, attached' }, image: 'data:image/jpeg;base64,QUJD' };
    if (name === 'cast') return { ok: true, result: 'cast' };
    return { ok: true, result: {} };
  }
});

function ask(text) {
  const events = [];
  return new Promise((resolve) => {
    oracle.ask(text, (e) => {
      events.push(e);
      if (e.type === 'done' || e.type === 'error') resolve(events);
    });
  });
}
const said = (events) => events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
const last = (events) => events[events.length - 1];

try {
  // --- The wire ----------------------------------------------------------------
  check('OLLAMA_HOST without a scheme is understood', ollamaHost() === `http://127.0.0.1:${port}`, ollamaHost());

  // --- A local model -------------------------------------------------------------
  script = [calls('send_raven', { text: 'Check the oven', minutes: 20 }), words('It flies ', 'at 3:20.')];
  let events = await ask('remind me to check the oven in 20 minutes');
  check('a local model answers, with no key', said(events) === 'It flies at 3:20.' && last(events).type === 'done', JSON.stringify(events));
  check('it picks a model that can use tools', requests[0].model === 'llama3.2:latest', requests[0].model);
  check('its tool call runs in the page', toolCalls.length === 1 && toolCalls[0].name === 'send_raven' && toolCalls[0].input.minutes === 20);
  check('the page hears about the spell', events.some((e) => e.type === 'tool' && e.name === 'send_raven'));
  check('the tools go in Ollama\'s shape', requests[0].tools.every((t) => t.type === 'function' && t.function.parameters.type === 'object'));
  check('a model that cannot see gets no Look', !requests[0].tools.some((t) => t.function.name === 'look_at_screen'));
  check('the conversation opens with his character', requests[0].messages[0].role === 'system' && requests[0].messages[0].content.includes('You are the Reaper'));
  const back = requests[1].messages;
  check('the tool result goes back to the model', back.length === 4 && back[2].tool_calls[0].function.name === 'send_raven' &&
    back[3].role === 'tool' && back[3].tool_name === 'send_raven' && back[3].content.includes('3:20'));
  script = [words('Mm.')];
  await ask('thanks');
  check('the next question carries the conversation', requests[2].messages.length === 6);

  // Memory works the same with a local mind.
  script = [calls('remember', { note: 'Likes tea' }), words('Kept.')];
  await ask('I like tea');
  check('a local model can remember', notes.some((n) => n.text === 'Likes tea'));

  // A model that can see is shown the picture, once.
  brain = { kind: 'ollama', model: 'llava:latest' };
  script = [calls('look_at_screen', {}), words('A terminal.')];
  await ask('what is on my screen');
  const shown = requests[requests.length - 1].messages;
  check('changing models starts a new conversation', requests[requests.length - 2].messages.length === 2);
  check('a model that can see is offered Look', requests[requests.length - 2].tools.some((t) => t.function.name === 'look_at_screen'));
  check('the picture goes to the model', shown.at(-1).role === 'user' && shown.at(-1).images[0] === 'QUJD');
  script = [words('Yes.')];
  await ask('sure?');
  check('the picture is not sent again later', !requests[requests.length - 1].messages.some((m) => m.images));

  // A model that can only talk.
  brain = { kind: 'ollama', model: 'gemma3:4b' };
  script = [words('Hello.')];
  events = await ask('hello');
  check('a model without tools just talks', !requests[requests.length - 1].tools && said(events) === 'Hello.' &&
    events.some((e) => e.type === 'note' && /only talk/.test(e.text)));
  brain = { kind: 'ollama', model: 'mystery:latest' };
  script = ['no-tools', 'no-tools'];
  events = await ask('hello');
  check('a refusal of tools is retried without them', said(events) === 'Just talk, then.' && !requests[requests.length - 1].tools, JSON.stringify(events));

  // Trouble.
  script = ['missing'];
  events = await ask('are you there');
  check('a model that is not installed says how to get it', last(events).code === 'local' && /ollama pull mystery:latest/.test(last(events).message), JSON.stringify(last(events)));
  brain = { kind: 'ollama', model: null };
  const kept = installed;
  installed = [];
  events = await ask('are you there');
  check('no models at all says how to get one', last(events).code === 'local' && /ollama pull llama3\.2/.test(last(events).message), JSON.stringify(last(events)));
  installed = kept;

  script = ['hang'];
  const hushed = new Promise((resolve) => {
    oracle.ask('tell me a long story', (e) => { if (e.type === 'error' || e.type === 'done') resolve(e); });
  });
  await new Promise((r) => setTimeout(r, 300));
  oracle.stop();
  const ended = await Promise.race([hushed, new Promise((r) => setTimeout(() => r('timeout'), 2000))]);
  check('Hush stops a local answer', ended !== 'timeout' && ended.code === 'stopped', JSON.stringify(ended));

  // Ollama is not running: commands still work, and questions say what to do.
  process.env.OLLAMA_HOST = '127.0.0.1:1';
  toolCalls.length = 0;
  events = await ask('25 minute timer');
  check('with Ollama down a plain command still works', toolCalls.length === 1 && toolCalls[0].name === 'set_hourglass' &&
    toolCalls[0].input.minutes === 25 && last(events).type === 'done' && /4:00 PM/.test(said(events)), JSON.stringify(events));
  events = await ask('why is the sky blue');
  check('with Ollama down a question says so', last(events).code === 'local' && /not running/.test(last(events).message) && /help/.test(last(events).message));

  // --- No mind at all ------------------------------------------------------------
  brain = { kind: 'offline', model: null };
  const before = requests.length;
  toolCalls.length = 0;
  events = await ask('Remind me in 20 minutes to call Sam');
  check('a reminder needs no model', toolCalls[0].name === 'send_raven' && toolCalls[0].input.text === 'Call Sam' &&
    toolCalls[0].input.minutes === 20 && last(events).type === 'done', JSON.stringify(toolCalls));
  events = await ask('cancel reminder sam');
  check('a reminder can be called back by its words', toolCalls.at(-1).name === 'cancel_raven' && /Called back: Call Sam/.test(said(events)), said(events));
  events = await ask('remember I take my coffee black');
  check('memory needs no model', notes.some((n) => n.text === 'I take my coffee black') && said(events) === 'Kept.');
  events = await ask('what do you remember');
  check('he can say what he remembers', /coffee black/.test(said(events)));
  events = await ask('forget coffee');
  check('and forget it', !notes.some((n) => /coffee/.test(n.text)), said(events));
  events = await ask('burn it');
  check('a screen trick needs no model', toolCalls.at(-1).name === 'cast' && toolCalls.at(-1).input.ability === 'burn');
  events = await ask('help');
  check('help lists what he knows', /remind me in 20 minutes/.test(said(events)));
  events = await ask('why is the sky blue');
  check('anything else says he has no mind', last(events).code === 'alone' && /help/.test(last(events).message), JSON.stringify(last(events)));
  check('no model is asked', requests.length === before);

  // --- Claude with no key, or no network -----------------------------------------
  brain = { kind: 'claude', model: null };
  toolCalls.length = 0;
  events = await ask('stop the timer');
  check('without a key a plain command still works', toolCalls[0].name === 'stop_hourglass' && last(events).type === 'done');
  events = await ask('why is the sky blue');
  check('without a key a question asks for a mind', last(events).code === 'key');
  key = 'sk-ant-test';
  toolCalls.length = 0;
  events = await ask('pomodoro');
  check('with no network a plain command still works', toolCalls.length === 1 && toolCalls[0].input.minutes === 25 && last(events).type === 'done', JSON.stringify(events));
  events = await ask('why is the sky blue');
  check('with no network a question says so', last(events).code === 'offline', JSON.stringify(last(events)));

  // --- The command parser ----------------------------------------------------------
  const at2pm = new Date(2026, 10, 17, 14, 0);
  const sent = async (text) => {
    let got = null;
    const run = parseCommand(text, at2pm);
    if (run) await run({ tool: async (name, input) => { got = { name, ...input }; return { ok: true, result: { due: '', endsAt: '' } }; }, memory });
    return got;
  };
  const times = [
    ['remind me at 3pm to stretch', 60], ['remind me at 9 to stretch', 420], ['remind me at 15:30 to stretch', 90],
    ['remind me tomorrow at 9am to stretch', 1140], ['remind me in an hour and 30 minutes to stretch', 90],
    ['remind me to stretch in half an hour', 30], ['Remind me in 2 days to stretch', 2880]
  ];
  for (const [text, minutes] of times) {
    const got = await sent(text);
    check(text, !!got && got.minutes === minutes && got.text === 'Stretch', JSON.stringify(got));
  }
  check('a long sentence that mentions fire is not an order', parseCommand('please explain why fire burns hotter in pure oxygen') === null);
  check('small talk is not a command', parseCommand('hello there') === null && parseCommand('what is the capital of France') === null);
  check('a reminder past a week is turned down', (await sent('remind me in 3 weeks to stretch')) === null);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.closeAllConnections();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll mind checks passed');
process.exit(failures ? 1 : 0);
