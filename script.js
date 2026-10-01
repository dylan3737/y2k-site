(function () {
  'use strict';

// Playlist Track Config
    const playlistData = [
      { 
        title: "Lo-Fi Chill",
        artist: "Desk Lamp",
        type: "synth",
        preset: "lofi"
      },
      {
        title: "Synthwave Sunset",
        artist: "Mall Soft",
        type: "synth",
        preset: "synthwave"
      },
      {
        title: "Retro Groove",
        artist: "Cursor Funk",
        type: "synth",
        preset: "retrogroove"
      },
      {
        title: "Night Drive",
        artist: "After Exit",
        type: "synth",
        preset: "nightdrive"
      },
      {
        title: "Pixel Rain",
        artist: "8-bit Weather",
        type: "synth",
        preset: "pixelrain"
      },
      {
        title: "Last Bell",
        artist: "The Court",
        type: "synth",
        preset: "reaper"
      }
    ];

    let currentTrackIndex = 0;
    let isPlaying = false;

    // Web Audio API Synthesizer Engine
    let audioCtx = null;
    let synthInterval = null;
    let rainNodes = null;

    function makeNoiseBuffer() {
      const length = audioCtx.sampleRate * 2;
      const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    function startRain() {
      const buffer = makeNoiseBuffer();
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;

      const highpass = audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 900;

      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 5000;

      const gain = audioCtx.createGain();
      gain.gain.value = 0.11;

      src.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(audioCtx.destination);
      src.start();

      const drop = () => {
        if (!rainNodes) return;
        const burst = audioCtx.createBufferSource();
        burst.buffer = buffer;
        const band = audioCtx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 700 + Math.random() * 3400;
        band.Q.value = 3.5;
        const dropGain = audioCtx.createGain();
        const now = audioCtx.currentTime;
        const peak = 0.08 + Math.random() * 0.16;
        dropGain.gain.setValueAtTime(0.0001, now);
        dropGain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.14);
        burst.connect(band);
        band.connect(dropGain);
        dropGain.connect(audioCtx.destination);
        burst.start(now);
        burst.stop(now + 0.22);
      };

      rainNodes = { src: src, gain: gain, timer: setInterval(drop, 70) };
    }

    function initAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    }

    function playSynthNote(freq, type = 'sine', duration = 1.2, gainValue = 0.15) {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainValue, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    }

    function startSynthLoop(preset) {
      stopSynthLoop();
      initAudioContext();
      if (preset === 'pixelrain') {
        startRain();
        return;
      }

      // Distinct melody scale maps and speeds for each track
      const trackConfigs = {
        lofi: {
          notes: [261.63, 329.63, 392.00, 493.88, 440.00, 392.00, 329.63, 293.66],
          oscType: 'sine',
          speed: 640,
          hold: 0.95,
          gain: 0.07,
          hasBass: true,
          fifth: true
        },
        synthwave: {
          notes: [220.00, 261.63, 329.63, 392.00, 440.00, 329.63, 293.66, 246.94],
          oscType: 'sawtooth',
          speed: 260,
          hold: 0.18,
          gain: 0.045,
          pulse: true
        },
        retrogroove: {
          notes: [196.00, 392.00, 246.94, 493.88, 220.00, 440.00, 164.81, 329.63],
          oscType: 'square',
          speed: 170,
          hold: 0.07,
          gain: 0.04
        },
        nightdrive: {
          notes: [130.81, 164.81, 196.00, 164.81, 146.83, 174.61],
          oscType: 'triangle',
          speed: 760,
          hold: 1.5,
          gain: 0.06,
          pad: true
        },
        reaper: {
          notes: [146.83, 174.61, 155.56, 130.81],
          oscType: 'triangle',
          speed: 1100,
          hasBass: true,
          drone: true,
          bell: true
        }
      };

      const config = trackConfigs[preset] || trackConfigs.lofi;
      let step = 0;

      synthInterval = setInterval(() => {
        const freq = config.notes[step % config.notes.length];
        playSynthNote(freq, config.oscType, config.hold || config.speed / 500, config.gain || 0.12);

        if (config.fifth && step % 2 === 0) {
          playSynthNote(freq * 1.5, 'sine', 0.8, 0.028);
        }
        if (config.pulse) {
          playSynthNote(freq / 2, 'sawtooth', 0.1, 0.035);
        }
        if (config.pad) {
          playSynthNote(freq / 2, 'sine', 1.8, 0.045);
        }
        if (config.chirp && step % 2 === 0) {
          playSynthNote(freq * 1.5, 'square', 0.045, 0.018);
        }
        if (config.drone) {
          playSynthNote(freq / 2, 'sine', 2.4, 0.14);
        } else if (config.hasBass && step % 2 === 0) {
          playSynthNote(freq / 2, 'sine', (config.speed / 500) * 1.5, 0.08);
        }
        if (config.bell && step % 4 === 3) {
          playSynthNote(987.77, 'sine', 1.6, 0.045);
        }

        step++;
      }, config.speed);
    }

    function stopSynthLoop() {
      if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
      }
      if (rainNodes) {
        clearInterval(rainNodes.timer);
        try { rainNodes.src.stop(); } catch (err) {}
        try { rainNodes.gain.disconnect(); } catch (err) {}
        rainNodes = null;
      }
    }
    // Audio DOM Elements
    const musicWidgetWrapper = document.getElementById('musicWidgetWrapper');
    const playBtn = document.getElementById('playBtn');
    const playlistToggleBtn = document.getElementById('playlistToggleBtn');
    const playlistDropdown = document.getElementById('playlistDropdown');
    const trackTitleEl = document.getElementById('currentTrackTitle');
    const trackArtistEl = document.getElementById('currentTrackArtist');
    const dropdownItems = document.querySelectorAll('.playlist-item');

    function loadTrack(index) {
      currentTrackIndex = index;
      const track = playlistData[index];

      trackTitleEl.innerText = track.title;
      trackArtistEl.innerText = track.artist;

      dropdownItems.forEach((item, i) => {
        item.classList.toggle('active', i === index);
      });

      if (isPlaying) {
        playTrack();
      }
    }

    function playTrack() {
      initAudioContext();
      const track = playlistData[currentTrackIndex];
      startSynthLoop(track.preset);
      isPlaying = true;
      musicWidgetWrapper.classList.add('playing');
      playBtn.innerText = '❚❚ PAUSE';
    }

    function pauseTrack() {
      stopSynthLoop();
      isPlaying = false;
      musicWidgetWrapper.classList.remove('playing');
      playBtn.innerText = '▶ PLAY';
    }

    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        pauseTrack();
      } else {
        playTrack();
      }
    });

    playlistToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playlistDropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      playlistDropdown.classList.remove('open');
    });

    dropdownItems.forEach((item, index) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        playlistDropdown.classList.remove('open');
        loadTrack(index);
        playTrack();
      });
    });

    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (lastUpdatedEl) {
      const updated = new Date(document.lastModified);
      if (!Number.isNaN(updated.getTime())) {
        lastUpdatedEl.textContent = updated.toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric'
        });
      }
    }

    // Click bullseye
    const prefersReducedMotionClick = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function spawnBullseye(clientX, clientY) {
      if (prefersReducedMotionClick) return;
      const wrap = document.createElement('div');
      wrap.className = 'bullseye';
      wrap.style.left = clientX + 'px';
      wrap.style.top = clientY + 'px';

      const colors = ['#ff71ce', '#01cdfe', '#05ffa1', '#fffb96'];
      const scales = [2.6, 4.0, 5.6];
      const delays = ['0ms', '70ms', '140ms'];
      scales.forEach((scale, i) => {
        const ring = document.createElement('span');
        ring.className = 'bullseye-ring';
        ring.style.setProperty('--ring-scale', String(scale));
        ring.style.setProperty('--ring-delay', delays[i]);
        ring.style.setProperty('--ring-color', colors[i % colors.length]);
        wrap.appendChild(ring);
      });
      const dot = document.createElement('span');
      dot.className = 'bullseye-dot';
      wrap.appendChild(dot);
      document.body.appendChild(wrap);
      setTimeout(() => wrap.remove(), 850);
    }
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      spawnBullseye(e.clientX, e.clientY);
    });

    // Glitter Sparkle Trail Effect
    const sparkles = ['✦', '★', '✧', '❄', '✨'];
    const prefersReducedSparkles = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.addEventListener('mousemove', (e) => {
      if (prefersReducedSparkles) return;
      if (Math.random() < 0.25) {
        const span = document.createElement('span');
        span.className = 'sparkle';
        span.innerText = sparkles[Math.floor(Math.random() * sparkles.length)];
        span.style.left = e.clientX + 'px';
        span.style.top = e.clientY + 'px';
        span.style.color = ['#ff71ce', '#01cdfe', '#05ffa1', '#fffb96'][Math.floor(Math.random() * 4)];
        document.body.appendChild(span);
        setTimeout(() => span.remove(), 800);
      }
    });

    // --- Guestbook & Song Suggestions (Supabase-backed, shared & public) ---
   // 1. Create a free project at supabase.com
   // 2. Run the two SQL setup blocks (create tables, then enable RLS + public policies)
   // 3. Paste your Project URL and anon public key below.
   //    The anon key is meant to be public — it's safe in client-side code as
   //    long as your Row Level Security policies are set correctly.
const SUPABASE_URL = 'https://busaiboomhpoxlevjzre.supabase.co'; // project root — not /rest/v1/
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1c2FpYm9vbWhwb3hsZXZqenJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MTIwNTEsImV4cCI6MjEwNDk4ODA1MX0.tEDOOKt84bPUX3rs5ji3Z__auPgLhuFWwF74tMo9sVc';

const supabaseConfigured = SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY';
const supabaseClient = (supabaseConfigured && window.supabase)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

const SUBMIT_COOLDOWN_MS = 45000;
const lastSubmitAt = { guestbook: 0, song: 0 };
const recentPayloads = { guestbook: '', song: '' };

function looksLikeSpam(text) {
  const value = (text || '').trim();
  if (value.length < 2) return 'Please write a little more.';
  if (/(.)\1{8,}/.test(value)) return 'That looks like filler — try a real message.';
  const urls = value.match(/https?:\/\/|www\.|\.com\b|\.net\b|\.xyz\b|\.ru\b/gi) || [];
  if (urls.length >= 2) return 'Too many links — keep it to a note, not a promo.';
  const lower = value.toLowerCase();
  const spamTokens = ['crypto pump', 'casino', 'viagra', 'cialis', 'loan approval', 'seo backlink', 'telegram.me'];
  if (spamTokens.some(token => lower.includes(token))) return 'That message was blocked.';
  return null;
}

function canSubmit(kind, payloadKey) {
  const now = Date.now();
  if (now - lastSubmitAt[kind] < SUBMIT_COOLDOWN_MS) {
    const wait = Math.ceil((SUBMIT_COOLDOWN_MS - (now - lastSubmitAt[kind])) / 1000);
    return `Please wait ${wait}s before sending another note.`;
  }
  if (recentPayloads[kind] && recentPayloads[kind] === payloadKey) {
    return 'You already sent that.';
  }
  return null;
}

function markSubmitted(kind, payloadKey) {
  lastSubmitAt[kind] = Date.now();
  recentPayloads[kind] = payloadKey;
}

function formatEntryTime(isoString) {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
  } catch (err) {
    return '';
  }
}

function renderEntryList(container, entries, emptyMessage, renderItem) {
  if (!container) return;
  container.innerHTML = '';

  if (!entries || entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'guestbook-empty';
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  entries.forEach(entry => {
    container.insertAdjacentHTML('beforeend', renderItem(entry));
  });
}

// --- Guestbook ---
const guestbookForm = document.getElementById('guestbookForm');
const guestNameInput = document.getElementById('guestName');
const guestMessageInput = document.getElementById('guestMessage');
const guestbookSubmitBtn = document.getElementById('guestbookSubmit');
const guestbookStatus = document.getElementById('guestbookStatus');
const guestbookEntriesEl = document.getElementById('guestbookEntries');
const guestHoneypotInput = document.getElementById('guestWebsite');

function renderGuestbookEntry(entry) {
  return `
    <div class="guestbook-entry">
      <div class="guestbook-entry-name">${escapeHTML(entry.name)}</div>
      <div class="guestbook-entry-message">${escapeHTML(entry.message)}</div>
      <div class="guestbook-entry-time">${formatEntryTime(entry.created_at)}</div>
    </div>`;
}

async function loadGuestbookEntries() {
  if (!supabaseClient) {
    renderEntryList(guestbookEntriesEl, [], 'Guestbook isn\'t connected yet — check back soon!', renderGuestbookEntry);
    return;
  }
  const { data, error } = await supabaseClient
    .from('guestbook_entries')
    .select('name, message, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to load guestbook entries:', error);
    renderEntryList(guestbookEntriesEl, [], 'Couldn\'t load entries right now.', renderGuestbookEntry);
    return;
  }
  renderEntryList(guestbookEntriesEl, data, 'No public messages yet — be the first to sign!', renderGuestbookEntry);
}

if (guestbookForm) {
  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = guestNameInput.value.trim();
    const message = guestMessageInput.value.trim();
    if (!name || !message) return;

    const spamReason = looksLikeSpam(name) || looksLikeSpam(message);
    if (spamReason) {
      guestbookStatus.textContent = spamReason;
      setTimeout(() => { guestbookStatus.textContent = ''; }, 4000);
      return;
    }

    const payloadKey = name.toLowerCase() + '\n' + message.toLowerCase();
    const rateReason = canSubmit('guestbook', payloadKey);
    if (rateReason) {
      guestbookStatus.textContent = rateReason;
      setTimeout(() => { guestbookStatus.textContent = ''; }, 4000);
      return;
    }

    // Honeypot: a hidden field real visitors can't see or fill in. If it has
    // a value, this is almost certainly a bot — pretend to succeed so it
    // doesn't learn to look for a different signal, but skip the insert.
    if (guestHoneypotInput && guestHoneypotInput.value.trim() !== '') {
      guestNameInput.value = '';
      guestMessageInput.value = '';
      guestbookStatus.textContent = '★ Thank you for signing!';
      setTimeout(() => { guestbookStatus.textContent = ''; }, 4000);
      return;
    }

    if (!supabaseClient) {
      guestbookStatus.textContent = 'Guestbook isn\'t connected yet.';
      setTimeout(() => { guestbookStatus.textContent = ''; }, 4000);
      return;
    }

    guestbookSubmitBtn.disabled = true;
    guestbookStatus.textContent = 'Signing…';

    try {
      const { error } = await supabaseClient
        .from('guestbook_entries')
        .insert({ name, message });

      if (error) throw error;

      guestNameInput.value = '';
      guestMessageInput.value = '';
      markSubmitted('guestbook', payloadKey);
      guestbookStatus.textContent = '★ Thank you for signing!';
      loadGuestbookEntries();
    } catch (err) {
      console.error('Submission error:', err);
      const msg = err && err.message;
      guestbookStatus.textContent = msg && msg.indexOf('Too many notes') !== -1
        ? 'Too many notes. Please wait a few minutes.'
        : 'Failed to submit. Please try again.';
    } finally {
      guestbookSubmitBtn.disabled = false;
      setTimeout(() => {
        guestbookStatus.textContent = '';
      }, 4000);
    }
  });
}

// --- Song Suggestions ---
const songForm = document.getElementById('songForm');
const songNameInput = document.getElementById('songName');
const songNotesInput = document.getElementById('songNotes');
const songSubmitBtn = document.getElementById('songSubmit');
const songStatus = document.getElementById('songStatus');
const songSuggestionsEl = document.getElementById('songSuggestionsList');
const songHoneypotInput = document.getElementById('songWebsite');

function renderSongEntry(entry) {
  return `
    <div class="guestbook-entry">
      <div class="guestbook-entry-name">${escapeHTML(entry.song)}</div>
      <div class="guestbook-entry-message">${escapeHTML(entry.notes)}</div>
      <div class="guestbook-entry-time">${formatEntryTime(entry.created_at)}</div>
    </div>`;
}

async function loadSongSuggestions() {
  if (!supabaseClient) {
    renderEntryList(songSuggestionsEl, [], 'Song suggestions aren\'t connected yet — check back soon!', renderSongEntry);
    return;
  }
  const { data, error } = await supabaseClient
    .from('song_suggestions')
    .select('song, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Failed to load song suggestions:', error);
    renderEntryList(songSuggestionsEl, [], 'Couldn\'t load suggestions right now.', renderSongEntry);
    return;
  }
  renderEntryList(songSuggestionsEl, data, 'No suggestions yet — be the first!', renderSongEntry);
}

if (songForm) {
  songForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const song = songNameInput.value.trim();
    const notes = songNotesInput.value.trim();
    if (!song || !notes) return;

    const spamReason = looksLikeSpam(song) || looksLikeSpam(notes);
    if (spamReason) {
      songStatus.textContent = spamReason;
      setTimeout(() => { songStatus.textContent = ''; }, 4000);
      return;
    }

    const payloadKey = song.toLowerCase() + '\n' + notes.toLowerCase();
    const rateReason = canSubmit('song', payloadKey);
    if (rateReason) {
      songStatus.textContent = rateReason;
      setTimeout(() => { songStatus.textContent = ''; }, 4000);
      return;
    }

    // Honeypot: see the matching comment in the guestbook handler above.
    if (songHoneypotInput && songHoneypotInput.value.trim() !== '') {
      songNameInput.value = '';
      songNotesInput.value = '';
      songStatus.textContent = '★ Song suggestion sent!';
      setTimeout(() => { songStatus.textContent = ''; }, 4000);
      return;
    }

    if (!supabaseClient) {
      songStatus.textContent = 'Song suggestions aren\'t connected yet.';
      setTimeout(() => { songStatus.textContent = ''; }, 4000);
      return;
    }

    songSubmitBtn.disabled = true;
    songStatus.textContent = 'Sending…';

    try {
      const { error } = await supabaseClient
        .from('song_suggestions')
        .insert({ song, notes });

      if (error) throw error;

      songNameInput.value = '';
      songNotesInput.value = '';
      markSubmitted('song', payloadKey);
      songStatus.textContent = '★ Song suggestion sent!';
      loadSongSuggestions();
    } catch (err) {
      console.error('Submission error:', err);
      const msg = err && err.message;
      songStatus.textContent = msg && msg.indexOf('Too many notes') !== -1
        ? 'Too many notes. Please wait a few minutes.'
        : 'Failed to send. Please try again.';
    } finally {
      songSubmitBtn.disabled = false;
      setTimeout(() => {
        songStatus.textContent = '';
      }, 4000);
    }
  });
}

loadGuestbookEntries();
loadSongSuggestions();
    // WebGL Fluid Solver Initialization
    const canvas = document.getElementById('canvas');
    const themeBtn = document.getElementById('themeBtn');

    const THEME_KEY = 'y2k-theme';
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    let storedTheme = null;
    try { storedTheme = localStorage.getItem(THEME_KEY); } catch (err) { storedTheme = null; }
    let isDarkMode = storedTheme === 'light' ? false : storedTheme === 'dark' ? true : !prefersLight;

    function syncThemeButton() {
      const light = !isDarkMode;
      document.body.classList.toggle('light-mode', light);
      themeBtn.setAttribute('aria-pressed', light ? 'true' : 'false');
      themeBtn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    }

    syncThemeButton();

    resizeCanvas();

    // Scale the simulation down on smaller/lower-power devices, and respect
    // a visitor's reduced-motion preference instead of forcing the effect on them.
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLowPower = window.innerWidth < 768 || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

    const config = isLowPower
      ? {
          SIM_RESOLUTION: 96,
          DYE_RESOLUTION: 256,
          DENSITY_DISSIPATION: 0.96,
          VELOCITY_DISSIPATION: 0.98,
          PRESSURE_ITERATIONS: 12,
          CURL: 30,
          SPLAT_RADIUS: 0.25
        }
      : {
          SIM_RESOLUTION: 128,
          DYE_RESOLUTION: 512,
          DENSITY_DISSIPATION: 0.96,
          VELOCITY_DISSIPATION: 0.98,
          PRESSURE_ITERATIONS: 20,
          CURL: 30,
          SPLAT_RADIUS: 0.25
        };

    let pointer = { x: 0, y: 0, dx: 0, dy: 0 };
    let splatStack = [];

    const fallbackBg = document.getElementById('fallbackBg');

    // Try to get a WebGL context; if it's unavailable (older browser, disabled
    // hardware acceleration, some in-app webviews) or the visitor asked for
    // reduced motion, fall back to a static CSS gradient instead of crashing.
    let gl = null;
    let webglAvailable = false;
    if (!prefersReducedMotion) {
      try {
        gl = canvas.getContext('webgl', { alpha: false, depth: false, stencil: false, antialias: false });
        webglAvailable = !!gl;
      } catch (err) {
        webglAvailable = false;
      }
    }

    if (!webglAvailable) {
      canvas.style.display = 'none';
      fallbackBg.style.display = 'block';
    }

    function showCssFallback() {
      webglAvailable = false;
      canvas.style.display = 'none';
      if (fallbackBg) fallbackBg.style.display = 'block';
    }

    const ext = webglAvailable ? {
      formatRGBA: gl.RGBA,
      halfFloat: (() => {
        const halfFloat = gl.getExtension('OES_texture_half_float');
        gl.getExtension('OES_texture_half_float_linear');
        return halfFloat ? halfFloat.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
      })()
    } : null;

    function createShader(gl, type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    function createProgram(gl, vertexSource, fragmentSource) {
      const vs = createShader(gl, gl.VERTEX_SHADER, vertexSource);
      const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      if (!vs || !fs) return null;
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
      }
      return program;
    }

    function uniformMap(program, names) {
      const map = {};
      names.forEach((name) => {
        map[name] = gl.getUniformLocation(program, name);
      });
      return map;
    }

    const baseVS = `
      precision highp float;
      attribute vec2 aPosition;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform vec2 texelSize;
      void main () {
          vUv = aPosition * 0.5 + 0.5;
          vL = vUv - vec2(texelSize.x, 0.0);
          vR = vUv + vec2(texelSize.x, 0.0);
          vT = vUv + vec2(0.0, texelSize.y);
          vB = vUv - vec2(0.0, texelSize.y);
          gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;

    const splatFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspect;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;
      void main () {
          vec2 p = vUv - point.xy;
          p.x *= aspect;
          vec3 splat = exp(-dot(p, p) / radius) * color;
          vec3 base = texture2D(uTarget, vUv).xyz;
          gl_FragColor = vec4(base + splat, 1.0);
      }
    `;

    const advectFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform float dt;
      uniform float dissipation;
      void main () {
          vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
          gl_FragColor = dissipation * texture2D(uSource, coord);
      }
    `;

    const curlFS = `
      precision highp float;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uVelocity;
      void main () {
          float L = texture2D(uVelocity, vL).y;
          float R = texture2D(uVelocity, vR).y;
          float T = texture2D(uVelocity, vT).x;
          float B = texture2D(uVelocity, vB).x;
          float vorticity = R - L - T + B;
          gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
      }
    `;

    const vorticityFS = `
      precision highp float;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;
      void main () {
          float L = texture2D(uCurl, vL).x;
          float R = texture2D(uCurl, vR).x;
          float T = texture2D(uCurl, vT).x;
          float B = texture2D(uCurl, vB).x;
          float C = texture2D(uCurl, vUv).x;
          vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
          force /= length(force) + 0.0001;
          force *= curl * C;
          force.y *= -1.0;
          vec2 vel = texture2D(uVelocity, vUv).xy;
          gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
      }
    `;

    const divergenceFS = `
      precision highp float;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uVelocity;
      void main () {
          float L = texture2D(uVelocity, vL).x;
          float R = texture2D(uVelocity, vR).x;
          float T = texture2D(uVelocity, vT).y;
          float B = texture2D(uVelocity, vB).y;
          vec2 C = texture2D(uVelocity, vUv).xy;
          if (vL.x < 0.0) { L = -C.x; }
          if (vR.x > 1.0) { R = -C.x; }
          if (vT.y > 1.0) { T = -C.y; }
          if (vB.y < 0.0) { B = -C.y; }
          float div = 0.5 * (R - L + T - B);
          gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
    `;

    const pressureFS = `
      precision highp float;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;
      void main () {
          float L = texture2D(uPressure, vL).x;
          float R = texture2D(uPressure, vR).x;
          float T = texture2D(uPressure, vT).x;
          float B = texture2D(uPressure, vB).x;
          float div = texture2D(uDivergence, vUv).x;
          float pressure = (L + R + B + T - div) * 0.25;
          gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }
    `;

    const gradientSubtractFS = `
      precision highp float;
      varying vec2 vUv, vL, vR, vT, vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;
      void main () {
          float L = texture2D(uPressure, vL).x;
          float R = texture2D(uPressure, vR).x;
          float T = texture2D(uPressure, vT).x;
          float B = texture2D(uPressure, vB).x;
          vec2 velocity = texture2D(uVelocity, vUv).xy;
          velocity.xy -= vec2(R - L, T - B) * 0.5;
          gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
    `;

    const displayFS = `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float uInvert;
      void main () {
          vec3 c = texture2D(uTexture, vUv).rgb;
          if (uInvert > 0.5) {
              c = 1.0 - c;
          }
          gl_FragColor = vec4(c, 1.0);
      }
    `;

    let splatProg, advectProg, curlProg, vorticityProg, divergenceProg, pressureProg, gradSubProg, displayProg;
    let U = null;
    let dye, velocity, curl, divergence, pressure;

    function createFBO(w, h, pixelType) {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, pixelType, null);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (!ok) {
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(fbo);
        return null;
      }
      return {
        texture, fbo, width: w, height: h,
        attach(id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        }
      };
    }

    function createDoubleFBO(w, h, pixelType) {
      let fbo1 = createFBO(w, h, pixelType);
      let fbo2 = createFBO(w, h, pixelType);
      if (!fbo1 || !fbo2) return null;
      return {
        get read() { return fbo1; },
        set read(val) { fbo1 = val; },
        get write() { return fbo2; },
        set write(val) { fbo2 = val; },
        swap() { const temp = fbo1; fbo1 = fbo2; fbo2 = temp; }
      };
    }

    function allocTargets(pixelType) {
      const next = {
        dye: createDoubleFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION, pixelType),
        velocity: createDoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, pixelType),
        curl: createFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, pixelType),
        divergence: createFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, pixelType),
        pressure: createDoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, pixelType)
      };
      if (!next.dye || !next.velocity || !next.curl || !next.divergence || !next.pressure) return null;
      return next;
    }

    if (webglAvailable) {
      splatProg = createProgram(gl, baseVS, splatFS);
      advectProg = createProgram(gl, baseVS, advectFS);
      curlProg = createProgram(gl, baseVS, curlFS);
      vorticityProg = createProgram(gl, baseVS, vorticityFS);
      divergenceProg = createProgram(gl, baseVS, divergenceFS);
      pressureProg = createProgram(gl, baseVS, pressureFS);
      gradSubProg = createProgram(gl, baseVS, gradientSubtractFS);
      displayProg = createProgram(gl, baseVS, displayFS);

      const programs = [splatProg, advectProg, curlProg, vorticityProg, divergenceProg, pressureProg, gradSubProg, displayProg];
      if (programs.some((program) => !program)) {
        console.error('Fluid shaders failed to compile.');
        showCssFallback();
      } else {
        U = {
          splat: uniformMap(splatProg, ['uTarget', 'aspect', 'color', 'point', 'radius']),
          advect: uniformMap(advectProg, ['texelSize', 'uVelocity', 'uSource', 'dt', 'dissipation']),
          curl: uniformMap(curlProg, ['texelSize', 'uVelocity']),
          vorticity: uniformMap(vorticityProg, ['texelSize', 'uVelocity', 'uCurl', 'curl', 'dt']),
          divergence: uniformMap(divergenceProg, ['texelSize', 'uVelocity']),
          pressure: uniformMap(pressureProg, ['texelSize', 'uDivergence', 'uPressure']),
          gradSub: uniformMap(gradSubProg, ['texelSize', 'uPressure', 'uVelocity']),
          display: uniformMap(displayProg, ['uTexture', 'uInvert'])
        };
        let targets = allocTargets(ext.halfFloat);
        if (!targets && ext.halfFloat !== gl.UNSIGNED_BYTE) {
          console.warn('Half-float framebuffers unavailable; using 8-bit.');
          targets = allocTargets(gl.UNSIGNED_BYTE);
        }
        if (!targets) {
          console.error('Fluid framebuffers are incomplete.');
          showCssFallback();
        } else {
          dye = targets.dye;
          velocity = targets.velocity;
          curl = targets.curl;
          divergence = targets.divergence;
          pressure = targets.pressure;
        }
      }
    }

    const blit = webglAvailable ? (() => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);

      return destination => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, destination ? destination.fbo : null);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };
    })() : null;

    let lastTime = Date.now();

    function update() {
      resizeCanvas();
      const dt = Math.min((Date.now() - lastTime) / 1000, 0.016);
      lastTime = Date.now();

      while (splatStack.length > 0) {
        const s = splatStack.pop();
        splat(s.x, s.y, s.dx, s.dy, s.color, s.radius);
      }

      gl.viewport(0, 0, velocity.read.width, velocity.read.height);
      gl.useProgram(advectProg);
      gl.uniform2f(U.advect.texelSize, 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(U.advect.uVelocity, velocity.read.attach(0));
      gl.uniform1i(U.advect.uSource, velocity.read.attach(0));
      gl.uniform1f(U.advect.dt, dt);
      gl.uniform1f(U.advect.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      gl.useProgram(curlProg);
      gl.uniform2f(U.curl.texelSize, 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(U.curl.uVelocity, velocity.read.attach(0));
      blit(curl);

      gl.useProgram(vorticityProg);
      gl.uniform2f(U.vorticity.texelSize, 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(U.vorticity.uVelocity, velocity.read.attach(0));
      gl.uniform1i(U.vorticity.uCurl, curl.attach(1));
      gl.uniform1f(U.vorticity.curl, config.CURL);
      gl.uniform1f(U.vorticity.dt, dt);
      blit(velocity.write);
      velocity.swap();

      gl.useProgram(divergenceProg);
      gl.uniform2f(U.divergence.texelSize, 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(U.divergence.uVelocity, velocity.read.attach(0));
      blit(divergence);

      gl.useProgram(pressureProg);
      gl.uniform2f(U.pressure.texelSize, 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(U.pressure.uDivergence, divergence.attach(0));
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(U.pressure.uPressure, pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }

      gl.useProgram(gradSubProg);
      gl.uniform2f(U.gradSub.texelSize, 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(U.gradSub.uPressure, pressure.read.attach(0));
      gl.uniform1i(U.gradSub.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      gl.viewport(0, 0, dye.read.width, dye.read.height);
      gl.useProgram(advectProg);
      gl.uniform2f(U.advect.texelSize, 1.0 / dye.read.width, 1.0 / dye.read.height);
      gl.uniform1i(U.advect.uVelocity, velocity.read.attach(0));
      gl.uniform1i(U.advect.uSource, dye.read.attach(1));
      gl.uniform1f(U.advect.dt, dt);
      gl.uniform1f(U.advect.dissipation, config.DENSITY_DISSIPATION);
      blit(dye.write);
      dye.swap();

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(displayProg);
      gl.uniform1i(U.display.uTexture, dye.read.attach(0));
      gl.uniform1f(U.display.uInvert, isDarkMode ? 0.0 : 1.0);
      blit(null);

      requestAnimationFrame(update);
    }

    function splat(x, y, dx, dy, color, radiusScale) {
      const radius = (config.SPLAT_RADIUS / 100) * (radiusScale || 1);
      gl.viewport(0, 0, velocity.read.width, velocity.read.height);
      gl.useProgram(splatProg);
      gl.uniform1i(U.splat.uTarget, velocity.read.attach(0));
      gl.uniform1f(U.splat.aspect, canvas.width / canvas.height);
      gl.uniform2f(U.splat.point, x, y);
      gl.uniform3f(U.splat.color, dx, dy, 0.0);
      gl.uniform1f(U.splat.radius, radius);
      blit(velocity.write);
      velocity.swap();

      gl.viewport(0, 0, dye.read.width, dye.read.height);
      gl.uniform1i(U.splat.uTarget, dye.read.attach(0));
      gl.uniform1f(U.splat.aspect, canvas.width / canvas.height);
      gl.uniform2f(U.splat.point, x, y);
      gl.uniform3f(U.splat.color, color[0], color[1], color[2]);
      gl.uniform1f(U.splat.radius, radius);
      blit(dye.write);
      dye.swap();
    }

    function resizeCanvas() {
      if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    }

    function generateColor() {
      let c = [Math.random() + 0.2, Math.random() + 0.2, Math.random() + 0.2];
      return [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35];
    }

    function updatePointer(clientX, clientY) {
      const x = clientX / window.innerWidth;
      const y = 1.0 - clientY / window.innerHeight;
      const dx = (x - pointer.x) * 10.0;
      const dy = (y - pointer.y) * 10.0;

      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        splatStack.push({ x, y, dx, dy, color: generateColor() });
      }

      pointer.x = x;
      pointer.y = y;
    }

    // The reaper stirs the same fluid the cursor does. vx/vy are pixels
    // moved since the last stir. Reduced motion never gets here.
    if (webglAvailable) {
      window.y2kWake = function (clientX, clientY, vx, vy) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const x = clientX / w;
        const y = 1.0 - clientY / h;
        let dx = (vx / w) * 10;
        let dy = -(vy / h) * 10;
        const mag = Math.hypot(dx, dy) || 1;
        if (mag > 0.16) {
          dx = dx / mag * 0.16;
          dy = dy / mag * 0.16;
        }
        splatStack.push({
          x: x,
          y: y,
          dx: dx,
          dy: dy,
          color: [0.22, 0.04, 0.38],
          radius: 0.35
        });
      };

      window.y2kPulse = function (clientX, clientY) {
        const x = clientX / window.innerWidth;
        const y = 1.0 - clientY / window.innerHeight;
        splatStack.push({
          x: x,
          y: y,
          dx: (Math.random() - 0.5) * 0.25,
          dy: (Math.random() - 0.5) * 0.25,
          color: [0.42, 0.08, 0.72],
          radius: 1
        });
      };

      window.y2kDismiss = function (clientX, clientY) {
        const x = clientX / window.innerWidth;
        const y = 1.0 - clientY / window.innerHeight;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          splatStack.push({
            x: x + Math.cos(a) * 0.018,
            y: y + Math.sin(a) * 0.018,
            dx: -Math.cos(a) * 0.55,
            dy: -Math.sin(a) * 0.55,
            color: [0.32, 0.06, 0.55],
            radius: 0.36
          });
        }
      };

      window.y2kBurst = function (clientX, clientY) {
        const x = clientX / window.innerWidth;
        const y = 1.0 - clientY / window.innerHeight;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          splatStack.push({
            x: x,
            y: y,
            dx: Math.cos(a) * 0.38,
            dy: Math.sin(a) * 0.38,
            color: [0.48, 0.1, 0.82],
            radius: 1.35
          });
        }
      };
    }

    themeBtn.addEventListener('click', () => {
      isDarkMode = !isDarkMode;
      syncThemeButton();
      try { localStorage.setItem(THEME_KEY, isDarkMode ? 'dark' : 'light'); } catch (err) {}
    });

    function isFluidGestureTarget(node) {
      return !(node && node.closest && node.closest(
        '.modal-content, .music-widget-wrapper, nav.bottom-nav, .ghost-pet, a, button, input, textarea, select, label'
      ));
    }

    if (webglAvailable) {
      window.addEventListener('mousemove', e => updatePointer(e.clientX, e.clientY));

      let fluidTouchId = null;
      window.addEventListener('touchstart', e => {
        const t = e.changedTouches[0];
        if (!isFluidGestureTarget(e.target)) {
          fluidTouchId = null;
          return;
        }
        fluidTouchId = t.identifier;
        pointer.x = t.clientX / window.innerWidth;
        pointer.y = 1.0 - t.clientY / window.innerHeight;
      }, { passive: true });

      window.addEventListener('touchmove', e => {
        if (fluidTouchId == null) return;
        const t = Array.prototype.find.call(e.changedTouches, (touch) => touch.identifier === fluidTouchId);
        if (!t) return;
        if (e.cancelable) e.preventDefault();
        updatePointer(t.clientX, t.clientY);
      }, { passive: false });

      window.addEventListener('touchend', e => {
        const t = Array.prototype.find.call(e.changedTouches, (touch) => touch.identifier === fluidTouchId);
        if (t) fluidTouchId = null;
      }, { passive: true });
    }

    // Modals Handling
    const modalContainer = document.getElementById('modalContainer');
    const modalContent = modalContainer.querySelector('.modal-content');
    const closeModalBtn = document.getElementById('closeModal');
    const navLinks = document.querySelectorAll('nav.bottom-nav .nav-link');
    const modalSections = document.querySelectorAll('.modal-section');

    let lastFocusedElement = null;

    function openModal(targetId) {
      lastFocusedElement = document.activeElement;

      modalSections.forEach(section => {
        section.classList.toggle('active', section.id === targetId);
      });

      const heading = document.getElementById(targetId + '-heading');
      if (heading) {
        modalContainer.setAttribute('aria-labelledby', heading.id);
      }

      modalContainer.classList.add('active');
      modalContainer.setAttribute('aria-modal', 'true');
      modalContainer.setAttribute('aria-hidden', 'false');
      closeModalBtn.focus();
    }

    function closeModalDialog() {
      modalContainer.classList.remove('active');
      modalContainer.setAttribute('aria-modal', 'false');
      modalContainer.setAttribute('aria-hidden', 'true');
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        openModal(link.getAttribute('data-target'));
      });
    });

    // Any other element that wants to open a modal section (e.g. the
    // "LEAVE A SONG" link inside the playlist dropdown) just needs a
    // data-open-modal attribute — no inline onclick or global function.
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-open-modal]');
      if (trigger) openModal(trigger.dataset.openModal);
    });

    closeModalBtn.addEventListener('click', closeModalDialog);
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) closeModalDialog();
    });

    // Escape closes the dialog, and Tab is trapped inside it while it's open
    document.addEventListener('keydown', (e) => {
      if (!modalContainer.classList.contains('active')) return;

      if (e.key === 'Escape') {
        closeModalDialog();
        return;
      }

      if (e.key === 'Tab') {
        const activeSection = modalContent.querySelector('.modal-section.active');
        const focusable = [closeModalBtn];
        if (activeSection) {
          activeSection.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])').forEach((el) => {
            focusable.push(el);
          });
        }
        const visible = focusable.filter((el) => !el.disabled && el.tabIndex !== -1 && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        if (visible.length === 0) return;
        const first = visible[0];
        const last = visible[visible.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    if (webglAvailable) {
      update();
    }

// Global State
let manaLevel = 100;

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('ghost-pet-container');
  const ghostBody = document.getElementById('ghost-character');
  
  if (!container || !ghostBody) return;

  // --- DRAGGABLE LOGIC ---
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  let pos = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let interactionPause = false;
  let idleTimer = null;
  let roamEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const eyesFollow = roamEnabled;

  function clearIdle() {
    if (!idleTimer) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function startDrag(clientX, clientY) {
    // Use a type/NaN check, not truthiness — clientX/clientY of 0 (top-left
    // corner of the screen) is a perfectly valid coordinate but is falsy,
    // which was silently cancelling drags that started there.
    if (typeof clientX !== 'number' || typeof clientY !== 'number' || Number.isNaN(clientX) || Number.isNaN(clientY)) return;

    clearIdle();
    isDragging = true;
    interactionPause = true;
    const rect = container.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;

    pos.x = rect.left;
    pos.y = rect.top;
    setPosition(pos.x, pos.y);
    ghostBody.classList.add('is-moving');
  }

  function moveDrag(clientX, clientY) {
    if (!isDragging) return;
    const b = getBounds();
    pos.x = clamp(clientX - offsetX, b.minX, b.maxX);
    pos.y = clamp(clientY - offsetY, b.minY, b.maxY);
    setPosition(pos.x, pos.y);
    stirFromMotion();
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    interactionPause = false;
    ghostBody.classList.remove('is-moving');
    clearIdle();
    // Resume roaming from wherever the pet was dropped.
    pickNewTarget();
  }

  // Mouse Listeners
  ghostBody.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
  document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  document.addEventListener('mouseup', stopDrag);

  // Touch Listeners — preventDefault (with passive:false) so dragging the
  // pet doesn't also scroll the page on mobile.
  ghostBody.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    moveDrag(touch.clientX, touch.clientY);
  }, { passive: false });

  document.addEventListener('touchend', stopDrag);

  // Pause roaming while the pointer is over the pet so its action buttons
  // stay put and are easy to click.
  container.addEventListener('mouseenter', () => { interactionPause = true; });
  container.addEventListener('mouseleave', () => { if (!isDragging) interactionPause = false; });

  // --- ROAMING LOGIC ---
  // The pet wanders the viewport on its own, pausing whenever it's being
  // dragged or hovered, and respects prefers-reduced-motion.

  function clamp(val, min, max) {
    if (max < min) return min; // viewport smaller than the pet — pin it
    return Math.min(Math.max(val, min), max);
  }

  function getBounds() {
    const rect = container.getBoundingClientRect();
    const margin = 12;
    return {
      minX: margin,
      minY: margin,
      maxX: window.innerWidth - rect.width - margin,
      maxY: window.innerHeight - rect.height - margin
    };
  }

  function setPosition(x, y) {
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.style.bottom = 'auto';
    container.style.right = 'auto';
  }

  let lastStir = { x: 0, y: 0, ready: false };

  function stirFromMotion() {
    if (typeof window.y2kWake !== 'function') return;
    if (!lastStir.ready) {
      lastStir.x = pos.x;
      lastStir.y = pos.y;
      lastStir.ready = true;
      return;
    }
    const vx = pos.x - lastStir.x;
    const vy = pos.y - lastStir.y;
    if (Math.hypot(vx, vy) < 8) return;
    lastStir.x = pos.x;
    lastStir.y = pos.y;
    const rect = ghostBody.getBoundingClientRect();
    const face = ghostBody.querySelector('.ghost-svg');
    const flipped = !!(face && face.style.transform.indexOf('-1') !== -1);
    window.y2kWake(
      rect.left + rect.width * (flipped ? 0.68 : 0.32),
      rect.top + rect.height * 0.36,
      vx,
      vy
    );
  }

  function pickNewTarget() {
    const b = getBounds();
    target.x = b.minX + Math.random() * Math.max(0, b.maxX - b.minX);
    target.y = b.minY + Math.random() * Math.max(0, b.maxY - b.minY);
  }

  function roamStep() {
    if (!roamEnabled) return;

    if (!isDragging && !interactionPause) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        ghostBody.classList.remove('is-moving');
        if (!idleTimer) {
          idleTimer = setTimeout(() => {
            idleTimer = null;
            if (roamEnabled && !isDragging && !interactionPause) pickNewTarget();
          }, 1500 + Math.random() * 2500);
        }
      } else {
        clearIdle();
        ghostBody.classList.add('is-moving');
        const speed = Math.min(1.1, dist * 0.04);
        pos.x += (dx / dist) * speed;
        pos.y += (dy / dist) * speed;
        setPosition(pos.x, pos.y);

        const svg = ghostBody.querySelector('.ghost-svg');
        if (svg && Math.abs(dx) > 2) {
          svg.style.transform = dx < 0 ? 'scaleX(-1)' : 'scaleX(1)';
        }
        stirFromMotion();
      }
    }

    requestAnimationFrame(roamStep);
  }

  function startRoaming() {
    const rect = container.getBoundingClientRect();
    pos.x = rect.left;
    pos.y = rect.top;
    setPosition(pos.x, pos.y);

    if (!roamEnabled) return; // stay put but remain draggable

    pickNewTarget();
    requestAnimationFrame(roamStep);
  }

  // Keep the pet on-screen if the window is resized/rotated.
  window.addEventListener('resize', () => {
    const b = getBounds();
    pos.x = clamp(pos.x, b.minX, b.maxX);
    pos.y = clamp(pos.y, b.minY, b.maxY);
    setPosition(pos.x, pos.y);
  });

  // Ghost action buttons (Spell/Mana/Summon/Dance/Vanish) use data-ghost-action
  // attributes rather than inline onclick, so delegate from the container.
  container.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-ghost-action]');
    if (actionBtn) ghostAction(actionBtn.dataset.ghostAction);
  });

  if (eyesFollow) {
    window.addEventListener('pointermove', (e) => {
      const rect = ghostBody.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.42;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const ang = Math.atan2(dy, dx);
      const dist = Math.min(3.4, Math.hypot(dx, dy) / 70);
      const svg = ghostBody.querySelector('svg');
      const flipped = svg && svg.style.transform.indexOf('-1') !== -1;
      container.style.setProperty('--eye-x', (Math.cos(ang) * dist * (flipped ? -1 : 1)).toFixed(2) + 'px');
      container.style.setProperty('--eye-y', (Math.sin(ang) * dist).toFixed(2) + 'px');
    });
  }

  syncMana();
  startRoaming();
});

// --- ACTIONS ---
function syncMana() {
  const fill = document.getElementById('ghostManaFill');
  const bar = document.getElementById('ghostMana');
  if (fill) fill.style.width = manaLevel + '%';
  if (bar) {
    bar.setAttribute('aria-valuenow', String(manaLevel));
    bar.classList.toggle('is-empty', manaLevel <= 0);
  }
  document.querySelectorAll('[data-cost]').forEach((btn) => {
    btn.classList.toggle('is-locked', manaLevel < Number(btn.dataset.cost));
  });
}

function ghostCenter() {
  const ghost = document.getElementById('ghost-character');
  const rect = ghost.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.45 };
}

function floatSoul(text, kind) {
  const c = ghostCenter();
  const pop = document.createElement('div');
  pop.className = 'soul-pop' + (kind ? ' ' + kind : '');
  pop.textContent = text;
  pop.style.left = (c.x - 18) + 'px';
  pop.style.top = (c.y - 16) + 'px';
  document.body.appendChild(pop);
  setTimeout(() => pop.remove(), 800);
}

let chain = 0;
let lastCast = 0;
let pactUntil = 0;
let hexed = false;

function spendSoul(cost, speech) {
  if (manaLevel < cost) {
    speech.textContent = 'Empty. Seal a pact.';
    floatSoul('EMPTY', 'is-need');
    return false;
  }
  const now = Date.now();
  chain = now - lastCast < 2200 ? chain + 1 : 1;
  lastCast = now;
  manaLevel -= cost;
  if (chain >= 2) manaLevel = Math.min(100, manaLevel + 5);
  syncMana();
  floatSoul(chain >= 2 ? '-' + cost + ' x' + chain : '-' + cost);
  return true;
}

function ghostAction(type) {
  const speech = document.getElementById('ghost-speech');
  const ghost = document.getElementById('ghost-character');
  const pactBtn = document.querySelector('[data-ghost-action="mana"]');

  ghost.classList.remove('dancing', 'reaping', 'mana-glow', 'casting');

  if (type === 'hex') {
    if (!spendSoul(25, speech)) return;
    speech.textContent = document.querySelector('.prey-ghost:not(.is-caught)') ? 'They crawl.' : 'Hexed.';
    ghost.classList.add('mana-glow');
    if (huntEnds > Date.now()) {
      hexed = true;
      document.querySelectorAll('.prey-ghost:not(.is-caught)').forEach((el) => el.classList.add('is-hexed'));
    }
    spawnHexMark();
    if (typeof window.y2kPulse === 'function') {
      const c = ghostCenter();
      window.y2kPulse(c.x, c.y);
    }
    setTimeout(() => ghost.classList.remove('mana-glow'), 900);

  } else if (type === 'mana') {
    if (Date.now() < pactUntil) {
      speech.textContent = 'The pact is still warm.';
      return;
    }
    pactUntil = Date.now() + 6000;
    if (pactBtn) {
      pactBtn.classList.add('is-cooling');
      setTimeout(() => pactBtn.classList.remove('is-cooling'), 6000);
    }
    manaLevel = Math.min(100, manaLevel + 35);
    syncMana();
    speech.textContent = 'Pact sealed. Soul ' + manaLevel + '.';
    floatSoul('+35', 'is-gain');
    ghost.classList.add('mana-glow');

  } else if (type === 'summon') {
    if (!spendSoul(30, speech)) return;
    speech.textContent = 'Ten seconds. Catch them.';
    spawnFamiliars();
    spawnCatchGhosts();
    burstHere();

  } else if (type === 'reap') {
    if (!spendSoul(15, speech)) return;
    speech.textContent = 'Reaped.';
    ghost.classList.remove('dancing');
    ghost.classList.add('reaping');
    spawnScythe();
    burstHere();
    setTimeout(() => ghost.classList.remove('reaping'), 900);

  } else if (type === 'vanish') {
    if (!spendSoul(20, speech)) return;
    speech.textContent = 'Sent back.';
    if (typeof window.y2kDismiss === 'function') {
      const c = ghostCenter();
      window.y2kDismiss(c.x, c.y);
    }
    ghost.classList.add('is-gone');
    ghost.classList.remove('is-back');
    setTimeout(() => {
      ghost.classList.remove('is-gone');
      ghost.classList.add('is-back');
      speech.textContent = 'I remain.';
      burstHere();
      setTimeout(() => ghost.classList.remove('is-back'), 450);
    }, 1500);
  }
}

function burstHere() {
  if (typeof window.y2kBurst !== 'function') return;
  const c = ghostCenter();
  window.y2kBurst(c.x, c.y);
}

function spawnScythe() {
  const c = ghostCenter();
  const cut = document.createElement('div');
  cut.className = 'scythe-cut';
  cut.style.left = c.x + 'px';
  cut.style.top = c.y + 'px';
  document.body.appendChild(cut);
  setTimeout(() => cut.remove(), 520);
}

function spawnHexMark() {
  const c = ghostCenter();
  const mark = document.createElement('div');
  mark.className = 'hex-mark';
  mark.style.left = c.x + 'px';
  mark.style.top = c.y + 'px';
  document.body.appendChild(mark);
  setTimeout(() => mark.remove(), 950);
}

function spawnCastRing() {
  const c = ghostCenter();
  for (let i = 0; i < 2; i++) {
    const ring = document.createElement('div');
    ring.className = 'cast-ring';
    ring.style.left = c.x + 'px';
    ring.style.top = c.y + 'px';
    ring.style.animationDelay = (i * 120) + 'ms';
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 1000);
  }
}

let score = 0;
let best = 0;
let roundScore = 0;
try { score = parseInt(localStorage.getItem('y2k-score') || '0', 10) || 0; } catch (err) { score = 0; }
try { best = parseInt(localStorage.getItem('y2k-best') || '0', 10) || 0; } catch (err) { best = 0; }

function paintScore() {
  const el = document.getElementById('scoreCount');
  if (el) el.textContent = String(score).padStart(6, '0');
  const bestEl = document.getElementById('bestCount');
  if (bestEl) bestEl.textContent = String(best).padStart(2, '0');
}
paintScore();

function addScore(n) {
  score += n;
  roundScore += n;
  paintScore();
  try { localStorage.setItem('y2k-score', String(score)); } catch (err) {}
}

function spawnCatchGhosts() {
  const room = 8 - document.querySelectorAll('.prey-ghost:not(.is-caught)').length;
  const count = Math.min(5, room);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'prey-ghost';
    el.setAttribute('aria-label', 'Catch');
    const pad = 40;
    el._x = pad + Math.random() * Math.max(40, window.innerWidth - pad * 2 - 40);
    el._y = 72 + Math.random() * Math.max(40, window.innerHeight - 180);
    el._tx = el._x;
    el._ty = el._y;
    el._next = 0;
    el.style.left = el._x + 'px';
    el.style.top = el._y + 'px';
    if (hexed) el.classList.add('is-hexed');
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (el.classList.contains('is-caught')) return;
      el.classList.add('is-caught');
      addScore(1);
      const pop = document.createElement('div');
      pop.className = 'soul-pop is-gain';
      pop.textContent = '+1';
      pop.style.left = el.style.left;
      pop.style.top = el.style.top;
      document.body.appendChild(pop);
      setTimeout(() => pop.remove(), 800);
      setTimeout(() => {
        el.remove();
        if (!document.querySelector('.prey-ghost:not(.is-caught)')) finishHunt();
      }, 260);
    });
    document.body.appendChild(el);
  }
  beginHunt();
}

let huntEnds = 0;
let huntTick = null;
let huntFrame = null;
const huntReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function paintHunt() {}

function beginHunt() {
  if (!(huntEnds > Date.now())) roundScore = 0;
  huntEnds = Date.now() + 10000;
  paintHunt(10000);
  if (!huntTick) huntTick = setInterval(tickHunt, 200);
  if (!huntReduceMotion && !huntFrame) huntFrame = requestAnimationFrame(movePrey);
}

function tickHunt() {
  const left = huntEnds - Date.now();
  if (left <= 0) {
    finishHunt();
    return;
  }
  paintHunt(left);
}

function finishHunt() {
  if (!huntEnds) return;
  const caught = roundScore;
  roundScore = 0;
  hexed = false;
  huntEnds = 0;
  if (huntTick) clearInterval(huntTick);
  huntTick = null;
  paintHunt(0);
  document.querySelectorAll('.prey-ghost').forEach((node) => node.remove());
  if (caught > best) {
    best = caught;
    try { localStorage.setItem('y2k-best', String(best)); } catch (err) {}
    paintScore();
    const speech = document.getElementById('ghost-speech');
    if (speech) speech.textContent = 'New mark. ' + caught + '.';
  }
}

function movePrey(now) {
  const nodes = document.querySelectorAll('.prey-ghost:not(.is-caught)');
  if (!nodes.length || !huntEnds) {
    huntFrame = null;
    return;
  }
  const pad = 28;
  const maxX = Math.max(pad, window.innerWidth - pad - 40);
  const maxY = Math.max(80, window.innerHeight - 80);
  nodes.forEach((el) => {
    const step = hexed ? 0.012 : 0.045;
    if (now > el._next) {
      el._tx = pad + Math.random() * (maxX - pad);
      el._ty = 70 + Math.random() * (maxY - 70);
      el._next = now + (hexed ? 1500 : 600) + Math.random() * 800;
    }
    el._x += (el._tx - el._x) * step;
    el._y += (el._ty - el._y) * step;
    el.style.left = el._x + 'px';
    el.style.top = el._y + 'px';
  });
  huntFrame = requestAnimationFrame(movePrey);
}

function spawnFamiliars() {
  const host = document.getElementById('ghost-character');
  host.querySelectorAll('.familiar').forEach((node) => node.remove());
  [0, 1, 2].forEach((i) => {
    const el = document.createElement('span');
    el.className = 'familiar';
    el.style.animationDelay = (-i * 0.85) + 's';
    el.style.animationDuration = (2.2 + i * 0.35) + 's';
    host.appendChild(el);
  });
  setTimeout(() => host.querySelectorAll('.familiar').forEach((node) => node.remove()), 5600);
}

function dropGhostDust() {
  const c = ghostCenter();
  const dust = document.createElement('div');
  dust.className = 'ghost-dust';
  dust.style.left = (c.x + (Math.random() - 0.5) * 18) + 'px';
  dust.style.top = (c.y + 28) + 'px';
  dust.style.background = Math.random() > 0.45 ? '#9a2448' : '#6a34b0';
  document.body.appendChild(dust);
  setTimeout(() => dust.remove(), 700);
}

function spawnSparkles() {
  const c = ghostCenter();
  const icons = ['✨', '⭐', '🌟', '🔮', '💫'];

  for (let i = 0; i < 10; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'magic-sparkle';
    sparkle.textContent = icons[Math.floor(Math.random() * icons.length)];
    sparkle.style.setProperty('--dx', ((Math.random() - 0.5) * 150) + 'px');
    sparkle.style.setProperty('--dy', ((Math.random() - 0.7) * 140) + 'px');
    sparkle.style.left = c.x + 'px';
    sparkle.style.top = c.y + 'px';
    document.body.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 950);
  }
}
})();
