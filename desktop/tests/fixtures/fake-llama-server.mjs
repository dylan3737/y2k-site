// A stand-in for llama.cpp's llama-server, for tests/engine.mjs. It takes the
// same arguments, answers /health (503 while "loading", then 200) and streams
// /v1/chat/completions the way llama-server does, from a script of answers.
//   FAKE_SCRIPT  a JSON file: a list of answers, one used per request
//   FAKE_LOG     a file it appends a JSON line to for each start and request
// An answer is { say: [pieces] } or { call: { name, args: [pieces] } }, with
// optional { usage } (prompt tokens), { hang: true } (stream, then wait), or
// { crash: true } (die on start, as with a broken model).
import http from 'node:http';
import fs from 'node:fs';

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const log = (entry) => fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify(entry) + '\n');
const script = () => JSON.parse(fs.readFileSync(process.env.FAKE_SCRIPT, 'utf8'));

log({ start: process.argv.slice(2) });
const first = script()[0] || {};
if (first.crash) {
  process.stderr.write('llama_model_load: error loading model: tensor data is not within file bounds\n');
  process.exit(1);
}

const ready = Date.now() + 300;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(Date.now() < ready ? 503 : 200, { 'content-type': 'application/json' });
    return res.end('{}');
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const sent = JSON.parse(body);
    log({ request: sent });
    // Answers count from when the test last set the script (it clears the log).
    const n = fs.readFileSync(process.env.FAKE_LOG, 'utf8').split('\n').filter((l) => l.startsWith('{"request"')).length - 1;
    const answer = script()[n] || { say: ['…'] };
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const chunk = (delta, extra = {}) => res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta }], ...extra }) + '\n\n');
    if (answer.say) answer.say.forEach((piece) => chunk({ content: piece }));
    if (answer.call) {
      chunk({ tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: answer.call.name, arguments: '' } }] });
      answer.call.args.forEach((piece) => chunk({ tool_calls: [{ index: 0, function: { arguments: piece } }] }));
    }
    if (answer.hang) return;
    res.write('data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: answer.usage || 100, completion_tokens: 10 } }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
}).listen(Number(arg('--port')), arg('--host'));
