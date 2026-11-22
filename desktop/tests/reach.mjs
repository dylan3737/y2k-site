// Speak's reach (reach.js) in plain Node: the parsers on saved pages, the
// address guard, and app names. Nothing here goes out to the web.
import * as reach from '../reach.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

// Addresses: the open web only.
check('a public page may be read', !!reach.publicUrl('https://en.wikipedia.org/wiki/Death'));
for (const bad of ['file:///etc/passwd', 'http://localhost:3000', 'http://127.0.0.1/', 'http://192.168.1.1/', 'http://10.0.0.2',
  'http://172.20.1.1', 'http://169.254.169.254/latest', 'http://printer.local/', 'http://router/', 'http://[::1]/', 'javascript:alert(1)', 'nonsense']) {
  check('refused: ' + bad, reach.publicUrl(bad) === null);
}

// DuckDuckGo's results page.
const ddg = `<div class="result"><h2><a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FGrim_Reaper&amp;rut=x">Grim <b>Reaper</b> - Wikipedia</a></h2>
<a class="result__snippet" href="x">The Grim Reaper is a <b>personification</b> of death &amp; more.</a></div>
<div class="result"><a class="result__a" href="https://duckduckgo.com/y.js?ad=1">An advert</a></div>
<div class="result"><a class="result__a" href="https://example.org/page">Second</a><div class="result__snippet">Plain words</div></div>`;
const d = reach.searchResults(ddg);
check('DuckDuckGo: real addresses, titles and snippets, no adverts', d.length === 2 && d[0].url === 'https://en.wikipedia.org/wiki/Grim_Reaper' &&
  d[0].title === 'Grim Reaper - Wikipedia' && d[0].snippet === 'The Grim Reaper is a personification of death & more.' && d[1].snippet === 'Plain words', JSON.stringify(d));

// Bing's, with the address in base64.
const enc = Buffer.from('https://mythology.net/grim-reaper/').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const bing = `<li class="b_algo" data-id><link rel="stylesheet" href="x.css"/><h2><a target="_blank" href="https://www.bing.com/ck/a?!&amp;&amp;p=abc&amp;u=a1${enc}&amp;ntb=1">Grim Reaper | Mythology</a></h2>
<div><p class="b_lineclamp2"><span class="news_dt">May 22, 2017</span>&nbsp;&#0183;&#32;The lord of death.</p></div></li>`;
const b = reach.bingResults(bing);
check('Bing: the real address, the title, the snippet without its date', b.length === 1 && b[0].url === 'https://mythology.net/grim-reaper/' &&
  b[0].title === 'Grim Reaper | Mythology' && b[0].snippet === 'The lord of death.', JSON.stringify(b));

// A search falls back to the next engine when one turns it away.
const fakeFetch = (pages) => async (url) => {
  const body = pages.find(([k]) => url.includes(k))?.[1];
  if (body === undefined) throw new Error('offline');
  return { ok: true, status: 200, url, headers: { get: () => 'text/html' }, body: { getReader: () => { let done = false; return { read: async () => (done ? { done: true } : ((done = true), { done: false, value: Buffer.from(body) })), cancel() {} }; } } };
};
let out = await reach.search('grim reaper', { fetchImpl: fakeFetch([['duckduckgo', '<div class="anomaly-modal">robot?</div>'], ['bing', bing]]) });
check('a search turned away by one engine tries the next', out.ok && out.result.results[0].url === 'https://mythology.net/grim-reaper/', JSON.stringify(out));
out = await reach.search('grim reaper', { fetchImpl: fakeFetch([]) });
check('with the network down, a search says so', !out.ok && /failed/.test(out.error), JSON.stringify(out));
out = await reach.search('   ');
check('an empty search is refused', !out.ok);

// Reading a page: the words, not the menus and scripts.
const html = `<html><head><title>On Death &amp; Taxes</title><style>p{}</style></head><body><nav>Home | About</nav>
<main><h1>Certain things</h1><p>Nothing is certain<br>but death.</p><script>alert(1)</script><ul><li>Taxes</li><li>Reapers</li></ul></main><footer>© me</footer></body></html>`;
const page = reach.pageText(html);
check('a page reads as its title and words', page.title === 'On Death & Taxes' && page.text.includes('Nothing is certain\nbut death.') &&
  page.text.includes('• Taxes') && !page.text.includes('alert') && !page.text.includes('Home | About') && !page.text.includes('© me'), JSON.stringify(page));
out = await reach.read('https://example.com/death', { fetchImpl: fakeFetch([['example.com', html + 'x'.repeat(9000)]]) });
check('a long page is cut to what the mind can hold', out.ok && out.result.text.length <= reach.PAGE_CHARS + 1 && out.result.title === 'On Death & Taxes');
out = await reach.read('http://192.168.0.1/admin', { fetchImpl: fakeFetch([['192.168', html]]) });
check('a page on the home network is never read', !out.ok);
const sneaky = async (url) => ({ ...(await fakeFetch([['example.com', html]])(url)), url: 'http://127.0.0.1/secret' });
out = await reach.read('https://example.com/jump', { fetchImpl: sneaky });
check('nor one a redirect leads to', !out.ok && /private/.test(out.error), JSON.stringify(out));

// App names as people say them.
const list = ['Safari', 'Visual Studio Code', 'Xcode', 'Google Chrome', 'Brave Browser', 'Notes', 'Microsoft Word', 'Microsoft Excel', 'System Settings', 'Finder']
  .map((name) => ({ name, path: '/Applications/' + name + '.app' }));
const pick = (n) => (reach.matchApp(n, list).app || {}).name;
check('exactly', pick('safari') === 'Safari' && pick('Notes.app') === 'Notes');
check('by nickname', pick('vs code') === 'Visual Studio Code' && pick('chrome') === 'Google Chrome' && pick('settings') === 'System Settings' && pick('word') === 'Microsoft Word');
check('by the start of its name', pick('brave') === 'Brave Browser' && pick('find') === 'Finder');
const two = reach.matchApp('microsoft', list);
check('two equally good matches are a question', !two.app && two.near.join() === 'Microsoft Word,Microsoft Excel', JSON.stringify(two));
check('and nothing is nothing', !reach.matchApp('xyzzy', list).app && !reach.matchApp('', list).app);

// Paths: real and absolute only.
check('a real path may be opened', reach.realPath('~') !== null && reach.realPath('/') === '/');
check('a relative or missing one may not', reach.realPath('notes.txt') === null && reach.realPath('/no/such/thing') === null);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll reach checks passed');
process.exit(failures ? 1 : 0);
