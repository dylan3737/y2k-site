// The free mind's engine handling, against a stand-in llama-server
// (tests/fixtures/fake-llama-server.mjs) and a stand-in download server: no
// real model, no network. Linux and macOS (the stand-in starts from a shell script).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFreeMind, serverPath } from '../freemind.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-engine-'));
const dir = path.join(work, 'models');
const scriptFile = path.join(work, 'script.json');
const logFile = path.join(work, 'log.jsonl');
process.env.FAKE_SCRIPT = scriptFile;
process.env.FAKE_LOG = logFile;
// The stand-in, as an executable the way llama-server is.
const server = path.join(work, 'llama-server');
fs.writeFileSync(server, '#!/bin/sh\nexec "' + process.execPath + '" "' + path.join(here, 'fixtures', 'fake-llama-server.mjs') + '" "$@"\n');
fs.chmodSync(server, 0o755);

const script = (answers) => { fs.writeFileSync(scriptFile, JSON.stringify(answers)); fs.writeFileSync(logFile, ''); };
const logged = () => fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const requests = () => logged().filter((e) => e.request).map((e) => e.request);
const starts = () => logged().filter((e) => e.start).length;

// A pretend model: 300 kB, served with range requests like Hugging Face.
const bytes = Buffer.alloc(300000, 7);
const seenRanges = [];
let slow = false;
const files = http.createServer((req, res) => {
  const range = /bytes=(\d+)-/.exec(req.headers.range || '');
  seenRanges.push(req.headers.range || null);
  const from = range ? Number(range[1]) : 0;
  res.writeHead(range ? 206 : 200, { 'content-length': bytes.length - from });
  if (!slow) return res.end(bytes.subarray(from));
  // Slowly, so a test can stop it part way.
  let at = from;
  const drip = setInterval(() => {
    if (at >= bytes.length || res.destroyed) { clearInterval(drip); return res.end(); }
    res.write(bytes.subarray(at, at + 20000));
    at += 20000;
  }, 30);
});
await new Promise((r) => files.listen(0, '127.0.0.1', r));
const model = { name: 'Test', file: 'test.gguf', bytes: bytes.length, url: 'http://127.0.0.1:' + files.address().port + '/test.gguf' };

const tools = [{ name: 'send_raven', description: 'A reminder.', input_schema: { type: 'object', properties: { text: { type: 'string' }, minutes: { type: 'number' } }, required: ['text', 'minutes'] } }];
const mind = (opts = {}) => createFreeMind({ dir, system: 'You are the Reaper.', tools, server, model, ...opts });
const ask = async (m, text, extra = {}) => {
  let said = '';
  const used = [];
  const out = await m.ask(text, {
    onText: (piece) => { said += piece; },
    use: async (name, input) => { used.push({ name, input }); return { ok: true, result: { due: '3:20 PM' } }; },
    ...extra
  });
  return { ...out, said, used };
};

try {
  check('the packaged app looks for it beside its resources', serverPath({ packaged: true, resources: '/app/res', here: '/x', platform: 'linux' }) === '/app/res/llama/llama-server' &&
    serverPath({ packaged: true, resources: 'C:\\r', here: '', platform: 'win32' }).endsWith('llama-server.exe'));
  check('from source it looks in vendor/', serverPath({ packaged: false, here: '/src', platform: 'darwin', arch: 'arm64' }) === '/src/vendor/llama/darwin-arm64/llama-server');

  // --- The download ---------------------------------------------------------------
  let m = mind();
  check('before the download it is not installed', !m.status().installed && m.status().engine);
  slow = true;
  const progress = [];
  const going = m.fetchModel((p) => progress.push(p.done));
  await new Promise((r) => setTimeout(r, 120));
  check('while downloading, the status says how far', m.status().downloading && m.status().downloading.total === bytes.length);
  m.cancelDownload();
  check('a stopped download resolves false', (await going) === false && !m.status().installed && !m.status().downloading);
  const part = fs.statSync(path.join(dir, 'test.gguf.part')).size;
  check('and keeps what it had', part > 0 && part < bytes.length, String(part));
  slow = false;
  check('the next try picks up where it stopped', (await m.fetchModel()) === true && seenRanges.at(-1) === 'bytes=' + part + '-' && m.status().installed);
  check('progress was reported along the way', progress.length > 1 && progress.at(-1) > progress[0]);
  check('the finished model is the right size, and no .part is left', fs.statSync(path.join(dir, 'test.gguf')).size === bytes.length && !fs.existsSync(path.join(dir, 'test.gguf.part')));

  // --- The engine ------------------------------------------------------------------
  script([{ say: ['Light ', 'scatters.'] }]);
  let out = await ask(m, 'why is the sky blue');
  check('it starts the engine and streams the answer', out.said === 'Light scatters.' && starts() === 1 && m.status().loaded, out.said);
  const startArgs = logged().find((e) => e.start).start;
  check('the engine gets the model, the chat template and only this computer', startArgs.includes(path.join(dir, 'test.gguf')) &&
    startArgs.includes('--jinja') && startArgs[startArgs.indexOf('--host') + 1] === '127.0.0.1', startArgs.join(' '));
  check('the system prompt leads the conversation, and the tools go with it', requests()[0].messages[0].content === 'You are the Reaper.' &&
    requests()[0].tools[0].function.name === 'send_raven' && requests()[0].stream === true);

  script([{ call: { name: 'send_raven', args: ['{"text":"Che', 'ck the oven","minutes":20}'] } }, { say: ['Sent.'] }]);
  out = await ask(m, 'nudge me about the oven');
  check('a tool call streamed in pieces runs once, with its input whole', out.used.length === 1 && out.used[0].input.minutes === 20 && out.used[0].input.text === 'Check the oven', JSON.stringify(out.used));
  const back = requests()[1].messages;
  check('its result goes back to the model', back.at(-2).tool_calls[0].function.name === 'send_raven' && back.at(-1).role === 'tool' &&
    back.at(-1).tool_call_id === 'call_1' && back.at(-1).content.includes('3:20'), JSON.stringify(back.slice(-2)));
  check('and the answer after it streams', out.said === 'Sent.');
  check('one engine serves every question', starts() === 0);

  script([{ say: ['Yes.'] }]);
  await ask(m, 'and the first thing I asked?');
  check('the conversation carries on', requests()[0].messages.some((x) => x.content === 'why is the sky blue'));
  m.record('remind me in 5 minutes to stretch', 'A raven flies in 5 min.');
  script([{ say: ['Stretch.'] }]);
  await ask(m, 'what was that reminder?');
  check('a command done without the model is in its conversation', requests()[0].messages.some((x) => x.content === 'A raven flies in 5 min.'));
  m.reset();
  script([{ say: ['Hello.'] }]);
  await ask(m, 'hello');
  check('↺ starts afresh: only the system prompt and the question', requests()[0].messages.length === 2);

  script([{ call: { name: 'send_raven', args: ['{not json'] } }, { say: ['Hm.'] }]);
  out = await ask(m, 'remind me of something');
  check('a tool call with broken input is not run, and the model hears why', out.used.length === 0 && requests()[1].messages.at(-1).content.includes('not valid JSON'));

  // Hush mid-answer: the exchange is dropped.
  script([{ say: ['Once upon '], hang: true }, { say: ['Hi.'] }]);
  const stopper = new AbortController();
  const hushed = ask(m, 'tell me a long story', { signal: stopper.signal });
  await new Promise((r) => setTimeout(r, 200));
  stopper.abort();
  out = await Promise.race([hushed, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
  check('Hush stops it mid-answer', out !== 'timeout' && out.said === 'Once upon ', JSON.stringify(out));
  await ask(m, 'hi');
  check('and the hushed exchange is not kept', !requests().at(-1).messages.some((x) => x.content === 'tell me a long story'));

  // A conversation grown too long for the model starts afresh.
  script([{ say: ['Long.'], usage: 5000 }, { say: ['Fresh.'] }]);
  await ask(m, 'one');
  out = await ask(m, 'two');
  check('past most of its context, the conversation starts afresh, and says so', out.full === true && requests()[1].messages.length === 2);

  m.unload();
  check('it can be stopped', !m.status().loaded);

  // Unused for a while: the engine is stopped, and started again when asked.
  m = mind({ idleMs: 300 });
  script([{ say: ['A.'] }, { say: ['B.'] }]);
  await ask(m, 'first');
  await new Promise((r) => setTimeout(r, 600));
  check('left unused, the engine is stopped', !m.status().loaded);
  out = await ask(m, 'second');
  check('and started again when asked', out.said === 'B.' && starts() === 2 && requests().at(-1).messages.some((x) => x.content === 'first'));
  m.unload();

  // --- Trouble ---------------------------------------------------------------------
  script([{ crash: true }]);
  m = mind();
  let err = await ask(m, 'hello').catch((e) => e);
  check('an engine that will not start says why', err instanceof Error && /would not start/.test(err.message) && /tensor data/.test(err.message), String(err && err.message));
  m = mind({ server: path.join(work, 'nothing-here') });
  check('a missing engine is reported in the status', m.status().engine === false);
  err = await ask(m, 'hello').catch((e) => e);
  check('and when asked', err instanceof Error && /missing/.test(err.message), String(err && err.message));
} catch (e) {
  console.error(e);
  failures++;
} finally {
  files.close();
  fs.rmSync(work, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll engine checks passed');
process.exit(failures ? 1 : 0);
