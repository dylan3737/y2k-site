// The free mind: a small model that runs on this computer. No key, no account,
// and nothing leaves the machine. The model is downloaded once (from Hugging
// Face) into the app's data folder.
//
// It runs in llama.cpp's llama-server, a separate program shipped with the app,
// not inside Electron: Electron's memory allocator refuses the single large
// block a model of a few GB needs, and crashed the app. The server is started
// when Speak first needs it and stopped after a while unused, so the reaper
// costs no memory while he is quiet. The app talks to it over its local,
// OpenAI-style chat API.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

// The model, picked with tools/bench-models.mjs (the desktop README has the
// numbers). Qwen3 4B Instruct was the quickest to a finished answer and the
// only fast one that never used an ability when asked a plain question; the
// Qwen3.5 models answered sums by casting spells.
export const MODEL = {
  name: 'Qwen3 4B',
  file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  bytes: 2497281120,
  url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf'
};

const CONTEXT = 6144;           // tokens of conversation it keeps in view
const IDLE_MS = 10 * 60 * 1000; // unused this long, the server is stopped
const MAX_ANSWER = 1200;        // tokens in one answer
const MAX_TOOL_TURNS = 6;
const START_MS = 180000;        // a slow disk can take a while to load 2.5 GB

// Where the server ships: next to the app when packaged, in vendor/ when run
// from source (tools/fetch-llama-server.mjs puts it there).
export function serverPath({ packaged, resources, here, platform = process.platform, arch = process.arch }) {
  const exe = platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  return packaged ? path.join(resources, 'llama', exe) : path.join(here, 'vendor', 'llama', platform + '-' + arch, exe);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lastError = (text) => text.trim().split('\n').filter((l) => /error|fail/i.test(l)).pop() || '';

// `model` and `idleMs` are for the tests: a tiny pretend model, a short idle.
export function createFreeMind({ dir, system, tools, server, model = MODEL, idleMs = IDLE_MS }) {
  let proc = null;
  let port = 0;
  let starting = null;
  let stderr = '';
  let idleTimer = null;
  let download = null;     // { done, total, cancel, promise } while downloading
  let messages = [{ role: 'system', content: system }];
  let used = 0;            // tokens the last request took up

  const file = () => path.join(dir, model.file);
  const installed = () => {
    try { return fs.statSync(file()).size === model.bytes; } catch { return false; }
  };
  const hasEngine = () => !!server && fs.existsSync(server);

  function status() {
    return {
      name: model.name,
      bytes: model.bytes,
      installed: installed(),
      engine: hasEngine(),
      downloading: download ? { done: download.done, total: download.total } : null,
      loaded: !!proc
    };
  }

  // --- The download ---------------------------------------------------------------
  // Into a .part file, picked up where it stopped if it was cut off. onProgress
  // gets { done, total } in bytes. Resolves true once the model is in place,
  // false if it was stopped.
  function fetchModel(onProgress = () => {}) {
    if (installed()) return Promise.resolve(true);
    if (download) return download.promise;
    const controller = new AbortController();
    download = { done: 0, total: model.bytes, cancel: () => controller.abort() };
    download.promise = (async () => {
      fs.mkdirSync(dir, { recursive: true });
      const part = file() + '.part';
      let have = 0;
      try { have = fs.statSync(part).size; } catch {}
      if (have >= model.bytes) have = 0;
      const res = await fetch(model.url, { headers: have ? { range: 'bytes=' + have + '-' } : {}, signal: controller.signal });
      if (res.status === 200) have = 0; // the server sent it all again
      else if (res.status !== 206) throw new Error('the download server answered ' + res.status);
      const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      download.done = have;
      onProgress({ done: have, total: model.bytes });
      try {
        for await (const chunk of res.body) {
          if (!out.write(chunk)) await once(out, 'drain');
          download.done += chunk.length;
          onProgress({ done: download.done, total: model.bytes });
        }
      } finally {
        out.end();
        await once(out, 'close');
      }
      const size = fs.statSync(part).size;
      if (size !== model.bytes) throw new Error('the download came out the wrong size (' + size + ' of ' + model.bytes + ' bytes)');
      fs.renameSync(part, file());
      return true;
    })().catch((err) => {
      if (controller.signal.aborted) return false;
      throw err;
    }).finally(() => { download = null; });
    return download.promise;
  }

  function cancelDownload() {
    if (download) download.cancel();
  }

  // --- The server -------------------------------------------------------------------
  function rest() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stop, idleMs);
  }

  function stop() {
    clearTimeout(idleTimer);
    const p = proc;
    proc = null;
    if (p && p.exitCode === null) p.kill();
  }

  async function start() {
    if (proc) return;
    if (starting) return starting;
    starting = (async () => {
      if (!hasEngine()) throw new Error('my engine is missing from this install');
      port = await freePort();
      const args = [
        '-m', file(), '--host', '127.0.0.1', '--port', String(port),
        // The model's own chat template, which is what knows its tool calls.
        '--jinja', '-c', String(CONTEXT), '-np', '1',
        // As much as fits on the graphics card, if there is one.
        '-ngl', '99',
        '--no-webui'
      ];
      const libs = path.dirname(server);
      const env = {
        ...process.env,
        LD_LIBRARY_PATH: libs + (process.env.LD_LIBRARY_PATH ? path.delimiter + process.env.LD_LIBRARY_PATH : ''),
        DYLD_LIBRARY_PATH: libs + (process.env.DYLD_LIBRARY_PATH ? path.delimiter + process.env.DYLD_LIBRARY_PATH : '')
      };
      stderr = '';
      const p = spawn(server, args, { env, cwd: libs, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      p.stderr.on('data', (d) => { stderr = (stderr + d).slice(-4000); });
      let exited = null;
      p.on('exit', (code, signal) => {
        exited = { code, signal };
        if (proc === p) proc = null;
      });
      p.on('error', (err) => { exited = { error: err.message }; });
      proc = p;
      // Ready once it answers /health; it says 503 while the model loads.
      const until = Date.now() + START_MS;
      for (;;) {
        if (exited) {
          proc = null;
          const why = exited.error || lastError(stderr) || 'it stopped (' + (exited.signal || exited.code) + ')';
          throw new Error('my engine would not start: ' + why);
        }
        try {
          const res = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(2000) });
          if (res.ok) return;
        } catch {}
        if (Date.now() > until) {
          stop();
          throw new Error('my engine took too long to start');
        }
        await wait(250);
      }
    })().finally(() => { starting = null; });
    return starting;
  }

  // --- A turn ---------------------------------------------------------------------
  const toolList = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));

  // One request, streamed. Calls onText with his words as they come; resolves
  // to { content, calls: [{ id, name, args }] }.
  async function complete(signal, onText) {
    const res = await fetch('http://127.0.0.1:' + port + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages, tools: toolList, stream: true, max_tokens: MAX_ANSWER,
        stream_options: { include_usage: true }
      }),
      signal
    });
    if (!res.ok) {
      let reason = '';
      try { reason = (await res.json()).error.message; } catch {}
      throw new Error(reason || 'my engine answered ' + res.status);
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    const calls = [];
    const read = (line) => {
      if (!line.startsWith('data:')) return;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') return;
      let part;
      try { part = JSON.parse(data); } catch { return; }
      if (part.usage && Number.isFinite(part.usage.prompt_tokens)) used = part.usage.prompt_tokens + (part.usage.completion_tokens || 0);
      const delta = part.choices && part.choices[0] && part.choices[0].delta;
      if (!delta) return;
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        onText(delta.content);
      }
      for (const tc of delta.tool_calls || []) {
        const i = Number.isInteger(tc.index) ? tc.index : calls.length;
        const call = calls[i] || (calls[i] = { id: tc.id || 'call_' + i, name: '', args: '' });
        if (tc.id) call.id = tc.id;
        if (tc.function && tc.function.name) call.name += tc.function.name;
        if (tc.function && typeof tc.function.arguments === 'string') call.args += tc.function.arguments;
      }
    };
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n')) >= 0) {
        read(buffer.slice(0, cut).trim());
        buffer = buffer.slice(cut + 1);
      }
    }
    read(buffer.trim());
    return { content, calls: calls.filter(Boolean) };
  }

  // One question. onText gets his words as they come; use runs his tools and
  // resolves to their outcome ({ ok, result } or { ok: false, error }).
  // Resolves to { text, full } where full means the conversation had grown too
  // long for the model and was started afresh first.
  async function ask(text, { onText, use, signal }) {
    clearTimeout(idleTimer);
    await start();
    let full = false;
    if (used > CONTEXT * 0.7) {
      messages = messages.slice(0, 1);
      used = 0;
      full = true;
    }
    const before = messages.slice();
    messages.push({ role: 'user', content: text });
    let said = '';
    try {
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const { content, calls } = await complete(signal, (piece) => { said += piece; onText(piece); });
        const reply = { role: 'assistant', content };
        if (calls.length) reply.tool_calls = calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
        messages.push(reply);
        if (!calls.length) break;
        for (const c of calls) {
          let outcome;
          try {
            const input = c.args ? JSON.parse(c.args) : {};
            outcome = await use(c.name, input && typeof input === 'object' ? input : {});
          } catch (err) {
            outcome = { ok: false, error: err instanceof SyntaxError ? 'the arguments were not valid JSON' : String(err.message || err) };
          }
          if (signal && signal.aborted) break;
          messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }) });
        }
        if (signal && signal.aborted) break;
      }
      // Hushed: the half-finished exchange is not kept.
      if (signal && signal.aborted) messages = before;
      return { text: said, full };
    } catch (err) {
      messages = before;
      if (signal && signal.aborted) return { text: said, full };
      throw err;
    } finally {
      rest();
    }
  }

  // A command done without the model (oracle.js's quick path) still belongs
  // in its conversation, so it can be asked about later.
  function record(text, reply) {
    messages.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
  }

  return {
    status,
    fetchModel,
    cancelDownload,
    ask,
    record,
    unload: stop,
    // ↺: a new conversation.
    reset() {
      messages = messages.slice(0, 1);
      used = 0;
    }
  };
}
