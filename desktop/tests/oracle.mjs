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
const notes = [{ id: 'm1', text: 'Name is Sam' }];
const memory = {
  list: () => notes,
  add(text) { const n = { id: 'm' + (notes.length + 1), text }; notes.push(n); return n; },
  remove(id) { const i = notes.findIndex((n) => n.id === id); if (i < 0) return false; notes.splice(i, 1); return true; }
};
let toolAnswer = { ok: true, result: { id: 'r1', due: '3:20 PM' } };
const oracle = createOracle({
  getKey: () => 'sk-ant-test',
  memory,
  runTool: async (name, input) => {
    toolCalls.push({ name, input });
    return toolAnswer;
  }
});

// A turn that calls one tool with the given input.
const toolTurn = (name, json) => sse([
  start('msg_t'),
  ['content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'toolu_x', name, input: {} } }],
  ['content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: json } }],
  ['content_block_stop', { index: 0 }],
  ...end('tool_use')
]);

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
  check('it asks the Messages API', first.url.startsWith('/v1/messages'), first.url);
  check('it uses Claude Haiku 5.5 at low effort', first.body.model === 'claude-haiku-5-5' && first.body.output_config.effort === 'low');
  check('it sends no fallbacks (Haiku has none)', !('fallbacks' in first.body) && !first.headers['anthropic-beta']);
  check('it sends no sampling parameters', !('temperature' in first.body) && !('top_p' in first.body) && !('top_k' in first.body));
  check('the opening message carries what he remembers', first.body.messages[0].content.includes('m1: Name is Sam'));
  check('it streams', first.body.stream === true);
  check('every tool streams its input', first.body.tools.every((t) => t.eager_input_streaming === true));
  check('the time leads the question', /^\[.+\]/.test(first.body.messages[0].content) && first.body.messages[0].content.endsWith(' remind me to check the oven in 20 minutes'));
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
  check('a refused question is dropped and the rest kept', requests[4].body.messages.length === 7 &&
    requests[4].body.messages[6].content.endsWith('hello again'));

  // A bad key asks for a new one, and leaves the history as it was.
  script = [401];
  events = await ask('are you there');
  check('a refused key asks for a new one', events.some((e) => e.type === 'error' && e.code === 'key'));
  script = [TEXT_TURN];
  await ask('now?');
  check('a failed question is not kept', requests[requests.length - 1].body.messages.length === 9);

  // Memory runs here, not in the page.
  oracle.forget();
  toolCalls.length = 0;
  script = [toolTurn('remember', '{"note":"Likes tea"}'), TEXT_TURN];
  await ask('I like tea');
  check('remember keeps a note without the page', notes.some((n) => n.text === 'Likes tea') && toolCalls.length === 0);
  script = [toolTurn('forget_memory', '{"id":"m1"}'), TEXT_TURN];
  await ask('forget my name');
  check('forget_memory removes it', !notes.some((n) => n.id === 'm1'));

  // Look: the picture goes back as an image block.
  toolAnswer = { ok: true, result: { seen: 'the screen, attached' }, image: 'data:image/jpeg;base64,QUJD' };
  script = [toolTurn('look_at_screen', '{}'), TEXT_TURN];
  await ask('what is on my screen');
  const sent = requests[requests.length - 1].body.messages.at(-1).content[0];
  const image = Array.isArray(sent.content) && sent.content.find((b) => b.type === 'image');
  check('a picture goes to the model as an image', !!image && image.source.media_type === 'image/jpeg' && image.source.data === 'QUJD');
  toolAnswer = { ok: true, result: {}, image: 'javascript:alert(1)' };
  script = [toolTurn('look_at_screen', '{}'), TEXT_TURN];
  await ask('again');
  const plain = requests[requests.length - 1].body.messages.at(-1).content[0];
  check('anything but an image data URL is not sent as one', typeof plain.content === 'string');
} catch (err) {
  console.error(err);
  failures++;
} finally {
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll oracle checks passed');
process.exit(failures ? 1 : 0);
