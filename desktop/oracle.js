// Speak: the reaper as an AI assistant. Runs in the main process so the API key
// never reaches the page. His abilities are tools; the page runs them.
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MODEL = 'claude-opus-5-5';
const MAX_TOOL_TURNS = 6;
// A long chat is started fresh rather than trimmed: trimming would edit the
// history the model's earlier thinking is bound to.
const MAX_HISTORY = 80;

const SYSTEM = `You are the Reaper: a small pixel-art grim reaper who lives on the user's computer desktop as a companion. You float around their screen, carry a scythe, and keep a meter of "soul".

Voice: dry, deadpan, a little gothic, warm underneath. Short sentences. You find the living mildly amusing and you are on their side.

Your replies appear in a small card above your head, so keep most of them under 60 words. Write plain text: no markdown headings, tables or bold. A short list is fine when it helps. If the user asks for something long (a draft, an explanation, code), give it in full; the card scrolls.

You are a genuinely useful assistant: answer questions, explain things, draft and edit text, do math, help plan a day. Stay in character, but never let the character cost the user a correct, complete answer.

You have abilities, exposed as tools. Use one when the user asks for what it does:
- reminders ("remind me in 20 minutes to...", "at 3pm tell me...") -> send_raven. Convert clock times to minutes from now using the local time given at the start of each message.
- focus or pomodoro timers -> set_hourglass / stop_hourglass
- what reminders are pending, or cancelling one -> list_ravens / cancel_raven
- how their day went, or anything about timers, soul or reminders right now -> get_harvest
- visual tricks they ask for (cut the screen, a ghost game, darken the screen, music, hide) -> cast
Don't use an ability nobody asked for. After using one, confirm in a few words.

You can't see the screen, read or move files, browse the web, or control other apps. If asked, say so plainly. Files dragged onto you are moved to the Trash by the app itself; you are not involved in that.

Each user message begins with the local date and time in brackets. Never mention the brackets.`;

// Tiny inputs, but the request streams, so stream tool inputs too; every input
// is validated by the page before it runs.
const TOOLS = [
  {
    name: 'set_hourglass',
    description: 'Start a focus timer. A ring of sand drains around the reaper and a bell and a system notification mark the end. Replaces a timer that is already running.',
    input_schema: {
      type: 'object',
      properties: { minutes: { type: 'integer', description: 'Length in whole minutes, 1 to 180.' } },
      required: ['minutes'],
      additionalProperties: false
    }
  },
  {
    name: 'stop_hourglass',
    description: 'Stop the running focus timer, if there is one.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'send_raven',
    description: 'Schedule a reminder. When it is due, a raven flies onto the screen carrying the note and a system notification appears. Reminders survive restarts.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The reminder as the user should read it, under 140 characters.' },
        minutes: { type: 'number', description: 'Minutes from now, 1 to 10080 (one week).' }
      },
      required: ['text', 'minutes'],
      additionalProperties: false
    }
  },
  {
    name: 'list_ravens',
    description: 'List pending reminders with their ids and when each is due.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'cancel_raven',
    description: 'Cancel a pending reminder by id (ids come from list_ravens).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false
    }
  },
  {
    name: 'cast',
    description: "Use one of the reaper's visual abilities.",
    input_schema: {
      type: 'object',
      properties: {
        ability: {
          type: 'string',
          enum: ['slash', 'summon', 'eclipse', 'hum', 'vanish'],
          description: 'slash: the scythe cuts the screen in two for a moment (visual only, nothing is changed). summon: a 10-second game of catching ghosts across the screen. eclipse: darkens the screen except a light around the cursor, for a minute. hum: starts or stops a dark music-box tune. vanish: the reaper fades into a corner for 30 minutes.'
        }
      },
      required: ['ability'],
      additionalProperties: false
    }
  },
  {
    name: 'get_harvest',
    description: "Today's tally (minutes active at the computer, hourglasses finished, ghosts caught, files reaped) and the current state: soul, running timer, pending reminders.",
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  }
].map((tool) => ({ ...tool, eager_input_streaming: true }));

function stamp() {
  return new Date().toLocaleString(undefined, {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
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

// Credentials the SDK finds on its own: environment variables, or a profile
// saved by `ant auth login`.
function otherCredentials() {
  const env = process.env;
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE) return true;
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return fs.existsSync(path.join(config, 'anthropic'));
}

export function createOracle({ getKey, runTool }) {
  let history = [];
  let controller = null;

  function client() {
    const key = getKey();
    if (key) return new Anthropic({ apiKey: key });
    if (!otherCredentials()) throw new Error('no key');
    return new Anthropic();
  }

  async function streamTurn(api, emit) {
    // Eager tool input can arrive as JSON the SDK cannot parse; that is not an
    // API error, so retry those (twice) and let real API errors through.
    for (let attempt = 0; ; attempt++) {
      try {
        const stream = api.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low' },
          cache_control: { type: 'ephemeral' },
          system: SYSTEM,
          tools: TOOLS,
          messages: history
        }, { signal: controller.signal });
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

  async function ask(text, emit) {
    if (controller) return emit({ type: 'error', code: 'busy', message: 'One question at a time.' });
    let api;
    try {
      api = client();
    } catch {
      return emit({ type: 'error', code: 'key', message: 'I need an Anthropic API key to speak.' });
    }
    if (history.length > MAX_HISTORY) {
      history = [];
      emit({ type: 'note', text: 'The old conversation is buried. Starting fresh.' });
    }
    const before = history.length;
    controller = new AbortController();
    history.push({ role: 'user', content: '[' + stamp() + '] ' + text });
    try {
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        const message = await streamTurn(api, emit);
        if (message.stop_reason === 'refusal') {
          // The whole fallback chain declined. Start clean rather than carry it.
          history = [];
          return emit({ type: 'error', code: 'refusal', message: 'Some things even I won’t touch. (Conversation reset.)' });
        }
        history.push({ role: 'assistant', content: message.content });
        const uses = message.content.filter((b) => b.type === 'tool_use');
        if (!uses.length) break;
        if (message.stop_reason === 'max_tokens') {
          // A cut-off tool input can still parse; never run it.
          history.length = before;
          return emit({ type: 'error', code: 'api', message: 'I lost my words mid-spell. Ask again.' });
        }
        const results = [];
        for (const use of uses) {
          emit({ type: 'tool', name: use.name, input: use.input });
          let outcome;
          try {
            outcome = await runTool(use.name, use.input);
          } catch (err) {
            outcome = { ok: false, error: String(err && err.message || err) };
          }
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }),
            is_error: !outcome.ok
          });
        }
        history.push({ role: 'user', content: results });
        if (turn === MAX_TOOL_TURNS - 1) emit({ type: 'note', text: 'Enough spells for one breath.' });
      }
      emit({ type: 'done' });
    } catch (err) {
      history.length = before;
      emit({ type: 'error', ...describe(err) });
    } finally {
      controller = null;
    }
  }

  return {
    ask,
    stop() { if (controller) controller.abort(); },
    forget() { if (controller) controller.abort(); history = []; }
  };
}
