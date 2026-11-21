// The free mind: a small model that runs inside the app, on this computer,
// through node-llama-cpp. No key, no account, and nothing leaves the machine.
// The model is downloaded once (from Hugging Face) into the app's data folder.
//
// The runtime is loaded only when Speak first needs it, and the model is let
// go after a while unused, so the reaper costs no memory while he is quiet.
import fs from 'node:fs';
import path from 'node:path';

// The model, picked with tools/bench-models.mjs (the desktop README has the
// numbers). Qwen3 4B Instruct was the quickest to a finished answer and the
// only fast one that never used an ability when asked a plain question; the
// Qwen3.5 models answered sums by casting spells.
export const MODEL = {
  name: 'Qwen3 4B',
  uri: 'hf:unsloth/Qwen3-4B-Instruct-2507-GGUF/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
  bytes: 2497281120
};

const CONTEXT = 6144;           // tokens of conversation it keeps in view
const IDLE_MS = 10 * 60 * 1000; // unused this long, the model is let go
const MAX_ANSWER = 1200;        // tokens in one answer

export function createFreeMind({ dir, system, tools }) {
  let llama = null;
  let model = null;
  let context = null;
  let session = null;
  let opening = null;      // the chat history with only the system prompt
  let saved = null;        // the conversation, kept across unloading
  let loading = null;
  let idleTimer = null;
  let download = null;     // { done, total, cancel } while downloading

  const file = () => path.join(dir, MODEL.file);
  const installed = () => {
    try { return fs.statSync(file()).size === MODEL.bytes; } catch { return false; }
  };

  // node-llama-cpp is loaded on first use; a failure here is reported, never thrown at start-up.
  const runtime = () => import('node-llama-cpp');

  function status() {
    return {
      name: MODEL.name,
      bytes: MODEL.bytes,
      installed: installed(),
      downloading: download ? { done: download.done, total: download.total } : null,
      loaded: !!session
    };
  }

  // Fetch the model. onProgress gets { done, total } in bytes. Resumes a download
  // that was cut off. Resolves true when the model is in place.
  async function fetchModel(onProgress) {
    if (installed()) return true;
    if (download) return download.promise;
    const { createModelDownloader } = await runtime();
    fs.mkdirSync(dir, { recursive: true });
    const downloader = await createModelDownloader({
      modelUri: MODEL.uri,
      dirPath: dir,
      fileName: MODEL.file,
      skipExisting: true,
      // Kept when cut off, so the next try carries on where this one stopped.
      deleteTempFileOnCancel: false,
      onProgress: ({ downloadedSize, totalSize }) => {
        if (!download) return;
        download.done = downloadedSize;
        download.total = totalSize || MODEL.bytes;
        onProgress({ done: download.done, total: download.total });
      }
    });
    download = { done: 0, total: MODEL.bytes, cancel: () => downloader.cancel() };
    download.promise = downloader.download()
      .then(() => installed())
      .finally(() => { download = null; });
    return download.promise;
  }

  function cancelDownload() {
    if (download) download.cancel();
  }

  function rest() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(unload, IDLE_MS);
  }

  async function unload() {
    clearTimeout(idleTimer);
    if (session) saved = session.getChatHistory();
    const c = context;
    const m = model;
    session = null;
    context = null;
    model = null;
    try { if (c) await c.dispose(); } catch {}
    try { if (m) await m.dispose(); } catch {}
  }

  async function load() {
    if (session) return session;
    if (loading) return loading;
    loading = (async () => {
      const { getLlama, LlamaChatSession } = await runtime();
      // The GPU where there is one (Metal, Vulkan), else the processor.
      if (!llama) llama = await getLlama({ gpu: 'auto' });
      model = await llama.loadModel({ modelPath: file() });
      context = await model.createContext({ contextSize: { max: CONTEXT } });
      session = new LlamaChatSession({ contextSequence: context.getSequence(), systemPrompt: system });
      if (!opening) opening = session.getChatHistory();
      if (saved) session.setChatHistory(saved);
      return session;
    })().finally(() => { loading = null; });
    return loading;
  }

  // Speak's tools as node-llama-cpp functions. `use` runs one and resolves to
  // its outcome ({ ok, result } or { ok: false, error }).
  async function functionsFor(use) {
    const { defineChatSessionFunction } = await runtime();
    return Object.fromEntries(tools.map((t) => [t.name, defineChatSessionFunction({
      description: t.description,
      params: Object.keys(t.input_schema.properties).length ? t.input_schema : undefined,
      handler: async (input) => {
        const outcome = await use(t.name, input || {});
        return outcome.ok ? outcome.result : { error: outcome.error };
      }
    })]));
  }

  // One question. onText gets his words as they come; use runs his tools.
  // Resolves to { text, full } where full means the conversation was too long
  // and has been started afresh.
  async function ask(text, { onText, use, signal }) {
    const s = await load();
    clearTimeout(idleTimer);
    let full = false;
    // Near the end of what it can keep in view: start a new conversation
    // rather than have the model forget the start of this one mid-answer.
    if (s.sequence.nextTokenIndex > context.contextSize * 0.75) {
      s.setChatHistory(opening);
      full = true;
    }
    const before = s.getChatHistory();
    try {
      const answer = await s.prompt(text, {
        functions: await functionsFor(use),
        maxTokens: MAX_ANSWER,
        // No hidden thinking: it makes a small model slow and adds little here.
        budgets: { thoughtTokens: 0 },
        signal,
        stopOnAbortSignal: true,
        onTextChunk: onText
      });
      // Hushed: the half-finished exchange is not kept.
      if (signal && signal.aborted) s.setChatHistory(before);
      return { text: answer, full };
    } catch (err) {
      s.setChatHistory(before);
      throw err;
    } finally {
      rest();
    }
  }

  return {
    status,
    fetchModel,
    cancelDownload,
    ask,
    unload,
    // ↺: a new conversation.
    reset() {
      saved = null;
      if (session && opening) session.setChatHistory(opening);
    }
  };
}
