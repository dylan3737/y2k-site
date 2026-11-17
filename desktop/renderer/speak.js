// Speak: a chat card above the reaper. The conversation runs in the main
// process (oracle.js); this only draws it.
import { el, chip } from './dom.js';

const TOOL_LINES = {
  set_hourglass: (i) => '✦ turns the hourglass' + (Number.isInteger(i.minutes) ? ': ' + i.minutes + ' min' : ''),
  stop_hourglass: () => '✦ stops the sand',
  send_raven: () => '✦ sends a raven',
  list_ravens: () => '✦ counts the ravens',
  cancel_raven: () => '✦ calls a raven back',
  cast: (i) => '✦ casts ' + (i.ability || 'something'),
  get_harvest: () => '✦ weighs the day',
  look_at_screen: () => '✦ asks to look at your screen',
  read_clipboard: () => '✦ asks to read what you copied',
  copy_to_clipboard: () => '✦ copies it for you',
  remember: (i) => '✦ remembers' + (typeof i.note === 'string' ? ': ' + i.note : ''),
  forget_memory: () => '✦ forgets something'
};

export function createSpeak(ctx) {
  const { companion, card, say } = ctx;
  const owner = {};
  let hasKey = false;
  // Whose mind he borrows: 'claude' (needs a key), 'ollama' or 'offline'.
  let mind = 'claude';
  const ready = () => mind !== 'claude' || hasKey;
  let busy = false;
  let current = null; // his line being written
  let reply = '';

  // Built once and kept, so closing the card doesn't lose the conversation.
  const box = el('div');
  box.style.display = 'contents';
  const head = el('h2', null, 'SPEAK');
  const tools = el('span', 'row');
  const fresh = el('button', 'card-x', '↺');
  fresh.type = 'button';
  fresh.title = 'New conversation';
  fresh.setAttribute('aria-label', 'New conversation');
  const close = el('button', 'card-x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  tools.append(fresh, close);
  head.appendChild(tools);

  const log = el('div', 'log');
  log.setAttribute('aria-live', 'polite');
  const keyForm = el('div');
  const input = el('textarea');
  input.rows = 2;
  input.placeholder = 'Ask the reaper…';
  input.maxLength = 4000;
  const foot = el('div', 'row');
  const hint = el('span', 'muted', 'Enter to send');
  hint.style.flex = '1';
  const send = chip('Send', null, 'solid');
  foot.append(hint, send);
  box.append(head, log, keyForm, input, foot);

  function scroll() {
    log.scrollTop = log.scrollHeight;
  }

  function line(kind, text) {
    const node = el('div', 'line ' + kind, text);
    log.appendChild(node);
    scroll();
    return node;
  }

  // Choosing a mind: paste a key for Claude, or take one of the free ways.
  function showKeyForm(message) {
    keyForm.replaceChildren();
    const p = el('p', 'muted', message || 'I need a mind to borrow. Paste an Anthropic API key (it is stored encrypted on this computer), or take a free one.');
    const field = el('input');
    field.type = 'password';
    field.placeholder = 'sk-ant-…';
    field.autocomplete = 'off';
    const save = chip('Save key', null, 'solid');
    const row = el('div', 'row end');
    row.append(chip('Free local model', useLocal), chip('Commands only', useNone), save);
    const submit = async () => {
      const key = field.value.trim();
      if (!key) return;
      const ok = await companion.setKey(key);
      if (ok) {
        hasKey = true;
        mind = 'claude';
        keyForm.replaceChildren();
        line('cast', '✦ the key is kept');
        input.focus();
      } else {
        p.textContent = 'This computer can’t encrypt the key, so it was not saved. Set ANTHROPIC_API_KEY before starting the app instead.';
      }
    };
    save.addEventListener('click', submit);
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    keyForm.append(p, field, row);
    card.refit();
    setTimeout(() => field.focus(), 30);
  }

  // A model on this computer, through Ollama. `quiet` leaves out the how-to
  // when he has just said what is wrong.
  function showLocal(local, quiet) {
    keyForm.replaceChildren();
    if (local && local.using) {
      line('cast', '✦ borrowing ' + local.using + ', on this computer');
      card.refit();
      input.focus();
      return;
    }
    if (!quiet) {
      const p = el('p', 'muted', local && local.running
        ? 'Ollama is running but has no model yet. In a terminal, run: '
        : 'A local model is free and never leaves this computer. Install Ollama from ollama.com, start it, then run in a terminal: ');
      // The command as typed: the card's lettering would show it in capitals.
      p.appendChild(el('code', null, 'ollama pull llama3.2'));
      keyForm.appendChild(p);
    }
    const row = el('div', 'row end');
    row.append(chip('Use a key', useKey), chip('Commands only', useNone), chip('Try again', useLocal, 'solid'));
    keyForm.appendChild(row);
    card.refit();
  }

  async function useLocal() {
    keyForm.replaceChildren(el('p', 'muted', 'Looking for Ollama…'));
    const status = await companion.brain({ kind: 'ollama' });
    mind = status.kind;
    showLocal(status.local);
  }

  async function useNone() {
    const status = await companion.brain({ kind: 'offline' });
    mind = status.kind;
    keyForm.replaceChildren();
    line('cast', '✦ no mind borrowed; say "help" for what he knows alone');
    card.refit();
    input.focus();
  }

  async function useKey() {
    const status = await companion.brain({ kind: 'claude' });
    mind = status.kind;
    hasKey = !!status.hasKey;
    if (hasKey) {
      keyForm.replaceChildren();
      line('cast', '✦ borrowing Claude');
      card.refit();
    } else {
      showKeyForm();
    }
  }

  function setBusy(on) {
    busy = on;
    send.textContent = on ? 'Hush' : 'Send';
  }

  function submit() {
    if (busy) {
      companion.speakStop();
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    line('you', text);
    current = line('him is-thinking', '');
    reply = '';
    setBusy(true);
    companion.speak(text);
  }

  send.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });
  close.addEventListener('click', () => card.close(owner));
  fresh.addEventListener('click', () => {
    companion.speakForget();
    log.replaceChildren();
    setBusy(false);
    current = null;
    input.focus();
  });

  // A finished reply of his gets a copy button.
  function seal(node) {
    node.classList.remove('is-thinking');
    const text = node.textContent;
    if (!text) {
      node.remove();
      return;
    }
    const copy = el('button', 'copy', 'copy');
    copy.type = 'button';
    copy.addEventListener('click', () => {
      companion.clipboardWrite(text);
      copy.textContent = 'copied';
      setTimeout(() => { copy.textContent = 'copy'; }, 1500);
    });
    node.appendChild(copy);
  }

  function finish() {
    if (current) seal(current);
    current = null;
    setBusy(false);
    // Closed while he answered: the start of the answer goes in his bubble.
    if (!card.isOpen(owner) && reply) {
      say(reply.length > 120 ? reply.slice(0, 117) + '…' : reply, 8000);
    }
  }

  companion.onSpeech((event) => {
    switch (event.type) {
      case 'delta':
        if (!current) current = line('him', '');
        current.classList.remove('is-thinking');
        current.textContent += event.text;
        reply += event.text;
        scroll();
        break;
      case 'reset':
        if (current) current.textContent = '';
        reply = '';
        break;
      case 'tool': {
        const describe = TOOL_LINES[event.name];
        // The spell goes below what he has said so far; his next words below it.
        if (current) seal(current);
        line('cast', describe ? describe(event.input || {}) : '✦ ' + event.name);
        current = line('him is-thinking', '');
        break;
      }
      case 'note':
        line('cast', '✦ ' + event.text);
        break;
      case 'done':
        finish();
        break;
      case 'error':
        if (current && !current.textContent) current.remove();
        current = null;
        if (event.code === 'key') {
          hasKey = false;
          showKeyForm(event.message);
        } else if (event.code === 'local') {
          line('oops', event.message);
          showLocal(null, true);
        } else {
          line('oops', event.message);
        }
        reply = '';
        finish();
        break;
    }
  });

  // Ask the user before he looks or reads. Resolves true only on Allow.
  const asking = new Set();

  function ask(question) {
    if (!card.isOpen(owner)) open();
    return new Promise((resolve) => {
      const node = el('div', 'ask');
      const row = el('div', 'row');
      let settled = false;
      const answer = (yes) => {
        if (settled) return;
        settled = true;
        asking.delete(answer);
        clearTimeout(timer);
        node.classList.add('is-answered');
        node.firstChild.textContent = question + (yes ? ' Allowed.' : ' Declined.');
        resolve(yes);
      };
      row.append(chip('Allow', () => answer(true), 'solid'), chip('Not now', () => answer(false)));
      node.append(el('span', null, question), row);
      // Above his line in progress, so the question reads in order.
      log.insertBefore(node, current && current.parentNode === log ? current : null);
      scroll();
      const timer = setTimeout(() => answer(false), 80000);
      asking.add(answer);
    });
  }

  // Hush or ↺ while he waits: every open question counts as declined.
  function cancelAsks() {
    [...asking].forEach((answer) => answer(false));
  }

  function open() {
    card.open(box, 'voice', owner, { focus: true });
    if (!ready() && !keyForm.childNodes.length && !log.childNodes.length) showKeyForm();
    scroll();
  }

  return {
    ask,
    cancelAsks,
    open,
    close() { card.close(owner); },
    isOpen: () => card.isOpen(owner),
    setHasKey(v) {
      hasKey = !!v;
      if (ready()) keyForm.replaceChildren();
    },
    setMind(kind) {
      mind = kind;
      if (ready()) keyForm.replaceChildren();
    }
  };
}
