// Spotify control (spotify.js) with stand-ins for osascript and the search:
// nothing plays and nothing goes out to the web.
import { spotify, spotifyUri, pickResult, tidyTitle } from '../spotify.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

check('a track link becomes a Spotify address', spotifyUri('https://open.spotify.com/track/6gv02BqPCsOQz5QQ4jnNOY?si=x').uri === 'spotify:track:6gv02BqPCsOQz5QQ4jnNOY');
check('with a language part too', spotifyUri('https://open.spotify.com/intl-de/album/1RSy7B2vfPi84N80QJ6frX').uri === 'spotify:album:1RSy7B2vfPi84N80QJ6frX');
check('anything else is not one', spotifyUri('https://example.com/track/6gv02BqPCsOQz5QQ4jnNOY') === null && spotifyUri('https://open.spotify.com/track/short') === null);
const results = [
  { title: 'New Order | Spotify', url: 'https://open.spotify.com/artist/0yNLKJebCb8Aueb54LYya3' },
  { title: 'Blue Monday - song and lyrics by New Order | Spotify', url: 'https://open.spotify.com/track/6gv02BqPCsOQz5QQ4jnNOY' }
];
check('the kind asked for wins', pickResult(results, 'track').uri === 'spotify:track:6gv02BqPCsOQz5QQ4jnNOY' && pickResult(results, 'artist').kind === 'artist');
check('titles are tidied', tidyTitle('Blue Monday - song and lyrics by New Order | Spotify') === 'Blue Monday by New Order');

const scripts = [];
const run = (state = {}) => async (script) => {
  scripts.push(script);
  if (state.refuse) return { ok: false, error: 'execution error: Not authorized to send Apple events to Spotify. (-1743)' };
  if (/current track/.test(script)) return { ok: true, out: state.playing ?? 'Blue Monday by New Order' };
  return { ok: true, out: '' };
};
const find = async (q) => ({ ok: true, result: { query: q, results } });
const opts = (state) => ({ platform: 'darwin', run: run(state), find, settle: 0 });

let out = await spotify({ action: 'play', query: 'blue monday new order' }, opts());
check('play finds the song and plays it by its address', out.ok && out.result.uri === 'spotify:track:6gv02BqPCsOQz5QQ4jnNOY' &&
  scripts.some((s) => s === 'tell application "Spotify" to play track "spotify:track:6gv02BqPCsOQz5QQ4jnNOY"'), JSON.stringify(out));
check('and says what Spotify is playing', out.result.playing === 'Blue Monday by New Order');
scripts.length = 0;
out = await spotify({ action: 'play', query: 'x" & do shell script "rm -rf ~' }, { ...opts(), find: async () => ({ ok: true, result: { results: [] } }) });
check('a query never reaches the script', !out.ok && scripts.length === 0, JSON.stringify(out));
out = await spotify({ action: 'pause' }, opts());
check('pause', out.ok && out.result.paused && scripts.includes('tell application "Spotify" to pause'));
out = await spotify({ action: 'next' }, opts());
check('next, and what came on', out.ok && out.result.playing === 'Blue Monday by New Order');
out = await spotify({ action: 'now_playing' }, opts({ playing: '' }));
check('nothing playing is said so', out.ok && out.result.playing === 'Nothing is playing.');
out = await spotify({ action: 'volume', volume: 40 }, opts());
check('volume', out.ok && scripts.includes('tell application "Spotify" to set sound volume to 40'));
out = await spotify({ action: 'volume', volume: 400 }, opts());
check('a silly volume is refused', !out.ok);
out = await spotify({ action: 'pause' }, opts({ refuse: true }));
check('without macOS permission, he says where to give it', !out.ok && /Automation/.test(out.error), out.error);
out = await spotify({ action: 'play', query: 'x' }, { platform: 'linux' });
check('macOS only, for now', !out.ok && /macOS/.test(out.error));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll Spotify checks passed');
process.exit(failures ? 1 : 0);
