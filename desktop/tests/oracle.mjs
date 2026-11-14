// Speak's conversation loop against a fake Messages API that streams a tool
// call, then an answer. Plain Node: no Electron and no real API calls.
import { createServer } from 'node:http';
import { createOracle } from '../oracle.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

const sse = (events) => events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join('');
const start = (id) => ['message_start', { message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }];
const end = (reason) => [['message_delta', { delta: { stop_reason: reason }, usage: { output_tokens: 5 } }], ['message_stop', {}]];

const TOOL_TURN = sse([
  start('msg_1'),
  ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'A raven, then.' } }],
  ['content_block_stop', { index: 0 }],
  ['content_block_start', { index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'send_raven', input: {} } }],
  ['content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '{"text":"Check the oven",' } }],
  ['content_block_delta', { index: 1, delta: { type: 'input_json_delta', partial_json: '"minutes":20}' } }],
  ['content_block_stop', { index: 1 }],
  ...end('tool_use')
]);
const TEXT_TURN = sse([
  start('msg_2'),
  ['content_block_start', { index: 0, content_block: { type: 'text', text: '' } }],
  ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'It flies at ' } }],
  ['content_block_delta', { index: 0, delta: { type: 'text_delta', text: '3:20.' } }],
  ['content_block_stop', { index: 0 }],
  ...end('end_turn')
]);
const REFUSAL_TURN = sse([start('msg_3'), ...end('refusal')]);

const requests = [];
let script = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
    const next = script.shift();
    if (next === 401) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }));
    }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(next);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;

const toolCalls = [];
const oracle = createOracle({
  getKey: () => 'sk-ant-test',
  runTool: async (name, input) => {
    toolCalls.push({ name, input });
    return { ok: true, result: { id: 'r1', due: '3:20 PM' } };
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

try {
  script = [TOOL_TURN, TEXT_TURN];
  let events = await ask('remind me to check the oven in 20 minutes');
  const text = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  check('his words stream through', text === 'A raven, then.It flies at 3:20.', text);
  check('the tool runs with the parsed input', toolCalls.length === 1 && toolCalls[0].name === 'send_raven' &&
    toolCalls[0].input.text === 'Check the oven' && toolCalls[0].input.minutes === 20, JSON.stringify(toolCalls));
  check('the page hears about the spell', events.some((e) => e.type === 'tool' && e.name === 'send_raven'));
  check('the turn ends with done', events[events.length - 1].type === 'done');

  const first = requests[0];
  check('it asks the beta endpoint', first.url.startsWith('/v1/messages'), first.url);
  check('it uses the default model', first.body.model === 'claude-opus-5-5');
  check('server-side fallbacks are on', first.body.fallbacks === 'default' &&
    String(first.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01'), first.headers['anthropic-beta']);
  check('it streams', first.body.stream === true);
  check('every tool streams its input', first.body.tools.every((t) => t.eager_input_streaming === true));
  check('the time leads the question', /^\[.+\] remind me/.test(first.body.messages[0].content));
  const second = requests[1].body.messages;
  check('the tool result goes back on the next request', second.length === 3 && second[2].content[0].type === 'tool_result' &&
    second[2].content[0].tool_use_id === 'toolu_1');
  check('his full reply is kept, tool call included', second[1].role === 'assistant' && second[1].content.some((b) => b.type === 'tool_use'));

  // The conversation carries on.
  script = [TEXT_TURN];
  await ask('thanks');
  check('the next question carries the conversation', requests[2].body.messages.length === 5);

  // A refusal resets the conversation.
  script = [REFUSAL_TURN];
  events = await ask('something refused');
  check('a refusal is reported', events.some((e) => e.type === 'error' && e.code === 'refusal'));
  script = [TEXT_TURN];
  await ask('hello again');
  check('after a refusal the conversation starts fresh', requests[4].body.messages.length === 1);

  // A bad key asks for a new one, and leaves the history as it was.
  script = [401];
  events = await ask('are you there');
  check('a refused key asks for a new one', events.some((e) => e.type === 'error' && e.code === 'key'));
  script = [TEXT_TURN];
  await ask('now?');
  check('a failed question is not kept', requests[requests.length - 1].body.messages.length === 3);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll oracle checks passed');
process.exit(failures ? 1 : 0);
