// Speak's reach beyond the app: the web (search, read a page) and the computer
// (open an app, find and open files). Pure helpers and thin wrappers, no
// Electron, so the tests can run them in plain Node. main.js wires them to the
// page; the page asks the user first for anything that opens or looks at files.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// A plain browser name: sites refuse requests that look like scripts, and this
// says nothing about the user.
const AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const FETCH_MS = 12000;
const MAX_BYTES = 2_000_000;
// What a page read gives the model: enough to answer from, small enough for
// the free mind's few thousand tokens.
export const PAGE_CHARS = 5000;

// --- The web ----------------------------------------------------------------------------------

// Only the open web: no files, no localhost, no machines on the user's own
// network (a page read could otherwise be steered at their router).
export function publicUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.') && !host.includes(':')) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || host.startsWith('fe80:')) return null;
  return u;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decode(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const squash = (s) => decode(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// A page's readable text: no scripts, styles, menus or footers; paragraphs kept apart.
export function pageText(html) {
  const title = squash((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '');
  let body = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = /<(main|article)\b[\s\S]*?<\/\1>/i.exec(body);
  if (main && main[0].length > 500) body = main[0];
  body = body.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section)\b[^>]*>/gi, '\n').replace(/<li\b[^>]*>/gi, '\n• ');
  const text = decode(body.replace(/<[^>]*>/g, ' '))
    .split('\n').map((l) => l.replace(/[ \t\f\r\v ]+/g, ' ').trim()).filter(Boolean).join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return { title, text };
}

// DuckDuckGo's plain HTML results: title, address and snippet of each.
export function searchResults(html, most = 6) {
  const out = [];
  // One block per result, from its title link to the next.
  const blocks = String(html).split(/(?=<a[^>]*class="[^"]*result__a[^"]*")/i).slice(1);
  for (const block of blocks) {
    if (out.length >= most) break;
    const link = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
    if (!link) continue;
    let href = decode(link[1]);
    // Its links go through a redirect that carries the real address.
    const via = /[?&]uddg=([^&]+)/.exec(href);
    if (via) href = decodeURIComponent(via[1]);
    if (href.startsWith('//')) href = 'https:' + href;
    // Adverts point back at the search engine itself.
    if (!/^https?:/.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    const snip = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i.exec(block);
    out.push({ title: squash(link[2]), url: href, snippet: squash(snip ? snip[1] : '') });
  }
  return out;
}

// Bing's results, for when DuckDuckGo takes us for a robot. Its links carry the
// real address in base64 after "u=a1".
export function bingResults(html, most = 6) {
  const out = [];
  for (const block of String(html).split(/<li class="b_algo"/i).slice(1)) {
    if (out.length >= most) break;
    const clean = block.replace(/<link[^>]*>/gi, '');
    const link = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(clean);
    if (!link) continue;
    let href = decode(link[1]);
    const via = /[?&]u=a1([A-Za-z0-9_-]+)/.exec(href);
    if (via) {
      try { href = Buffer.from(via[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); } catch { continue; }
    }
    if (!/^https?:/.test(href) || /bing\.com\//.test(href)) continue;
    const snip = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(clean);
    out.push({ title: squash(link[2]), url: href, snippet: squash((snip ? snip[1] : '').replace(/<span class="news_dt">[\s\S]*?<\/span>/i, '')).replace(/^[·\s]+/, '') });
  }
  return out;
}

async function get(url, { fetchImpl = fetch, accept = 'text/html,*/*;q=0.8' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': AGENT, accept, 'accept-language': 'en' }, signal: ctrl.signal, redirect: 'follow' });
    // A redirect can't lead somewhere the address itself could not go.
    if (res.url && !publicUrl(res.url)) throw new Error('that page sent me somewhere private');
    if (!res.ok) throw new Error('the site answered ' + res.status);
    const type = res.headers.get('content-type') || '';
    if (type && !/text\/|html|xml|json/.test(type)) throw new Error('that is not a page I can read (' + type.split(';')[0] + ')');
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      chunks.push(value);
      if (size > MAX_BYTES) { reader.cancel(); break; }
    }
    return { text: Buffer.concat(chunks).toString('utf8'), type };
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'the site took too long' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

// DuckDuckGo first, then Bing: neither needs a key, and either can turn a
// script away for a while.
const ENGINES = [
  { url: (q) => 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), parse: searchResults },
  { url: (q) => 'https://www.bing.com/search?setlang=en&q=' + encodeURIComponent(q), parse: bingResults }
];

export async function search(query, opts = {}) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return { ok: false, error: 'query must be a non-empty string' };
  let last = 'no answer';
  for (const engine of opts.engines || ENGINES) {
    try {
      const { text } = await get(engine.url(q), opts);
      const results = engine.parse(text);
      if (results.length) return { ok: true, result: { query: q, results } };
      last = 'no results';
    } catch (err) {
      last = err.message;
    }
  }
  return last === 'no results'
    ? { ok: true, result: { query: q, results: [], note: 'No results.' } }
    : { ok: false, error: 'The search failed: ' + last + '.' };
}

export async function read(rawUrl, opts = {}) {
  const u = publicUrl(rawUrl);
  if (!u) return { ok: false, error: 'Only public http or https addresses can be read.' };
  try {
    const { text, type } = await get(u.href, opts);
    const page = /html|xml/.test(type) || /<html|<body|<p[\s>]/i.test(text) ? pageText(text) : { title: '', text: text.trim() };
    const more = page.text.length > PAGE_CHARS;
    return {
      ok: true,
      result: { url: u.href, title: page.title, text: page.text.slice(0, PAGE_CHARS) + (more ? '…' : ''), ...(more ? { note: 'The page goes on; this is the start.' } : {}) }
    };
  } catch (err) {
    return { ok: false, error: 'Could not read ' + u.hostname + ': ' + err.message + '.' };
  }
}

// --- The computer -----------------------------------------------------------------------------

const HOME = os.homedir();
const APP_DIRS = ['/Applications', '/Applications/Utilities', '/System/Applications', '/System/Applications/Utilities', path.join(HOME, 'Applications'),
  // Finder, and nothing else from here that anyone opens by name.
  '/System/Library/CoreServices'];
// What people call apps, against their names.
const NICKNAMES = { 'vs code': 'visual studio code', vscode: 'visual studio code', code: 'visual studio code', chrome: 'google chrome',
  settings: 'system settings', preferences: 'system settings', 'system preferences': 'system settings', word: 'microsoft word',
  excel: 'microsoft excel', powerpoint: 'microsoft powerpoint', outlook: 'microsoft outlook', teams: 'microsoft teams',
  brave: 'brave browser', 'app store': 'app store', itunes: 'music' };

// The apps installed, by name, with where each is.
export function apps(dirs = APP_DIRS) {
  const found = new Map();
  for (const dir of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { continue; }
    for (const n of names) {
      if (dir.endsWith('CoreServices') && n !== 'Finder.app') continue;
      if (n.endsWith('.app') && !found.has(n.slice(0, -4).toLowerCase())) found.set(n.slice(0, -4).toLowerCase(), { name: n.slice(0, -4), path: path.join(dir, n) });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The app a name means: exactly, then by its start, then anywhere in it.
// Spaces and case don't matter ("vs code" finds "Visual Studio Code" by its
// words, "chrome" finds "Google Chrome").
export function matchApp(name, list) {
  let want = String(name || '').toLowerCase().replace(/\.app$/, '').replace(/\s+/g, ' ').trim();
  if (!want) return { app: null, near: [] };
  if (NICKNAMES[want] && list.some((a) => a.name.toLowerCase() === NICKNAMES[want])) want = NICKNAMES[want];
  const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const w = flat(want);
  const exact = list.find((a) => flat(a.name) === w);
  if (exact) return { app: exact, near: [] };
  // Each test only counts when the stricter ones found nothing; two or more
  // equally good matches are a question, not a guess.
  const starts = list.filter((a) => flat(a.name).startsWith(w));
  if (starts.length === 1) return { app: starts[0], near: [] };
  const inside = starts.length ? [] : list.filter((a) => flat(a.name).includes(w));
  if (inside.length === 1) return { app: inside[0], near: [] };
  const parts = want.split(/\s+/);
  const words = starts.length || inside.length ? [] : list.filter((a) => {
    const own = a.name.toLowerCase().split(/\s+/);
    return own.map((x) => x[0]).join('') === w || parts.every((part) => own.some((x) => x.startsWith(part)));
  });
  if (words.length === 1) return { app: words[0], near: [] };
  return { app: null, near: [...starts, ...inside, ...words].slice(0, 6).map((a) => a.name) };
}

const run = (cmd, args, ms = 6000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: ms, maxBuffer: 4_000_000 }, (err, stdout) => resolve(err && !stdout ? null : String(stdout || '')));
});

export async function openApp(name, { platform = process.platform } = {}) {
  if (platform !== 'darwin') return { ok: false, error: 'Opening apps works on macOS for now.' };
  const list = apps();
  const { app, near } = matchApp(name, list);
  if (!app) {
    return near.length
      ? { ok: false, error: 'Which one? ' + near.join(', ') + '.' }
      : { ok: false, error: 'No app called ' + name + ' is installed.' };
  }
  const out = await run('open', [app.path]);
  return out === null ? { ok: false, error: 'macOS would not open ' + app.name + '.' } : { ok: true, result: { opened: app.name } };
}

// Files by name, under the home folder, newest first (Spotlight's index, on macOS).
export async function findFiles(query, { platform = process.platform, most = 15 } = {}) {
  const q = String(query || '').trim().slice(0, 200);
  if (!q) return { ok: false, error: 'query must be a non-empty string' };
  if (platform !== 'darwin') return { ok: false, error: 'Finding files works on macOS for now.' };
  const out = await run('mdfind', ['-onlyin', HOME, '-name', q], 8000);
  if (out === null) return { ok: false, error: 'Spotlight did not answer.' };
  const hidden = (p) => p.split('/').some((part) => part.startsWith('.')) || p.startsWith(path.join(HOME, 'Library') + '/');
  const paths = out.split('\n').filter((p) => p && !hidden(p));
  const files = paths.map((p) => {
    try { const st = fs.statSync(p); return { path: p, kind: st.isDirectory() ? 'folder' : 'file', modified: st.mtimeMs }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => b.modified - a.modified).slice(0, most)
    .map((f) => ({ path: f.path.replace(HOME, '~'), kind: f.kind, modified: new Date(f.modified).toISOString().slice(0, 10) }));
  return { ok: true, result: files.length ? { query: q, files, ...(paths.length > most ? { note: paths.length + ' found; the newest ' + most + ' shown.' } : {}) } : { query: q, files: [], note: 'Nothing found.' } };
}

// A path the user may open: absolute (or under ~), and really there.
export function realPath(raw) {
  let p = String(raw || '').trim();
  if (p.startsWith('~/') || p === '~') p = path.join(HOME, p.slice(1));
  if (!path.isAbsolute(p)) return null;
  p = path.normalize(p);
  try { fs.statSync(p); } catch { return null; }
  return p;
}
