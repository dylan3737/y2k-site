// The music box: a Web Audio synth that plays every song live from notes.
import * as fluid from './fluid.js';
import { save } from './store.js';

const playlistData = [
  { 
    title: "Lamp",
    artist: "soft keys",
    freq: "88.1",
    type: "synth",
    preset: "lamp"
  },
  {
    title: "Window",
    artist: "rain",
    freq: "91.5",
    type: "synth",
    preset: "window"
  },
  {
    title: "Drift",
    artist: "slow chords",
    freq: "94.7",
    type: "synth",
    preset: "drift"
  },
  {
    title: "Still",
    artist: "pad",
    freq: "98.3",
    type: "synth",
    preset: "still"
  },
  {
    title: "Ash",
    artist: "drone",
    freq: "102.9",
    type: "synth",
    preset: "ash"
  },
  {
    title: "Bell",
    artist: "far bell",
    freq: "106.7",
    type: "synth",
    preset: "bell"
  },
  {
    title: "Wraith",
    artist: "the dead",
    freq: "66.6",
    type: "synth",
    preset: "wraith"
  },
  {
    title: "Requiem",
    artist: "every rite",
    freq: "77.7",
    type: "synth",
    preset: "requiem"
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
  gain.gain.value = 0.055;

  src.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(gain);
  gain.connect(audioOut());
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
    dropGain.connect(audioOut());
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

let musicBus = null;
let masterGain = null;
let volumeLevel = 0.7;

function audioOut() {
  return masterGain || audioCtx.destination;
}

function midiHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function ensureBus() {
  if (musicBus) return;
  masterGain = audioCtx.createGain();
  masterGain.gain.value = volumeLevel;
  masterGain.connect(audioCtx.destination);
  const input = audioCtx.createGain();
  const tone = audioCtx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  const delay = audioCtx.createDelay(1);
  delay.delayTime.value = 0.34;
  const feedback = audioCtx.createGain();
  feedback.gain.value = 0.26;
  const wet = audioCtx.createGain();
  wet.gain.value = 0.22;
  input.connect(tone);
  tone.connect(masterGain);
  tone.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(masterGain);
  musicBus = input;
}

function shaped(peak, dur, when) {
  const gain = audioCtx.createGain();
  const level = Math.max(0.004, peak);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(level, when + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  return gain;
}

function voice(note, type, dur, peak, when) {
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(midiHz(note), when);
  const gain = shaped(peak, dur, when);
  osc.connect(gain);
  gain.connect(musicBus);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}

// A slow sine with a little vibrato, for the Wraith's wail.
function wail(note, dur, peak, when) {
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(midiHz(note), when);
  const lfo = audioCtx.createOscillator();
  lfo.frequency.value = 4.6;
  const depth = audioCtx.createGain();
  depth.gain.value = midiHz(note) * 0.012;
  lfo.connect(depth);
  depth.connect(osc.frequency);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + dur * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(gain);
  gain.connect(musicBus);
  osc.start(when);
  lfo.start(when);
  osc.stop(when + dur + 0.05);
  lfo.stop(when + dur + 0.05);
}

function hat(when, peak, dur) {
  const src = audioCtx.createBufferSource();
  src.buffer = makeNoiseBuffer();
  const band = audioCtx.createBiquadFilter();
  band.type = 'highpass';
  band.frequency.value = 5000;
  const gain = shaped(peak, dur, when);
  src.connect(band);
  band.connect(gain);
  gain.connect(musicBus);
  src.start(when);
  src.stop(when + dur + 0.02);
}

function kick(when) {
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, when);
  osc.frequency.exponentialRampToValueAtTime(44, when + 0.1);
  const gain = shaped(0.14, 0.24, when);
  osc.connect(gain);
  gain.connect(musicBus);
  osc.start(when);
  osc.stop(when + 0.28);
}

const songs = {
  lamp: {
    bpm: 74,
    drums: true,
    hold: 8,
    rain: false,
    bell: false,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [48, 52, 55, 59]],
    melody: [72, null, 76, null, 79, 76, null, 74, null, 72, null, 69, null, null, 67, null, 76, null, null, 74, 72, null, 69, null, 67, null, 64, null, null, null, 60, null]
  },
  window: {
    bpm: 60,
    drums: false,
    hold: 16,
    rain: true,
    bell: false,
    chords: [[53, 57, 60, 65], [55, 58, 62, 65], [50, 53, 57, 62], [48, 55, 60, 64]],
    melody: [72, null, null, null, null, null, 76, null, null, null, null, null, 74, null, null, null, null, null, 69, null, null, null, null, null, 67, null, null, null, null, null, null, null]
  },
  drift: {
    bpm: 56,
    drums: false,
    hold: 16,
    rain: false,
    bell: false,
    chords: [[52, 55, 59, 62], [50, 53, 57, 60], [48, 55, 59, 63], [47, 50, 54, 59]],
    melody: [71, null, null, null, 74, null, null, null, null, null, 67, null, null, null, null, null, 69, null, null, null, null, null, 66, null, null, null, null, null, 62, null, null, null]
  },
  still: {
    bpm: 50,
    drums: false,
    hold: 16,
    rain: false,
    bell: false,
    chords: [[48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 60], [43, 50, 55, 60]],
    melody: [72, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 67, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null]
  },
  ash: {
    bpm: 46,
    drums: false,
    hold: 32,
    rain: false,
    bell: false,
    chords: [[45, 52, 57], [43, 50, 55], [41, 48, 53], [40, 47, 52]],
    melody: [null, null, null, null, null, null, null, null, 64, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 60, null, null, null, null, null, null, null]
  },
  bell: {
    bpm: 54,
    drums: false,
    hold: 16,
    rain: false,
    bell: true,
    chords: [[49, 56, 61, 65], [47, 54, 59, 63], [45, 52, 57, 61], [44, 51, 56, 61]],
    melody: [68, null, null, 73, null, null, null, null, 70, null, null, null, null, null, 65, null, null, null, 68, null, null, null, 63, null, null, null, null, null, null, null, null, null]
  },
  wraith: {
    bpm: 48,
    drums: false,
    hold: 16,
    rain: false,
    bell: true,
    wail: true,
    chords: [[50, 53, 57, 62], [51, 55, 58, 62], [48, 51, 55, 60], [49, 53, 56, 61]],
    melody: [74, null, null, null, null, null, 75, null, null, null, null, null, 74, null, null, null, 70, null, null, null, null, null, 69, null, null, null, null, null, 62, null, null, null]
  },
  // The reward for finding every rite: it starts in the Wraith's minor and
  // resolves to major, a farewell rather than a haunting.
  requiem: {
    bpm: 44,
    drums: false,
    hold: 16,
    rain: false,
    bell: true,
    wail: true,
    chords: [[50, 53, 57, 62], [46, 53, 58, 62], [48, 55, 60, 64], [53, 57, 60, 65]],
    melody: [69, null, null, null, 70, null, null, null, 74, null, null, null, null, null, null, null, 72, null, null, null, 76, null, null, null, 77, null, null, null, null, null, null, null]
  }
};

function startSynthLoop(preset) {
  stopSynthLoop();
  initAudioContext();
  ensureBus();
  const song = songs[preset] || songs.lamp;
  if (song.rain) startRain();
  let step = 0;
  const ms = 30000 / song.bpm;

  synthInterval = setInterval(() => {
    const now = audioCtx.currentTime + 0.03;
    const span = (song.hold * ms) / 1000;
    if (step % song.hold === 0) {
      const chord = song.chords[Math.floor(step / song.hold) % song.chords.length];
      chord.forEach((note, i) => voice(note, 'sine', span * 0.98, 0.03 - i * 0.004, now));
      voice(chord[0] - 12, 'sine', span * 0.9, 0.045, now);
      if (song.bell) voice(chord[0] + 24, 'sine', 2.2, 0.028, now);
      fluid.breath();
    }
    if (song.drums) {
      const beat = step % 16;
      if (beat === 0 || beat === 8) kick(now);
      if (beat === 4 || beat === 12) hat(now, 0.035, 0.14);
      else if (beat % 2 === 0) hat(now, 0.012, 0.04);
    }
    const note = song.melody[step % song.melody.length];
    if (note != null) {
      if (song.wail) wail(note, 2.6, 0.03, now);
      else voice(note, 'triangle', song.drums ? 0.55 : 1.4, 0.032, now);
      fluid.note(note);
    }
    step++;
  }, ms);
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

function tuneStatic() {
  if (!audioCtx) return;
  const length = Math.floor(audioCtx.sampleRate * 0.16);
  const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const band = audioCtx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 600;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.035;
  src.connect(band);
  band.connect(gain);
  gain.connect(audioOut());
  src.start();
}

function loadTrack(index, fromUser) {
  currentTrackIndex = index;
  if (isPlaying) {
    if (fromUser) tuneStatic();
    playTrack();
  }
}

function labelMusic() {
  const bubble = document.getElementById('ghost-speech');
  if (!bubble) return;
  const track = playlistData[currentTrackIndex];
  bubble.textContent = isPlaying ? track.title : '✦ listen';
  if (isPlaying) {
    save('y2k-hint-seen', '1');
  }
  const musicTab = document.getElementById('musicTab');
  if (musicTab) musicTab.classList.toggle('is-playing', isPlaying);
  document.querySelectorAll('.song-mark').forEach((mark) => {
    mark.classList.toggle('is-on', isPlaying && Number(mark.dataset.song) === currentTrackIndex);
  });
}

function playTrack() {
  initAudioContext();
  const go = () => {
    const track = playlistData[currentTrackIndex];
    startSynthLoop(track.preset);
    isPlaying = true;
    labelMusic();
  };
  if (audioCtx.state === 'suspended') audioCtx.resume().then(go);
  else go();
}

function pauseTrack() {
  stopSynthLoop();
  isPlaying = false;
  labelMusic();
}

export function playing() {
  return isPlaying;
}

export function playAt(index) {
  const next = Math.max(0, Math.min(playlistData.length - 1, index));
  if (next !== currentTrackIndex) loadTrack(next, isPlaying);
  if (!isPlaying) playTrack();
  else labelMusic();
}

// Procession: move on to the next song in the list every 45s while playing.
let processionTimer = null;

export function procession(list) {
  clearInterval(processionTimer);
  let i = Math.max(0, list.indexOf(currentTrackIndex));
  playAt(list[i]);
  processionTimer = setInterval(() => {
    if (!isPlaying) {
      clearInterval(processionTimer);
      return;
    }
    i = (i + 1) % list.length;
    playAt(list[i]);
  }, 45000);
}

export function toggle() {
  if (isPlaying) pauseTrack();
  else playTrack();
}

document.querySelectorAll('.song-mark').forEach((mark) => {
  mark.addEventListener('click', () => {
    const index = Number(mark.dataset.song);
    if (mark.classList.contains('is-on')) toggle();
    else playAt(index);
  });
});

const volumeInput = document.getElementById('volume');
if (volumeInput) {
  volumeInput.addEventListener('input', () => {
    volumeLevel = Number(volumeInput.value) / 100;
    if (masterGain) masterGain.gain.setValueAtTime(volumeLevel, audioCtx ? audioCtx.currentTime : 0);
  });
}
