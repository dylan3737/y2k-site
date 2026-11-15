// Small Web Audio sounds: the bell, the slash, a catch, and Hum's music box.
let ctx = null;
let muted = false;

// Muted from the tray: nothing new starts, and Hum stops.
export function isMuted() {
  return muted;
}

export function setMuted(on) {
  muted = !!on;
  if (muted) stopHum();
}

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.12, out } = {}) {
  const a = audio();
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp).connect(out || a.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// A far, slightly out-of-tune bell, struck three times.
export function bell() {
  if (muted) return;
  const a = audio();
  for (let i = 0; i < 3; i++) {
    const t = a.currentTime + i * 1.1;
    [1, 2.76, 5.4, 8.93].forEach((ratio, j) => tone(392 * ratio, t, 2.6 / (j + 1), { gain: 0.09 / (j + 1) }));
  }
}

// A swish of filtered noise, high to low.
export function slash() {
  if (muted) return;
  const a = audio();
  const len = Math.floor(a.sampleRate * 0.45);
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const band = a.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 1.4;
  band.frequency.setValueAtTime(6000, a.currentTime);
  band.frequency.exponentialRampToValueAtTime(500, a.currentTime + 0.4);
  const amp = a.createGain();
  amp.gain.value = 0.5;
  src.connect(band).connect(amp).connect(a.destination);
  src.start();
  tone(70, a.currentTime + 0.05, 0.5, { type: 'triangle', gain: 0.2 });
}

export function caught() {
  if (muted) return;
  const t = audio().currentTime;
  tone(880, t, 0.12, { type: 'triangle', gain: 0.08 });
  tone(1320, t + 0.06, 0.16, { type: 'triangle', gain: 0.06 });
}

export function gulp() {
  if (muted) return;
  const t = audio().currentTime;
  tone(180, t, 0.25, { type: 'square', gain: 0.05 });
  tone(90, t + 0.12, 0.35, { type: 'square', gain: 0.05 });
}

// A burst of filtered noise, for impacts and static.
function noise(start, dur, { freq = 3000, q = 0.8, gain = 0.3, type = 'bandpass' } = {}) {
  const a = audio();
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const amp = a.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(a.destination);
  src.start(start);
}

// Shatter: a heavy thud, breaking glass, tinkling shards, and a rush back.
export function shatter() {
  if (muted) return;
  const t = audio().currentTime;
  tone(55, t, 0.6, { type: 'triangle', gain: 0.3 });
  noise(t, 0.5, { freq: 4500, q: 0.5, gain: 0.45 });
  for (let i = 0; i < 14; i++) {
    tone(2200 + Math.random() * 4200, t + 0.05 + Math.random() * 0.9, 0.12 + Math.random() * 0.2, { gain: 0.03 });
  }
  noise(t + 1.45, 0.6, { freq: 1200, q: 0.4, gain: 0.18, type: 'lowpass' });
}

// Glitch: square-wave blips and bursts of static, out of time.
export function glitch() {
  if (muted) return;
  const t = audio().currentTime;
  for (let i = 0; i < 16; i++) {
    const at = t + Math.random() * 1.35;
    if (Math.random() < 0.5) tone(80 + Math.random() * 1800, at, 0.03 + Math.random() * 0.08, { type: 'square', gain: 0.05 });
    else noise(at, 0.04 + Math.random() * 0.1, { freq: 800 + Math.random() * 6000, q: 2, gain: 0.2 });
  }
}

// Hum: a slow minor music box over a low drone. Plays until stopped.
const MELODY = [0, 3, 7, 10, 12, 10, 7, 3, 0, 5, 8, 12, 15, 12, 8, 5, -2, 3, 7, 10, 14, 10, 7, 3, -5, 0, 3, 7, 12, 7, 3, 0];
let hum = null;

export function humming() {
  return !!hum;
}

export function startHum() {
  if (hum || muted) return;
  const a = audio();
  const out = a.createGain();
  out.gain.value = 0.9;
  out.connect(a.destination);
  const drone = a.createOscillator();
  const droneAmp = a.createGain();
  drone.type = 'sawtooth';
  drone.frequency.value = 55;
  const lowpass = a.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 240;
  droneAmp.gain.value = 0.035;
  drone.connect(lowpass).connect(droneAmp).connect(out);
  drone.start();
  let step = 0;
  let next = a.currentTime + 0.1;
  const timer = setInterval(() => {
    while (next < a.currentTime + 0.5) {
      const note = MELODY[step % MELODY.length];
      const freq = 440 * Math.pow(2, (note - 9) / 12);
      tone(freq, next, 1.4, { gain: 0.07, out });
      tone(freq * 2.01, next, 0.6, { gain: 0.025, out });
      next += 0.42;
      step++;
    }
  }, 120);
  hum = { out, drone, timer };
}

export function stopHum() {
  if (!hum) return;
  const a = audio();
  const { out, drone, timer } = hum;
  hum = null;
  clearInterval(timer);
  out.gain.setTargetAtTime(0.0001, a.currentTime, 0.3);
  drone.stop(a.currentTime + 1.5);
  setTimeout(() => out.disconnect(), 1800);
}
