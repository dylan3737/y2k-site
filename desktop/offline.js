// Speak without a model: a handful of plain commands he understands on his
// own. They cover his useful abilities (reminders, timers, the tally, memory,
// the screen tricks), so he is still worth talking to with no key, no local
// model and no network.
//
// parseCommand(text) returns null when the text is not a command, or a
// function that carries it out: run({ tool, memory }) resolves to his reply.
// `tool(name, input)` is the same tool runner the models use.

export const HELP = [
  'Without a mind to borrow, I still know these:',
  '• remind me in 20 minutes to check the oven',
  '• remind me at 3pm to call Sam',
  '• reminders / cancel reminder oven',
  '• 25 minute timer / stop timer',
  '• how did today go',
  '• crypt / raise a skeleton / raise 3 skeletons',
  '• upgrades / buy shovels (or graves, sand, lure) / milestones',
  '• remember I like tea / what do you remember / forget tea',
  '• play Blue Monday by New Order / play the album Discovery / start a radio for this song',
  '• pause / next song / what\'s playing',
  '• open Spotify / go to youtube.com / search for pixel art',
  '• find resume',
  '• prs / issues / did ci pass / notifications (GitHub)',
  '• work on yourself: make the ghosts slower (or: work on yourself with Claude: …)',
  '• slash, shatter, glitch, vortex, burn, melt, soul rip, summon, hum, vanish'
].join('\n');

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90
};
const NUMBER = '(\\d+(?:\\.\\d+)?|' + Object.keys(WORD_NUMBERS).join('|') + ')';
const UNIT = '(seconds?|secs?|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?)';
const UNIT_MINUTES = { s: 1 / 60, m: 1, h: 60, d: 1440, w: 10080 };

const number = (word) => (word.toLowerCase() in WORD_NUMBERS ? WORD_NUMBERS[word.toLowerCase()] : parseFloat(word));
const unitMinutes = (unit) => UNIT_MINUTES[unit[0].toLowerCase()];

// "20 minutes", "an hour", "1 hour 30 minutes", "half an hour" -> minutes.
// Returns { minutes, phrase } for the first duration in the text, or null.
function duration(text) {
  const half = /\bhalf an? hour\b/i.exec(text);
  if (half) return { minutes: 30, phrase: half[0] };
  const m = new RegExp('\\b' + NUMBER + '[\\s-]*' + UNIT + '\\b(?:\\s*(?:and\\s+)?' + NUMBER + '[\\s-]*' + UNIT + '\\b)?', 'i').exec(text);
  if (!m) return null;
  let minutes = number(m[1]) * unitMinutes(m[2]);
  if (m[3]) minutes += number(m[3]) * unitMinutes(m[4]);
  return { minutes, phrase: m[0] };
}

// "at 3pm", "at 15:30", "tomorrow at 9", "tomorrow" -> minutes from now.
function clockTime(text, now) {
  const m = /\b(tomorrow\s+)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(\s+tomorrow)?\b/i.exec(text) ||
    /\b(tomorrow)()()()()\b/i.exec(text);
  if (!m) return null;
  const tomorrow = !!(m[1] || m[5]);
  const at = new Date(now);
  if (m[2]) {
    let hour = parseInt(m[2], 10);
    const minute = m[3] ? parseInt(m[3], 10) : 0;
    const half = m[4] ? m[4][0].toLowerCase() : '';
    if (hour > 23 || minute > 59 || (half && (hour < 1 || hour > 12))) return null;
    if (half === 'p' && hour < 12) hour += 12;
    if (half === 'a' && hour === 12) hour = 0;
    at.setHours(hour, minute, 0, 0);
    // "at 3" with no am or pm means the next 3 o'clock.
    if (!half && !tomorrow && hour < 12 && at <= now) at.setHours(hour + 12);
  } else {
    at.setHours(9, 0, 0, 0);
  }
  if (tomorrow || at <= now) at.setDate(at.getDate() + 1);
  return { minutes: (at - now) / 60000, phrase: m[0] };
}

const clock = (date) => date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function span(minutes) {
  if (minutes < 60) return Math.round(minutes) + ' min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}

const failed = (outcome) => 'It would not take: ' + (outcome.error || 'something went wrong') + '.';

// --- The commands -------------------------------------------------------------
function reminder(original, now) {
  // Read from his words as typed, so the note keeps its capitals.
  const text = original.trim().replace(/\s+/g, ' ');
  if (!/^(please\s+)?(remind me|set a reminder|reminder)\b/i.test(text)) return null;
  let rest = text.replace(/^(please\s+)?(remind me|set a reminder|reminder)\b[:,]?\s*/i, '');
  const inTime = /\bin\s+/.test(rest) ? duration(rest) : null;
  const when = inTime || clockTime(rest, now) || duration(rest);
  if (!when) return async () => 'When? Try: remind me in 20 minutes to check the oven.';
  rest = rest.replace(new RegExp('\\b(in\\s+)?' + when.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  const note = rest.replace(/\s+/g, ' ').trim().replace(/^(to|that|about)\s+/i, '').replace(/[\s,.!]+$/, '');
  const minutes = Math.max(1, Math.round(when.minutes));
  if (minutes > 10080) return async () => 'A week is as far as a raven flies.';
  return async ({ tool }) => {
    const label = note ? note[0].toUpperCase() + note.slice(1) : 'Reminder';
    const out = await tool('send_raven', { text: label.slice(0, 140), minutes });
    if (!out.ok) return failed(out);
    return 'A raven flies in ' + span(minutes) + ' (' + out.result.due + '): ' + label + '.';
  };
}

function reminders(text) {
  if (/^(cancel|delete|remove|call back)\b.*\b(reminders?|ravens?)\b/.test(text)) {
    const which = text.replace(/^(cancel|delete|remove|call back)\b\s*(the|my|all|every)?\s*(reminders?|ravens?)\b\s*(about|for|to|called)?\s*/, '').trim();
    const all = /\b(all|every)\b/.test(text);
    return async ({ tool }) => {
      const listed = await tool('list_ravens', {});
      if (!listed.ok) return failed(listed);
      const pending = listed.result;
      if (!pending.length) return 'No ravens are waiting.';
      const chosen = all ? pending
        : which ? pending.filter((r) => r.text.toLowerCase().includes(which))
          : pending.length === 1 ? pending : [];
      if (!chosen.length) {
        return (which ? 'No raven carries that. ' : 'Which one? ') + 'Waiting: ' + pending.map((r) => r.text).join('; ') + '.';
      }
      for (const r of chosen) await tool('cancel_raven', { id: r.id });
      return chosen.length === 1 ? 'Called back: ' + chosen[0].text + '.' : chosen.length + ' ravens called back.';
    };
  }
  if (/^((list|show|what are)\s+)?(my\s+|the\s+)?(pending\s+)?(reminders|ravens)\??$/.test(text)) {
    return async ({ tool }) => {
      const listed = await tool('list_ravens', {});
      if (!listed.ok) return failed(listed);
      if (!listed.result.length) return 'No ravens are waiting.';
      return listed.result.map((r) => '• ' + r.text + ' (' + r.due + ')').join('\n');
    };
  }
  return null;
}

function timer(text) {
  const names = '(timer|hourglass|pomodoro|focus)';
  if (new RegExp('^(stop|cancel|end|clear)\\b.*\\b' + names + '\\b').test(text)) {
    return async ({ tool }) => {
      const out = await tool('stop_hourglass', {});
      if (!out.ok) return failed(out);
      return out.result.stopped ? 'The sand is still.' : 'No sand was running.';
    };
  }
  if (!new RegExp('\\b' + names + '\\b').test(text) || text.split(/\s+/).length > 10) return null;
  const length = duration(text);
  const minutes = length ? Math.round(length.minutes) : /\bpomodoro\b/.test(text) ? 25 : null;
  if (minutes === null) return async () => 'How long? Try: 25 minute timer.';
  if (minutes < 1 || minutes > 180) return async () => 'The hourglass holds 1 to 180 minutes.';
  return async ({ tool }) => {
    const out = await tool('set_hourglass', { minutes });
    if (!out.ok) return failed(out);
    return 'The sand runs: ' + span(minutes) + ', until ' + out.result.endsAt + '.';
  };
}

function tally(text) {
  if (!/\bhow (did|was|is|has) (today|my day)\b|^(tally|harvest|stats|status)\??$|\bhow am i doing\b/.test(text)) return null;
  return async ({ tool }) => {
    const out = await tool('get_harvest', {});
    if (!out.ok) return failed(out);
    const h = out.result;
    const lines = [
      span(h.activeMinutes) + ' at the computer.',
      h.hourglasses + ' hourglass' + (h.hourglasses === 1 ? '' : 'es') + ' finished, ' + h.ghostsCaught + ' ghost' + (h.ghostsCaught === 1 ? '' : 's') +
        ' caught, ' + h.filesReaped + ' file' + (h.filesReaped === 1 ? '' : 's') + ' reaped.',
      'Soul at ' + h.soul + '.'
    ];
    if (h.hourglassMinutesLeft !== null) lines.push(h.hourglassMinutesLeft + ' min of sand left.');
    if (h.pendingReminders) lines.push(h.pendingReminders + ' raven' + (h.pendingReminders === 1 ? '' : 's') + ' waiting.');
    return lines.join('\n');
  };
}

const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

function cryptwork(text) {
  const rise = new RegExp('^(raise|summon|buy|wake)\\s+(?:' + NUMBER + '\\s+)?(more\\s+)?skeletons?$').exec(text);
  if (rise) {
    const count = rise[2] ? Math.round(number(rise[2])) : 1;
    return async ({ tool }) => {
      const out = await tool('raise_skeleton', { count: Math.max(1, Math.min(50, count)) });
      if (!out.ok) return out.error || 'They would not rise.';
      return plural(out.result.raised, 'skeleton') + ' risen. ' + plural(out.result.souls, 'soul') + ' left.';
    };
  }
  const shop = /^(buy|upgrade|get|sharpen|deepen)\s+(the\s+|my\s+|a\s+)?(sharper\s+|deeper\s+|finer\s+|ghost\s+)?(shovels?|graves?|sand|lures?)$/.exec(text);
  if (shop) {
    const upgrade = { sh: 'shovels', gr: 'graves', sa: 'sand', lu: 'lure' }[shop[4].slice(0, 2)];
    return async ({ tool }) => {
      const out = await tool('buy_upgrade', { upgrade });
      if (!out.ok) return out.error || 'It could not be bought.';
      return out.result.bought + ', level ' + out.result.level + '. ' + plural(out.result.souls, 'soul') + ' left.';
    };
  }
  if (/^((show|list)\s+)?(my\s+|the\s+)?(upgrades|milestones)\??$/.test(text)) {
    const wanted = /upgrades/.test(text) ? 'upgrades' : 'milestones';
    return async ({ tool }) => {
      const out = await tool('get_crypt', {});
      if (!out.ok) return failed(out);
      const c = out.result;
      if (wanted === 'milestones') {
        return [c.milestonesReached + ' milestones reached.', ...c.nextMilestones.map((m) => '• ' + m)].join('\n');
      }
      return c.upgrades.map((u) => '• ' + u.name + ' ' + u.level + '/' + u.max + (u.cost === null ? ' (done)' : ': ' + u.cost + ' souls for ' + u.next)).join('\n');
    };
  }
  if (!/^((show|open)\s+)?(my\s+|the\s+)?(crypt|horde|souls|skeletons|minions)\??$|^how many (souls|skeletons)\b/.test(text)) return null;
  return async ({ tool }) => {
    const out = await tool('get_crypt', {});
    if (!out.ok) return failed(out);
    const c = out.result;
    return [
      'The crypt holds ' + plural(c.souls, 'soul') + '.',
      c.skeletons ? plural(c.skeletons, 'skeleton') + ' digging: ' + c.perHour + ' souls an hour.' : 'No skeletons yet.',
      'The next one costs ' + c.nextCost + '.'
    ].join('\n');
  };
}

function remembering(text, original) {
  if (/^what do you (remember|know)\b|^(memories|memory)\??$/.test(text)) {
    return async ({ memory }) => {
      const notes = memory.list();
      return notes.length ? notes.map((n) => '• ' + n.text).join('\n') : 'Nothing yet. Tell me: remember I like tea.';
    };
  }
  // "remember I like tea", or "my name is Sam, remember that".
  const keep = /^(please\s+)?remember\s+(that\s+)?(.+)$/i.exec(original.trim()) ||
    /^()()(.+?)[\s,;.!-]+(please\s+)?remember\s+(that|this|it)[\s.!]*$/i.exec(original.trim());
  if (keep) {
    const note = keep[3].replace(/[\s.]+$/, '');
    return async ({ tool }) => {
      const out = await tool('remember', { note: note[0].toUpperCase() + note.slice(1) });
      return out.ok ? 'Kept.' : failed(out);
    };
  }
  const drop = /^forget\s+(that\s+)?(.+)$/.exec(text);
  if (drop) {
    const which = drop[2].replace(/[\s.]+$/, '').replace(/^(about|my)\s+/, '');
    return async ({ tool, memory }) => {
      const notes = memory.list();
      const all = /^(everything|all|it all)$/.test(which);
      const chosen = all ? notes.slice() : notes.filter((n) => n.text.toLowerCase().includes(which));
      if (!chosen.length) return notes.length ? 'I hold no memory of that.' : 'I remember nothing as it is.';
      for (const n of chosen) await tool('forget_memory', { id: n.id });
      return chosen.length === 1 ? 'Forgotten: ' + chosen[0].text + '.' : chosen.length + ' memories forgotten.';
    };
  }
  return null;
}

// The computer and the web: open an app or a site, search, find a file. With
// no mind to read a search, he opens it in the browser instead.
const NOT_APPS = /^(the )?(crypt|speak|ring|hourglass|raven|menu|card)$/;
function reaching(text, original) {
  const self = /^(?:work on|improve|change|upgrade|fix) (?:yourself|your code)(?: with (claude(?: code)?)(?: (haiku|sonnet|opus))?)?[:,]?\s+(.+)$/.exec(text);
  if (self) {
    const request = original.trim().replace(/^[^:,]*?(yourself|your code)(\s+with\s+claude(\s+code)?(\s+(haiku|sonnet|opus))?)?[:,]?\s+/i, '');
    return async ({ tool }) => {
      const out = await tool('work_on_myself', { request, engine: self[1] ? 'claude' : 'local', ...(self[2] ? { model: self[2] } : {}) });
      return out.ok ? 'A Terminal opens. Watch me work, on ' + out.result.branch + '.' : out.error || 'I could not.';
    };
  }
  // GitHub, read only: anything that changes it goes through a mind, and asks.
  const gh = (input, line) => async ({ tool }) => {
    const out = await tool('github_read', input);
    return out.ok ? line(out.result) : out.error || 'GitHub would not answer.';
  };
  const list = (items, show) => (items.length ? items.slice(0, 8).map((x) => '• ' + show(x)).join('\n') : 'None.');
  if (/^(any |show |list |my )?(open )?(prs|pull requests)\??$/.test(text)) return gh({ what: 'prs' }, (r) => list(r.pullRequests, (p) => '#' + p.number + ' ' + p.title));
  if (/^(any |show |list |my )?(open )?issues\??$/.test(text)) return gh({ what: 'issues' }, (r) => list(r.issues, (i) => '#' + i.number + ' ' + i.title));
  if (/^(did (the )?ci pass|ci|ci status|how(('|’)s| is) ci|(show |list )?(ci )?runs)\??$/.test(text)) {
    return gh({ what: 'runs' }, (r) => list(r.runs, (x) => x.title + ': ' + (x.result || x.status) + (x.branch ? ' (' + x.branch + ')' : '')));
  }
  if (/^(list |show )?(my )?(github )?repos(itories)?\??$/.test(text)) return gh({ what: 'repos' }, (r) => list(r.repositories, (x) => x.repo + (x.private ? ' (private)' : '')));
  if (/^(github )?notifications\??$/.test(text)) return gh({ what: 'notifications' }, (r) => list(r.notifications, (x) => x.repo + ': ' + x.title));
  // The user's own spelling of the last words, for what goes to a search.
  const words = (part) => original.trim().replace(/[!.?]+$/, '').replace(/\s+on spotify$/i, '').split(/\s+/).slice(-part.split(' ').length).join(' ');
  const music = (input, line) => async ({ tool }) => {
    const out = await tool('spotify', input);
    if (!out.ok) return out.error || 'Spotify would not answer.';
    return line(out.result);
  };
  if (/^(pause|stop)( the)?( music| song| spotify)?$/.test(text)) return music({ action: 'pause' }, () => 'Silence.');
  if (/^(next|skip)( song| track| this)?$/.test(text)) return music({ action: 'next' }, (r) => (r.playing ? 'Now: ' + r.playing + '.' : 'Skipped.'));
  if (/^(previous|go back)( a)?( song| track)?$|^last song$/.test(text)) return music({ action: 'previous' }, (r) => (r.playing ? 'Now: ' + r.playing + '.' : 'Back one.'));
  if (/^what('|’)?s (playing|this song)\??$|^what (song )?is (playing|this)\??$/.test(text)) return music({ action: 'now_playing' }, (r) => r.playing);
  if (/^(play|resume)( (the|some))?( music| spotify)?$/.test(text)) return music({ action: 'play' }, (r) => (r.playing ? 'Now: ' + r.playing + '.' : 'Playing.'));
  const radio = /^(?:start|play|put on)\s+(?:a\s+|the\s+)?(?:song\s+)?radio\s+(?:for|of|from|like)\s+(.+)$/.exec(text);
  if (radio) return music({ action: 'play', query: words(radio[1]), kind: 'radio' }, (r) => 'A radio of ' + r.radio + '.');
  const play = /^play\s+(.+?)(?:\s+on spotify)?$/.exec(text);
  if (play && !/^(a |your |me a )?(tune|song for me)$/.test(play[1])) {
    const query = words(play[1]);
    return music({ action: 'play', query }, (r) => (r.radio ? 'A radio of ' + r.radio + '.' : 'Now: ' + r.playing + '.'));
  }
  const search = /^(?:search(?: the web| online)?(?: for)?|google|look up|bing)\s+(.+)$/.exec(text);
  if (search) {
    const q = original.trim().replace(/[!.]+$/, '').split(/\s+/).slice(original.trim().split(/\s+/).length - search[1].split(' ').length).join(' ');
    return async ({ tool }) => {
      const out = await tool('open_url', { url: 'https://duckduckgo.com/?q=' + encodeURIComponent(q) });
      return out.ok ? 'Searching for ' + q + '.' : out.error || 'I could not.';
    };
  }
  const site = /^(?:go to|open|visit|show me)\s+((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)$/.exec(text);
  if (site) {
    const url = /^https?:/.test(site[1]) ? site[1] : 'https://' + site[1];
    return async ({ tool }) => {
      const out = await tool('open_url', { url });
      return out.ok ? 'There.' : out.error || 'I could not.';
    };
  }
  const app = /^(?:open|launch|start|run)\s+(?:the\s+)?(?:app\s+)?(.+?)(?:\s+app)?$/.exec(text);
  if (app && !NOT_APPS.test(app[1]) && app[1].split(' ').length <= 4) {
    const name = original.trim().replace(/[!.]+$/, '').split(/\s+/).slice(-app[1].split(' ').length).join(' ').replace(/\s+app$/i, '');
    return async ({ tool }) => {
      const out = await tool('open_app', { name });
      return out.ok ? out.result.opened + ', open.' : out.error || 'I could not.';
    };
  }
  const find = /^(?:find|where(?: is|'s|’s)|locate)\s+(?:my\s+|the\s+)?(?:file\s+)?(.+?)\??$/.exec(text);
  if (find) {
    return async ({ tool }) => {
      const out = await tool('find_files', { query: find[1] });
      if (!out.ok) return out.error || 'I could not look.';
      const files = out.result.files;
      if (!files.length) return 'Nothing called ' + find[1] + '.';
      return ['Found:', ...files.slice(0, 6).map((f) => '• ' + f.path)].join('\n');
    };
  }
  return null;
}

// Longest names first, so "soul rip" is not read as something shorter.
const CASTS = [
  [/\bsoul ?rip\b|\brip\b/, 'soulrip', 'A piece of it is mine now.'],
  [/\bblack hole\b|\bvortex\b|\bswallow\b/, 'vortex', 'Down it goes.'],
  [/\bshatter\b|\bsmash\b|\bbreak\b/, 'shatter', 'Glass was never meant to last.'],
  [/\bslash\b|\bcut\b|\bslice\b/, 'slash', 'A clean cut.'],
  [/\bglitch\b|\bcorrupt\b/, 'glitch', 'Bad signal.'],
  [/\bburn\b|\bfire\b/, 'burn', 'Ashes, briefly.'],
  [/\bmelt\b|\bdrip\b/, 'melt', 'Everything sags in the end.'],
  [/\bsummon\b|\braise the dead\b/, 'summon', 'The grave stirs.'],
  [/\bhum\b|\bsing\b|\bmusic\b|\btune\b/, 'hum', 'Mm.'],
  [/\bvanish\b|\bhide\b|\bgo away\b|\bdisappear\b/, 'vanish', 'Gone.']
];

function casting(text) {
  // Only short orders: a long sentence that mentions fire is not one.
  if (text.split(/\s+/).length > 6) return null;
  const found = CASTS.find(([pattern]) => pattern.test(text));
  if (!found) return null;
  const [, ability, line] = found;
  return async ({ tool }) => {
    const out = await tool('cast', { ability });
    if (!out.ok) return out.error || 'I could not.';
    return out.result === 'stopped' ? 'Stopped.' : line;
  };
}

function clockwork(text, now) {
  if (/^what(('|’)?s| is) the time\??$|^what time is it\??$|^time\??$/.test(text)) return async () => 'It is ' + clock(now) + '.';
  if (/^what(('|’)?s| is) (the|today('|’)?s) (date|day)\??$|^what day is it\??$|^date\??$/.test(text)) {
    return async () => now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '.';
  }
  return null;
}

// With a model to hand, `withModel` leaves it the requests a pattern can
// misread (spells: "how do I burn a CD?") and "help", which lists these
// commands as if there were no model.
export function parseCommand(input, now = new Date(), { withModel = false } = {}) {
  const original = String(input || '');
  const text = original.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[!.]+$/, '');
  if (!text) return null;
  if (!withModel && /^(help|commands|\?|what can you do\??)$/.test(text)) return async () => HELP;
  return reminder(original, now) || reminders(text) || timer(text) || tally(text) || cryptwork(text) ||
    remembering(text, original) || clockwork(text, now) || (withModel ? null : reaching(text, original) || casting(text));
}
