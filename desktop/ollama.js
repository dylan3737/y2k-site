// A free mind for Speak: a model running on this computer through Ollama
// (ollama.com). Nothing leaves the machine and there is no key. This file is
// only the wire: finding the models and streaming one chat turn.

const DEFAULT_HOST = 'http://127.0.0.1:11434';
// Pulled when the user has no model yet: small (about 2 GB) and it can use tools.
export const SUGGESTED_MODEL = 'llama3.2';
// Among installed models, families known to handle tool calls well come first.
const PREFERRED = ['qwen3', 'llama3.2', 'llama3.1', 'qwen2.5', 'mistral-nemo', 'mistral', 'gpt-oss', 'llama3.3'];

// OLLAMA_HOST is Ollama's own variable, and may leave out the scheme or the port.
export function ollamaHost() {
  const raw = (process.env.OLLAMA_HOST || '').trim();
  if (!raw) return DEFAULT_HOST;
  try {
    const url = new URL(/^https?:\/\//.test(raw) ? raw : 'http://' + raw);
    if (url.hostname === '0.0.0.0') url.hostname = '127.0.0.1';
    if (!url.port && !/^https?:\/\//.test(raw)) url.port = '11434';
    return url.origin;
  } catch {
    return DEFAULT_HOST;
  }
}

export class OllamaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'down' | 'empty' | 'missing' | 'api'
  }
}

async function call(path, body, signal) {
  let res;
  try {
    res = await fetch(ollamaHost() + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw new OllamaError('down', 'Ollama is not running.');
  }
  if (!res.ok) {
    let reason = '';
    try { reason = String((await res.json()).error || ''); } catch {}
    if (res.status === 404 && /not found/i.test(reason)) throw new OllamaError('missing', reason);
    throw new OllamaError('api', reason || 'Ollama answered ' + res.status + '.');
  }
  return res;
}

// The names of the installed models, best choice first.
export async function listModels(signal) {
  const res = await call('/api/tags', null, signal || AbortSignal.timeout(3000));
  const data = await res.json();
  const names = (Array.isArray(data.models) ? data.models : [])
    .map((m) => m && (m.name || m.model))
    .filter((name) => typeof name === 'string' && !/embed/i.test(name));
  const rank = (name) => {
    const i = PREFERRED.findIndex((family) => name.startsWith(family));
    return i < 0 ? PREFERRED.length : i;
  };
  return names.sort((a, b) => rank(a) - rank(b));
}

// What a model can do: 'tools', 'vision', 'thinking'… Older Ollama versions
// don't say, in which case tools are tried and vision is not.
export async function capabilities(model, signal) {
  try {
    const res = await call('/api/show', { model }, signal || AbortSignal.timeout(5000));
    const data = await res.json();
    return Array.isArray(data.capabilities) ? data.capabilities : null;
  } catch (err) {
    if (err instanceof OllamaError && err.code === 'down') throw err;
    return null;
  }
}

// One turn of /api/chat, streamed as lines of JSON. Calls onText with each
// piece of his answer and resolves to { content, toolCalls }.
export async function chat({ model, messages, tools, signal, onText }) {
  const body = { model, messages, stream: true };
  if (tools && tools.length) body.tools = tools;
  const res = await call('/api/chat', body, signal);
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolCalls = [];

  const read = (line) => {
    if (!line.trim()) return;
    let part;
    try { part = JSON.parse(line); } catch { return; }
    if (part.error) throw new OllamaError('api', String(part.error));
    const message = part.message || {};
    if (typeof message.content === 'string' && message.content) {
      content += message.content;
      onText(message.content);
    }
    if (Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const fn = tc && tc.function;
        if (!fn || typeof fn.name !== 'string') continue;
        let args = fn.arguments;
        if (typeof args === 'string') {
          try { args = JSON.parse(args); } catch { args = {}; }
        }
        toolCalls.push({ name: fn.name, input: args && typeof args === 'object' ? args : {} });
      }
    }
  };

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      read(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 1);
    }
  }
  read(buffer);
  return { content, toolCalls };
}
