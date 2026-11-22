// Spotify, through the desktop app's own scripting on macOS: no account key.
// To play something by name he finds its Spotify link on the web, then tells
// the app to play it. The first time, macOS asks the user whether the reaper
// may control Spotify.
import { execFile } from 'node:child_process';
import { search } from './reach.js';

// Spotify's links: open.spotify.com/track/<22 characters>, sometimes with a
// language part ("intl-de") before the kind.
const LINK = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist)\/([A-Za-z0-9]{22})/;
const KINDS = { song: 'track', track: 'track', album: 'album', playlist: 'playlist', artist: 'artist' };

export function spotifyUri(url) {
  const m = LINK.exec(String(url || ''));
  return m ? { kind: m[1], uri: 'spotify:' + m[1] + ':' + m[2] } : null;
}

// The best result of the kind wanted; another kind only if there is none.
export function pickResult(results, kind = 'track') {
  const found = results.map((r) => ({ ...r, ...spotifyUri(r.url) })).filter((r) => r.uri);
  return found.find((r) => r.kind === kind) || found[0] || null;
}

// "Song Name - song and lyrics by Artist | Spotify" -> "Song Name by Artist".
export function tidyTitle(title) {
  return String(title || '')
    .replace(/\s*\|\s*Spotify.*$/i, '')
    .replace(/\s*-\s*(song|single|album|playlist|ep)( and lyrics)? by\s+/i, ' by ')
    .replace(/\s*-\s*(song|single|album|playlist|ep)( and lyrics)?\s*$/i, '')
    .trim();
}

function osascript(script, ms = 8000) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: ms }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, error: String(stderr || err.message).trim() });
      else resolve({ ok: true, out: String(stdout).trim() });
    });
  });
}

const tell = (what) => 'tell application "Spotify" to ' + what;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// What it is playing now, as "Song by Artist", or null.
async function nowPlaying(run) {
  const out = await run('if application "Spotify" is running then\n' +
    tell('if player state is playing then return (name of current track) & " by " & (artist of current track)') + '\nend if');
  return out.ok && out.out ? out.out : null;
}

function refused(error) {
  if (/-1743|not allowed|not authori[sz]ed/i.test(error)) {
    return 'macOS has not let me control Spotify. Allow it in System Settings > Privacy & Security > Automation, under Reaper.';
  }
  if (/-1728|can.t get application|application isn.t running|not found/i.test(error)) return 'Spotify is not installed.';
  return 'Spotify did not answer: ' + error.slice(0, 160);
}

// action: play (with a query, or none to carry on), pause, next, previous,
// now_playing or volume (0-100). `run` and `find` are for the tests.
export async function spotify(input = {}, { platform = process.platform, run = osascript, find = search, settle = 1500 } = {}) {
  if (platform !== 'darwin') return { ok: false, error: 'Spotify control works on macOS for now.' };
  const action = String(input.action || 'play');
  const simple = { pause: 'pause', next: 'next track', previous: 'previous track' };

  if (simple[action]) {
    const out = await run(tell(simple[action]));
    if (!out.ok) return { ok: false, error: refused(out.error) };
    if (action === 'pause') return { ok: true, result: { paused: true } };
    await wait(Math.min(settle, 700));
    return { ok: true, result: { playing: await nowPlaying(run) } };
  }
  if (action === 'now_playing') {
    return { ok: true, result: { playing: await nowPlaying(run) || 'Nothing is playing.' } };
  }
  if (action === 'volume') {
    const v = Math.round(Number(input.volume));
    if (!(v >= 0 && v <= 100)) return { ok: false, error: 'volume must be 0 to 100' };
    const out = await run(tell('set sound volume to ' + v));
    return out.ok ? { ok: true, result: { volume: v } } : { ok: false, error: refused(out.error) };
  }
  if (action !== 'play') return { ok: false, error: 'action must be play, pause, next, previous, now_playing or volume' };

  const query = String(input.query || '').trim().slice(0, 200);
  if (!query) {
    const out = await run(tell('play'));
    if (!out.ok) return { ok: false, error: refused(out.error) };
    await wait(Math.min(settle, 700));
    return { ok: true, result: { playing: await nowPlaying(run) } };
  }
  const kind = KINDS[String(input.kind || 'song').toLowerCase()] || 'track';
  const words = kind === 'track' ? 'song' : kind;
  const found = await find('site:open.spotify.com ' + words + ' ' + query);
  if (!found.ok) return { ok: false, error: found.error };
  const best = pickResult(found.result.results || [], kind);
  if (!best) return { ok: false, error: 'I could not find "' + query + '" on Spotify.' };
  const out = await run(tell('play track "' + best.uri + '"'));
  if (!out.ok) return { ok: false, error: refused(out.error) };
  // What Spotify says it is playing is the truth; the search title is a guess.
  await wait(settle);
  const playing = await nowPlaying(run);
  return { ok: true, result: { playing: playing || tidyTitle(best.title), kind: best.kind, uri: best.uri } };
}
