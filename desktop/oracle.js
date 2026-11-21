// Speak: the reaper as an AI assistant. Runs in the main process so the API key
// never reaches the page. Most of his tools are his abilities, which the page
// runs; memory is kept here.
//
// He can borrow one of three minds: Claude (the user's API key), a local model
// through Ollama (free, on this computer), or none, in which case he still
// follows the plain commands in offline.js. Those commands are also what he
// falls back on when the chosen mind can't be reached.
import Anthropic from '@anthropic-ai/sdk';
import { parseCommand } from './offline.js';
import { chat, listModels, capabilities, OllamaError, SUGGESTED_MODEL } from './ollama.js';
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
- the Crypt, an idle game: souls are banked from ghosts caught, files reaped and finished hourglasses; souls raise skeletons, which dig up more souls on their own, even while the user is away. Every ghost caught in Summon is also bound in the Crypt as a spirit, which earns a soul an hour for good while there is room. The more souls the Crypt has ever gathered, the deeper it goes, and each depth adds 10% to all it earns. Souls also buy upgrades: Shovels (faster digging), Deeper vault (more away time counted), Urns (room for more spirits), Lantern (a longer, slower ghost hunt) and Bone bell (more golden ghosts). How many souls, skeletons or spirits they have, or what the upgrades are -> get_crypt. Raising skeletons -> raise_skeleton. Buying an upgrade -> buy_upgrade
- visual tricks they ask for (cut, break, glitch, swallow, burn or melt the screen, rip out a piece of it, a ghost game, music, hide) -> cast
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
const TOOL_DEFS = [
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
        enum: ['slash', 'shatter', 'glitch', 'vortex', 'burn', 'melt', 'soulrip', 'summon', 'hum', 'vanish'],
        description: 'slash: the scythe cuts the screen in two for a moment (visual only, nothing is changed). shatter: the screen breaks like glass from the cursor, falls away and mends (visual only). glitch: a second of Y2K digital corruption over the screen (visual only). vortex: a black hole at the cursor swallows the screen and spits it back (visual only). burn: the screen burns away from the edges and un-burns (visual only). melt: the screen drips down like wax and snaps back (visual only). soulrip: the patch of screen at the cursor tears off as a ghost and the reaper swallows it (visual only). summon: a 10-second game of catching ghosts across the screen. hum: starts or stops a dark music-box tune. vanish: the reaper fades into a corner for 30 minutes.'
      }
    }, ['ability'])
  },
  {
    name: 'get_harvest',
    description: "Today's tally (minutes active at the computer, hourglasses finished, ghosts caught, files reaped) and the current state: soul, running timer, pending reminders.",
    input_schema: object()
  },
  {
    name: 'get_crypt',
    description: 'The Crypt: souls banked, skeletons raised, spirits bound and their room, souls earned per hour, the upgrades and their next costs, and how Summon goes.',
    input_schema: object()
  },
  {
    name: 'raise_skeleton',
    description: 'Spend banked souls to raise skeletons, which dig up more souls on their own. Raises as many of `count` as the souls allow.',
    input_schema: object({ count: { type: 'integer', description: 'How many to raise, 1 to 50. Defaults to 1.' } })
  },
  {
    name: 'buy_upgrade',
    description: 'Spend banked souls on the next level of a Crypt upgrade: shovels (skeletons dig faster), vault (more away time counted), urns (room for 25 more spirits), lantern (Summon lasts longer and its ghosts drift slower) or bell (more golden ghosts in Summon).',
    input_schema: object({ upgrade: { type: 'string', enum: ['shovels', 'vault', 'urns', 'lantern', 'bell'], description: 'Which upgrade.' } }, ['upgrade'])
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
];
const CLAUDE_TOOLS = TOOL_DEFS.map((tool) => ({ ...tool, eager_input_streaming: true }));
// The same tools in the shape Ollama takes. A model that can't see gets no Look.
const localTools = (canSee) => TOOL_DEFS
  .filter((tool) => canSee || tool.name !== 'look_at_screen')
  .map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }));

const ALONE = ' Until then, say "help" to see what I can do alone.';
const NO_MIND = 'I have no mind to borrow for that. Say "help" to see what I can do alone, or give me one from the tray menu (Mind).';

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
  if (err instanceof Anthropic.APIError) {
    const reason = apiReason(err);
    if (/credit balance/i.test(reason)) {
      return { code: 'credit', message: 'Your Anthropic account is out of credit. Add some at console.anthropic.com (Plans & Billing), then ask again.' };
    }
    return { code: 'api', message: 'The other side said no (' + (err.status || 'error') + ')' + (reason ? ': ' + reason : '.') };
  }
  return { code: 'error', message: String((err && err.message) || err) };
}

// The API's own words for a refused request, e.g. "Your credit balance is too low…".
function apiReason(err) {
  const body = err.error;
  const message = body && body.error && typeof body.error.message === 'string' ? body.error.message : '';
  return message.slice(0, 300);
}

// The same for a local model that could not answer.
function describeLocal(err, model) {
  if (err && err.name === 'AbortError') return { code: 'stopped', message: 'Hushed.' };
  if (err instanceof OllamaError) {
    if (err.code === 'down') return { code: 'local', message: 'Ollama is not running. Start it (it is free at ollama.com), then ask again.' };
    if (err.code === 'empty') return { code: 'local', message: 'Ollama has no model yet. In a terminal, run: ollama pull ' + SUGGESTED_MODEL };
    if (err.code === 'missing') return { code: 'local', message: 'Ollama does not have "' + model + '". In a terminal, run: ollama pull ' + model };
    return { code: 'api', message: 'The local model failed: ' + err.message.slice(0, 300) };
  }
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

export function createOracle({ getKey, runTool, memory, getBrain = () => ({ kind: 'claude', model: null }) }) {
  let history = [];
  let controller = null;
  // Whose conversation `history` is. Claude and Ollama keep theirs in different
  // shapes, so changing minds starts a new one.
  let mind = '';

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
          tools: CLAUDE_TOOLS,
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

  // One tool call, for whichever mind asked. The page hears about it first.
  async function useTool(name, input, signal, emit) {
    emit({ type: 'tool', name, input });
    const local = localTool(name, input);
    if (local) return local;
    try {
      return await runTool(name, input, signal);
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) };
    }
  }

  // No mind could answer: carry the text out as a plain command if it is one,
  // or else say why nobody answered. Returns nothing; it ends the question.
  async function alone(text, signal, emit, otherwise) {
    const run = parseCommand(text);
    if (!run) return emit(otherwise);
    const reply = await run({ tool: (name, input) => useTool(name, input, signal, emit), memory });
    if (signal.aborted) return emit({ type: 'error', code: 'stopped', message: 'Hushed.' });
    emit({ type: 'delta', text: reply });
    emit({ type: 'done' });
  }

  async function askClaude(text, signal, emit) {
    let api;
    try {
      api = client();
    } catch {
      return alone(text, signal, emit, { type: 'error', code: 'key', message: 'I need a mind to answer that: an Anthropic API key, or a free local model.' });
    }
    // This question works on its own copy of the conversation and commits it
    // only when it finishes, so ↺ or Hush mid-answer can't leave a half-written
    // exchange (or holes) behind.
    const convo = history.slice();
    convo.push({ role: 'user', content: convo.length ? '[' + stamp() + '] ' + text : opening(text) });
    let acted = false;
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
          acted = true;
          const outcome = await useTool(use.name, use.input || {}, signal, emit);
          results.push({ type: 'tool_result', tool_use_id: use.id, content: resultContent(outcome), is_error: !outcome.ok });
        }
        if (signal.aborted) return emit({ type: 'error', ...describe(new Anthropic.APIUserAbortError()) });
        convo.push({ role: 'user', content: results });
        if (turn === MAX_TOOL_TURNS - 1) emit({ type: 'note', text: 'Enough spells for one breath.' });
      }
    } catch (err) {
      // No network: a plain command still works, unless he already acted on
      // this question (it must not run twice).
      const offline = err instanceof Anthropic.APIConnectionError && !(err instanceof Anthropic.APIUserAbortError);
      if (offline && !acted && !signal.aborted) {
        emit({ type: 'reset' });
        return alone(text, signal, emit, { type: 'error', ...describe(err) });
      }
      throw err;
    }
    // Kept only if nobody started a new conversation meanwhile.
    if (!signal.aborted) history = convo;
    emit({ type: 'done' });
  }

  // What each local model can do, asked once per model.
  const abilitiesOf = new Map();

  async function askLocal(text, wanted, signal, emit) {
    let model = wanted;
    let acted = false;
    try {
      if (!model) {
        const installed = await listModels();
        if (!installed.length) throw new OllamaError('empty', 'No models.');
        model = installed[0];
      }
      if (!abilitiesOf.has(model)) {
        const caps = await capabilities(model);
        if (caps) abilitiesOf.set(model, caps);
      }
      const caps = abilitiesOf.get(model) || null;
      // Unknown (an older Ollama): try tools, and do without if it refuses.
      let canTool = !caps || caps.includes('tools');
      const canSee = !!caps && caps.includes('vision');
      const convo = history.slice();
      if (!convo.length) {
        convo.push({ role: 'system', content: SYSTEM + (canSee ? '' : '\n\nThe model you run on here cannot see pictures, so you cannot look at the screen. Say so if asked.') });
        convo.push({ role: 'user', content: opening(text) });
        if (!canTool) emit({ type: 'note', text: model + ' can only talk; it cannot use my abilities.' });
      } else {
        convo.push({ role: 'user', content: '[' + stamp() + '] ' + text });
      }
      for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
        let answer;
        const request = () => chat({
          model, messages: convo, signal, tools: canTool ? localTools(canSee) : null,
          onText: (piece) => emit({ type: 'delta', text: piece })
        });
        try {
          answer = await request();
        } catch (err) {
          if (!(canTool && err instanceof OllamaError && err.code === 'api' && /does not support tools/i.test(err.message))) throw err;
          canTool = false;
          abilitiesOf.set(model, (caps || []).filter((c) => c !== 'tools'));
          emit({ type: 'note', text: model + ' can only talk; it cannot use my abilities.' });
          answer = await request();
        }
        const { content, toolCalls } = answer;
        if (!content && !toolCalls.length && turn === 0) {
          return emit({ type: 'error', code: 'api', message: 'The local model said nothing. Ask again.' });
        }
        const said = { role: 'assistant', content };
        if (toolCalls.length) said.tool_calls = toolCalls.map((c) => ({ function: { name: c.name, arguments: c.input } }));
        convo.push(said);
        if (!toolCalls.length) break;
        const pictures = [];
        for (const use of toolCalls) {
          if (signal.aborted) break;
          acted = true;
          const outcome = await useTool(use.name, use.input, signal, emit);
          convo.push({ role: 'tool', tool_name: use.name, content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }) });
          const match = outcome.ok && typeof outcome.image === 'string' ? IMAGE_URL.exec(outcome.image) : null;
          if (match) pictures.push(match[2]);
        }
        if (signal.aborted) return emit({ type: 'error', code: 'stopped', message: 'Hushed.' });
        if (pictures.length) convo.push({ role: 'user', content: '[The picture of the screen you asked to see.]', images: pictures });
        if (turn === MAX_TOOL_TURNS - 1) emit({ type: 'note', text: 'Enough spells for one breath.' });
      }
      if (!signal.aborted) {
        // A picture is looked at once, not sent again with every later question.
        history = convo.map((m) => (m.images ? { role: m.role, content: '[A picture of the screen was shown here.]' } : m));
      }
      emit({ type: 'done' });
    } catch (err) {
      if (signal.aborted) return emit({ type: 'error', code: 'stopped', message: 'Hushed.' });
      const told = { type: 'error', ...describeLocal(err, model) };
      const unreachable = err instanceof OllamaError && err.code !== 'api';
      if (!unreachable || acted) return emit(told);
      emit({ type: 'reset' });
      return alone(text, signal, emit, { ...told, message: told.message + ALONE });
    }
  }

  async function ask(text, send) {
    if (controller) return send({ type: 'error', code: 'busy', message: 'One question at a time.' });
    const brain = getBrain();
    const whose = brain.kind + ':' + (brain.model || '');
    if (whose !== mind) {
      mind = whose;
      history = [];
    }
    if (history.length > MAX_HISTORY) {
      history = [];
      send({ type: 'note', text: 'The old conversation is buried. Starting fresh.' });
    }
    const own = new AbortController();
    const { signal } = own;
    // After ↺, this question's last words (even "Hushed.") are not shown.
    const emit = (event) => {
      // His last word frees him for the next question before anyone hears it.
      if ((event.type === 'done' || event.type === 'error') && controller === own) controller = null;
      if (!own.forgotten) send(event);
    };
    controller = own;
    try {
      if (brain.kind === 'ollama') await askLocal(text, brain.model, signal, emit);
      else if (brain.kind === 'offline') {
        await alone(text, signal, emit, { type: 'error', code: 'alone', message: NO_MIND });
      } else await askClaude(text, signal, emit);
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
