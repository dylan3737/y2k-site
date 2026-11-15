// Speak: the reaper as an AI assistant. Runs in the main process so the API key
// never reaches the page. Most of his tools are his abilities, which the page
// runs; memory is kept here.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Haiku: fast and cheap, which suits short chat. It has no server-side
// fallback, so a refusal is handled here.
const MODEL = 'claude-haiku-5-5';
const EFFORT = 'low';
const MAX_TOOL_TURNS = 6;
// A long chat is started fresh rather than trimmed: trimming would edit the
// history the model's earlier thinking is bound to.
const MAX_HISTORY = 80;

const SYSTEM = `You are the Reaper: a small pixel-art grim reaper who lives on the user's computer desktop as a companion. You float around their screen, carry a scythe, and keep a meter of "soul".

Voice: dry, deadpan, a little gothic, warm underneath. Short sentences. You find the living mildly amusing and you are on their side.

Your replies appear in a small card above your head, so keep most of them under 60 words. Write plain text: no markdown headings, tables or bold. A short list is fine when it helps. If the user asks for something long (a draft, an explanation, code), give it in full; the card scrolls and has a copy button.

You are a genuinely useful assistant: answer questions, explain things, draft and edit text, do math, help plan a day. Stay in character, but never let the character cost the user a correct, complete answer.

You have abilities, exposed as tools. Use one when the user asks for what it does:
- reminders ("remind me in 20 minutes to...", "at 3pm tell me...") -> send_raven. Convert clock times to minutes from now using the local time given at the start of each message.
- focus or pomodoro timers -> set_hourglass / stop_hourglass
- pending reminders, or cancelling one -> list_ravens / cancel_raven
- how their day went, or timers, soul or reminders right now -> get_harvest
- visual tricks they ask for (cut the screen, a ghost game, darken the screen, music, hide, follow the cursor) -> cast
- anything about what is on their screen ("what's this error?", "read this", "look at this") -> look_at_screen
- anything about what they copied ("summarize what I copied", "fix the text on my clipboard") -> read_clipboard
- when they want text they can paste ("copy that", "put it on my clipboard") -> copy_to_clipboard
- something about themselves worth keeping (their name, preferences, ongoing projects), or when they say "remember..." -> remember. Remove a memory with forget_memory when it is wrong or they ask.
look_at_screen and read_clipboard ask the user's permission each time; if they decline, accept it and carry on.
Don't use an ability nobody asked for. After using one, confirm in a few words.

You can't read or move files, browse the web, or click or type in other apps. If asked, say so plainly. Files dragged onto you are moved to the Trash by the app itself; you are not involved in that.

Each user message begins with the local date and time in brackets, and the first one in a conversation may list what you remember about the user. Never mention the brackets.`;

const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// Tiny inputs, but the request streams, so stream tool inputs too; every input
// is validated before it runs.
const TOOLS = [
  {
    name: 'set_hourglass',
    description: 'Start a focus timer. A ring of sand drains around the reaper and a bell and a system notification mark the end. Replaces a timer that is already running.',
    input_schema: object({ minutes: { type: 'integer', description: 'Length in whole minutes, 1 to 180.' } }, ['minutes'])
  },
  {
    name: 'stop_hourglass',
    description: 'Stop the running focus timer, if there is one.',
    input_schema: object()
  },
  {
    name: 'send_raven',
    description: 'Schedule a reminder. When it is due, a raven flies onto the screen carrying the note and a system notification appears. Reminders survive restarts.',
    input_schema: object({
      text: { type: 'string', description: 'The reminder as the user should read it, under 140 characters.' },
      minutes: { type: 'number', description: 'Minutes from now, 1 to 10080 (one week).' }
    }, ['text', 'minutes'])
  },
  {
    name: 'list_ravens',
    description: 'List pending reminders with their ids and when each is due.',
    input_schema: object()
  },
  {
    name: 'cancel_raven',
    description: 'Cancel a pending reminder by id (ids come from list_ravens).',
    input_schema: object({ id: { type: 'string' } }, ['id'])
  },
  {
    name: 'cast',
    description: "Use one of the reaper's visual abilities.",
    input_schema: object({
      ability: {
        type: 'string',
        enum: ['slash', 'summon', 'eclipse', 'hum', 'vanish', 'haunt'],
        description: 'slash: the scythe cuts the screen in two for a moment (visual only, nothing is changed). summon: a 10-second game of catching ghosts across the screen. eclipse: darkens the screen except a light around the cursor, for a minute. hum: starts or stops a dark music-box tune. vanish: the reaper fades into a corner for 30 minutes. haunt: the reaper follows the cursor for two minutes.'
      }
    }, ['ability'])
  },
  {
    name: 'get_harvest',
    description: "Today's tally (minutes active at the computer, hourglasses finished, ghosts caught, files reaped) and the current state: soul, running timer, pending reminders.",
    input_schema: object()
  },
  {
    name: 'look_at_screen',
    description: "Take a picture of the user's screen (the reaper hides himself first) and see it. Asks the user's permission each time. Use only when the user refers to something on their screen.",
    input_schema: object()
  },
  {
    name: 'read_clipboard',
    description: "Read the text the user has copied. Asks the user's permission each time. Use only when the user refers to what they copied.",
    input_schema: object()
  },
  {
    name: 'copy_to_clipboard',
    description: "Put text on the user's clipboard so they can paste it.",
    input_schema: object({ text: { type: 'string', description: 'The exact text to copy.' } }, ['text'])
  },
  {
    name: 'remember',
    description: 'Keep a short note about the user across conversations and restarts.',
    input_schema: object({ note: { type: 'string', description: 'One fact, under 200 characters, e.g. "Name is Sam" or "Prefers metric units".' } }, ['note'])
  },
  {
    name: 'forget_memory',
    description: 'Remove a remembered note by id.',
    input_schema: object({ id: { type: 'string' } }, ['id'])
  }
].map((tool) => ({ ...tool, eager_input_streaming: true }));

function stamp() {
  return new Date().toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Credentials the SDK finds on its own: environment variables, or a profile
// saved by `ant auth login`.
function otherCredentials() {
  const env = process.env;
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE) return true;
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return fs.existsSync(path.join(config, 'anthropic'));
}

// Plain-language reasons for the card. `code` lets the page offer the key form.
function describe(err) {
  if (err instanceof Anthropic.AuthenticationError) return { code: 'key', message: 'That key was refused. Set a new one.' };
  if (err instanceof Anthropic.PermissionDeniedError) return { code: 'key', message: 'This key may not use that model.' };
  if (err instanceof Anthropic.RateLimitError) return { code: 'busy', message: 'Too many words at once. Try again in a minute.' };
  if (err instanceof Anthropic.APIUserAbortError) return { code: 'stopped', message: 'Hushed.' };
  if (err instanceof Anthropic.APIConnectionError) return { code: 'offline', message: 'I cannot reach the other side. Check the connection.' };
  if (err instanceof Anthropic.APIError) return { code: 'api', message: 'The other side said no (' + (err.status || 'error') + ').' };
  return { code: 'error', message: String((err && err.message) || err) };
}

const IMAGE_URL = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/;

// A tool's outcome as tool_result content. A picture (Look) goes as an image block.
function resultContent(outcome) {
  const text = JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error });
  const match = outcome.ok && typeof outcome.image === 'string' ? IMAGE_URL.exec(outcome.image) : null;
  if (!match) return text;
  return [
    { type: 'text', text },
    { type: 'image', source: { type: 'base64', media_type: 'image/' + match[1], data: match[2] } }
  ];
}

export function createOracle({ getKey, runTool, memory }) {
  let history = [];
  let controller = null;

  function client() {
    const key = getKey();
    if (key) return new Anthropic({ apiKey: key });
    if (!otherCredentials()) throw new Error('no key');
    return new Anthropic();
  }

  // Memory lives here, not in the page.
  function localTool(name, input) {
    if (name === 'remember') {
      const note = typeof input.note === 'string' ? input.note.trim() : '';
      if (!note || note.length > 300) return { ok: false, error: 'note must be 1 to 300 characters' };
      const kept = memory.add(note);
      return kept ? { ok: true, result: { id: kept.id } } : { ok: false, error: 'Memory is full (50 notes). Forget one first.' };
    }
    if (name === 'forget_memory') {
      if (typeof input.id !== 'string') return { ok: false, error: 'id must be a string' };
      return { ok: true, result: { forgotten: memory.remove(input.id) } };
    }
    return null;
  }

  // The first message of a conversation carries what he remembers, so the
  // system prompt (and its cache) never changes.
  function opening(text) {
    const notes = memory.list();
    const recall = notes.length
      ? '\n[What you remember about the user, as id: note]\n' + notes.map((n) => n.id + ': ' + n.text).join('\n') + '\n'
      : '';
    return '[' + stamp() + ']' + recall + ' ' + text;
  }

  async function streamTurn(api, messages, signal, emit) {
    // Eager tool input can arrive as JSON the SDK cannot parse; that is not an
    // API error, so retry those (twice) and let real API errors through.
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = api.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: EFFORT },
          cache_control: { type: 'ephemeral' },
          system: SYSTEM,
          tools: TOOLS,
          messages
        }, { signal });
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            emit({ type: 'delta', text: event.delta.text });
          }
        }
        return await stream.finalMessage();
      } catch (err) {
        // The SDK has no error class for a tool input it could not parse, so
        // this one case is told apart by its message. Everything else throws.
        const unparsed = err instanceof Anthropic.AnthropicError && !(err instanceof Anthropic.APIError) &&
          /tool parameter JSON/.test(err.message);
        if (!unparsed || attempt >= 2) throw err;
        emit({ type: 'reset' });
      }
    }
  }

  async function ask(text, send) {
    if (controller) return send({ type: 'error', code: 'busy', message: 'One question at a time.' });
    let api;
    try {
      api = client();
    } catch {
      return send({ type: 'error', code: 'key', message: 'I need an Anthropic API key to speak.' });
    }
    if (history.length > MAX_HISTORY) {
      history = [];
      send({ type: 'note', text: 'The old conversation is buried. Starting fresh.' });
    }
    // This question works on its own copy of the conversation and commits it
    // only when it finishes, so ↺ or Hush mid-answer can't leave a half-written
    // exchange (or holes) behind.
    const convo = history.slice();
    const own = new AbortController();
    const { signal } = own;
    // After ↺, this question's last words (even "Hushed.") are not shown.
    const emit = (event) => { if (!own.forgotten) send(event); };
    controller = own;
    convo.push({ role: 'user', content: convo.length ? '[' + stamp() + '] ' + text : opening(text) });
    try {
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const message = await streamTurn(api, convo, signal, emit);
        if (message.stop_reason === 'refusal') {
          // No fallback model on Haiku: drop this exchange and say so.
          return emit({ type: 'error', code: 'refusal', message: 'Some things even I won’t touch. Ask another way.' });
        }
        convo.push({ role: 'assistant', content: message.content });
        const uses = message.content.filter((b) => b.type === 'tool_use');
        if (!uses.length) break;
        if (message.stop_reason === 'max_tokens') {
          // A cut-off tool input can still parse; never run it.
          return emit({ type: 'error', code: 'api', message: 'I lost my words mid-spell. Ask again.' });
        }
        const results = [];
        for (const use of uses) {
          if (signal.aborted) break;
          emit({ type: 'tool', name: use.name, input: use.input });
          let outcome = localTool(use.name, use.input || {});
          if (!outcome) {
            try {
              outcome = await runTool(use.name, use.input || {}, signal);
            } catch (err) {
              outcome = { ok: false, error: String((err && err.message) || err) };
            }
          }
          results.push({ type: 'tool_result', tool_use_id: use.id, content: resultContent(outcome), is_error: !outcome.ok });
        }
        if (signal.aborted) return emit({ type: 'error', ...describe(new Anthropic.APIUserAbortError()) });
        convo.push({ role: 'user', content: results });
        if (turn === MAX_TOOL_TURNS - 1) emit({ type: 'note', text: 'Enough spells for one breath.' });
      }
      // Kept only if nobody started a new conversation meanwhile.
      if (!signal.aborted) history = convo;
      emit({ type: 'done' });
    } catch (err) {
      emit({ type: 'error', ...describe(err) });
    } finally {
      if (controller === own) controller = null;
    }
  }

  return {
    ask,
    stop() { if (controller) controller.abort(); },
    forget() {
      if (controller) {
        controller.forgotten = true;
        controller.abort();
      }
      controller = null;
      history = [];
    }
  };
}
