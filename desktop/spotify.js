// Spotify, through the desktop app's own scripting on macOS: no account key.
// To play something by name he finds its Spotify link on the web, then tells
// the app to play it. The first time, macOS asks the user whether the reaper
// may control Spotify.
import { execFile } from 'node:child_process';
import { search } from './reach.js';

// Spotify's links: open.spotify.com/track/<22 characters>, sometimes with a
// language part ("intl-de") before the kind.
const LINK = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist)\/([A-Za-z0-9]{22})/;
const KINDS = { song: 'track', track: 'track', album: 'album', playlist: 'playlist', artist: 'artist', radio: 'radio' };
// A song's radio (songs like it) is its station: spotify:station:track:<id>.
const station = (trackUri) => 'spotify:station:' + trackUri.replace(/^spotify:/, '');
// "radio for this song": the one playing now.
const THIS_ONE = /^(this|that|the current|current|what('|’)?s playing|what is playing)( song| track| one)?$/i;

// What a request means when no kind was given: "the album Discovery",
// "Blue Monday radio", "songs by Radiohead". The words that said so go.
export function readQuery(query, kind) {
  let q = String(query || '').trim().replace(/\s+on spotify$/i, '');
  let k = KINDS[String(kind || '').toLowerCase()] || null;
  const said = (re, as) => {
    if (!re.test(q)) return false;
    if (!k || k === 'track') k = as;
    q = q.replace(re, ' ').replace(/\s+/g, ' ').trim();
    return true;
  };
  said(/^(a |the )?(song |track )?(radio|station) (for|of|from|based on|like) |\b(song |track )?(radio|station)$/i, 'radio') ||
    said(/^(the |an? )?album\b( called)?|\b(the )?album$/i, 'album') ||
    said(/^(the |my |a )?playlist\b( called)?|\bplaylist$/i, 'playlist') ||
    said(/^(some |songs by |music by |anything by |stuff by )/i, 'artist');
  return { query: q.replace(/^(the |a )song /i, ''), kind: k || 'track' };
}

export function spotifyUri(url) {
  const m = LINK.exec(String(url || ''));
  return m ? { kind: m[1], uri: 'spotify:' + m[1] + ':' + m[2] } : null;
}

// The best result of the kind wanted; another kind only if there is none.
export function pickResult(results, kind = 'track') {
  const found = results.map((r) => ({ ...r, ...spotifyUri(r.url) })).filter((r) => r.uri);
  return found.find((r) => r.kind === (kind === 'radio' ? 'track' : kind)) || null;
}

// Ways to ask the web for it, tried in turn until one turns up a link of the
// right kind: engines ignore some of them some of the time.
export function searches(query, kind) {
  // A radio starts from its song.
  if (kind === 'radio') kind = 'track';
  const word = kind === 'track' ? 'song' : kind;
  return ['site:open.spotify.com/' + kind + ' ' + query, query + ' ' + word + ' spotify', 'open.spotify.com ' + kind + ' ' + query];
}

// "Song Name - song and lyrics by Artist | Spotify" -> "Song Name by Artist".
export function tidyTitle(title) {
  return String(title || '')
    .replace(/\s*\|\s*Spotify.*$/i, '')
    .replace(/\s*-\s*(song|single|album|playlist|ep)( and lyrics)? by\s+/i, ' by ')
    .replace(/\s*-\s*(song|single|album|playlist|ep)( and lyrics)?\s*$/i, '')
    .trim();
}

// --- Finding it without a key ---------------------------------------------------------------
// Web search turned out unreliable for this (one engine turns scripts away,
// the other ignores "site:"), so the catalog lookup goes through services
// made for it, none of which needs a key:
//   1. Apple's iTunes Search names it properly ("hotline bling" -> Hotline
//      Bling by Drake, on the album Views).
//   2. MusicBrainz, the open music database, has the Spotify link of most
//      artists and albums.
//   3. Spotify's public embed page for that artist or album (what a site's
//      Spotify player shows) lists the tracks with their addresses.
// Web search is only the last resort after these.
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// MusicBrainz asks that clients name themselves, and send a request a second at most.
const MB_AGENT = 'ReaperCompanion/0.2 (desktop companion app)';
const MB_GAP_MS = 1100;

// "Hotline Bling (feat. X) - 2016 Remaster" and "hotline bling" are the same song.
export const plain = (s) => String(s || '').toLowerCase()
  .replace(/\s*[([][^)\]]*(feat|with|remaster|version|edit|live|mix)[^)\]]*[)\]]/g, '')
  .replace(/\s+-\s+.*(remaster|version|edit|mix|live).*$/, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
// MusicBrainz's search takes Lucene queries; a name goes in quoted, cleaned.
const lucene = (s) => '"' + String(s).replace(/["\\]/g, ' ').trim() + '"';

export function catalog({ fetchImpl = fetch, wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let lastMb = 0;
  // What it has found, so asking for the same thing again asks nobody.
  const known = new Map();
  async function json(url, headers, tries = 3) {
    for (let attempt = 1; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      try {
        const res = await fetchImpl(url, { headers: { accept: 'application/json', ...headers }, signal: ctrl.signal });
        // 503 is MusicBrainz saying "slower": wait as long as it asks, then try again.
        if ((res.status === 503 || res.status === 429) && attempt < tries) {
          const after = Number(res.headers && res.headers.get && res.headers.get('retry-after'));
          await wait(Math.min(5000, Number.isFinite(after) && after > 0 ? after * 1000 : 1500 * attempt));
          continue;
        }
        return res.ok ? await res.json() : null;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  const itunes = (term, entity) => json('https://itunes.apple.com/search?media=music&limit=5&entity=' + entity + '&term=' + encodeURIComponent(term), { 'user-agent': BROWSER });
  async function mb(path) {
    const gap = lastMb + MB_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    lastMb = Date.now();
    return json('https://musicbrainz.org/ws/2/' + path + (path.includes('?') ? '&' : '?') + 'fmt=json', { 'user-agent': MB_AGENT });
  }
  const spotifyLink = (relations, kind) => (relations || []).map((r) => r.url && r.url.resource).map((u) => spotifyUri(u)).find((x) => x && x.kind === kind) || null;

  async function artist(name) {
    const found = await mb('artist/?limit=3&query=' + encodeURIComponent('artist:' + lucene(name)));
    const best = found && (found.artists || []).find((a) => a.score >= 90);
    if (!best) return null;
    const full = await mb('artist/' + best.id + '?inc=url-rels');
    const link = full && spotifyLink(full.relations, 'artist');
    return link && { ...link, title: best.name };
  }
  async function album(title, by) {
    const found = await mb('release-group/?limit=3&query=' + encodeURIComponent('releasegroup:' + lucene(title) + (by ? ' AND artist:' + lucene(by) : '')));
    const best = found && (found['release-groups'] || []).find((g) => g.score >= 85);
    if (!best) return null;
    const releases = await mb('release?limit=50&inc=url-rels&release-group=' + best.id);
    for (const r of (releases && releases.releases) || []) {
      const link = spotifyLink(r.relations, 'album');
      if (link) return { ...link, title: best.title + (by ? ' by ' + by : '') };
    }
    return null;
  }
  // The tracks Spotify's own embed page lists for an artist (their top ten) or an album.
  async function tracks(link) {
    const [, kind, id] = link.uri.split(':');
    try {
      const res = await fetchImpl('https://open.spotify.com/embed/' + kind + '/' + id, { headers: { 'user-agent': BROWSER } });
      const m = res.ok && /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(await res.text());
      const entity = m && JSON.parse(m[1]).props.pageProps.state.data.entity;
      return ((entity && entity.trackList) || []).filter((t) => /^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri)).map((t) => ({ title: t.title, uri: t.uri }));
    } catch {
      return [];
    }
  }

  // What a request for `query` of `kind` (track, album, artist, radio) plays, or null.
  return async function find(query, kind) {
    if (kind === 'playlist') return null;
    const key = kind + ':' + plain(query);
    if (known.has(key)) return known.get(key);
    const found = await look(query, kind);
    if (found) known.set(key, found);
    return found;
  };

  async function look(query, kind) {
    // "play drake": an artist, when the words are an artist's whole name.
    if (kind === 'artist' || kind === 'track') {
      const named = await itunes(query, 'musicArtist');
      const a = named && (named.results || [])[0];
      if (a && (kind === 'artist' || plain(a.artistName) === plain(query))) {
        const link = await artist(a.artistName);
        if (link) return link;
        if (kind === 'artist') return null;
      }
    }
    if (kind === 'album') {
      const named = await itunes(query, 'album');
      const al = named && (named.results || [])[0];
      return al ? album(al.collectionName.replace(/\s+-\s+(single|ep)$/i, ''), al.artistName) : null;
    }
    // A song (and a song's radio): find it among its artist's top tracks, else on its album.
    const named = await itunes(query, 'song');
    const song = named && (named.results || [])[0];
    if (!song) return null;
    const want = plain(song.trackName);
    const by = await artist(song.artistName);
    const hit = (list) => list.find((t) => plain(t.title) === want);
    let match = by && hit(await tracks(by));
    if (!match) {
      const on = await album(song.collectionName.replace(/\s+-\s+(single|ep)$/i, ''), song.artistName);
      match = on && hit(await tracks(on));
    }
    return match ? { uri: match.uri, kind: 'track', title: song.trackName + ' by ' + song.artistName } : null;
  }
}
// One for the whole app, so its memory and its pace with MusicBrainz are shared.
const shared = catalog();

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
export async function spotify(input = {}, { platform = process.platform, run = osascript, find = search, lookup = shared, settle = 1500 } = {}) {
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
  const want = readQuery(query, input.kind);
  let best = null;
  let error = null;
  // The radio of what is playing needs no search.
  if (want.kind === 'radio' && (!want.query || THIS_ONE.test(want.query))) {
    const now = await run('if application "Spotify" is running then\n' + tell('return (id of current track) & "|" & (name of current track)') + '\nend if');
    const [uri, name] = (now.ok ? now.out : '').split('|');
    if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri || '')) return { ok: false, error: 'Nothing is playing to start a radio from.' };
    best = { uri, kind: 'track', title: name };
  }
  if (!best) best = await lookup(want.query, want.kind === 'radio' ? 'track' : want.kind);
  for (const q of best ? [] : searches(want.query, want.kind)) {
    const found = await find(q);
    if (!found.ok) { error = found.error; continue; }
    best = pickResult(found.result.results || [], want.kind);
    if (best) break;
  }
  if (!best) return { ok: false, error: error || 'I could not find ' + (want.kind === 'track' ? '' : want.kind === 'radio' ? 'a radio for ' : 'the ' + want.kind + ' ') + '"' + want.query + '" on Spotify.' };
  const uri = want.kind === 'radio' ? station(best.uri) : best.uri;
  const out = await run(tell('play track "' + uri + '"'));
  if (!out.ok) return { ok: false, error: refused(out.error) };
  // What Spotify says it is playing is the truth; the search title is a guess.
  await wait(settle);
  const playing = await nowPlaying(run);
  return want.kind === 'radio'
    ? { ok: true, result: { radio: 'songs like ' + tidyTitle(best.title), playing, uri } }
    : { ok: true, result: { playing: playing || tidyTitle(best.title), kind: best.kind, uri } };
}
