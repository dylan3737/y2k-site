// Screen effects drawn over a picture of the screen: Shatter, Glitch and Soul Rip
// on a 2D canvas; Vortex, Burn and Melt as WebGL shaders. Like Slash, they
// never touch real windows: the picture is wrecked, then put back, and the
// canvas removed.

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// A full-window canvas behind the reaper, in device pixels. `context` is '2d'
// or 'webgl': a canvas can only ever have one kind, so it is asked for once.
function stage(field, context = '2d') {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  field.prepend(canvas);
  const ctx = context === 'webgl'
    ? canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false })
    : canvas.getContext('2d');
  return { canvas, ctx, w: innerWidth, h: innerHeight, dpr };
}

// Without a picture (no screen permission): dark glass, so the effect still reads.
function darkGlass(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(60, 30, 100, 0.45)');
  grad.addColorStop(1, 'rgba(14, 6, 28, 0.6)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  return c;
}

function frames(draw, duration) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = now - start;
      if (t >= duration) return resolve();
      draw(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

// --- Shatter ------------------------------------------------------------------------------
// The screen cracks from `at` along rays and rings, the shards fall away over
// a void, hang, and fly back into place.
const CRACK = 200;
const FALL = 1000;
const HOLD = 250;
const BACK = 700;
const CLOSE = 220;

export async function shatter(field, shot, at) {
  const src = shot ? await loadImage(shot) : darkGlass(innerWidth, innerHeight);
  const { canvas, ctx, w, h, dpr } = stage(field);
  const rays = 14;
  const reach = Math.hypot(w, h);
  const rings = [0, 55, 140, 270, 450, reach];
  const last = rings.length - 1;

  // Crack points: rays jittered around the circle, rings jittered along them.
  // Shards share their corners, so they tile the screen exactly.
  const turn = Math.random() * Math.PI * 2;
  const angles = Array.from({ length: rays }, (_, i) => turn + (i + (Math.random() - 0.5) * 0.6) * (Math.PI * 2 / rays));
  const grid = angles.map((angle) => rings.map((r, j) => {
    if (j === 0) return { x: at.x, y: at.y };
    const radius = j === last ? r : r * (0.85 + Math.random() * 0.3);
    const a = j === last ? angle : angle + (Math.random() - 0.5) * 0.25;
    return { x: at.x + Math.cos(a) * radius, y: at.y + Math.sin(a) * radius };
  }));

  // Each shard is drawn once into its own small canvas; frames only move it.
  const shards = [];
  for (let i = 0; i < rays; i++) {
    const next = (i + 1) % rays;
    for (let j = 0; j < last; j++) {
      const poly = j === 0
        ? [grid[i][0], grid[next][1], grid[i][1]]
        : [grid[i][j], grid[next][j], grid[next][j + 1], grid[i][j + 1]];
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      const minX = Math.max(0, Math.floor(Math.min(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys)));
      const maxX = Math.min(w, Math.ceil(Math.max(...xs)));
      const maxY = Math.min(h, Math.ceil(Math.max(...ys)));
      if (maxX <= minX || maxY <= minY) continue; // off screen
      const piece = document.createElement('canvas');
      piece.width = Math.ceil((maxX - minX) * dpr);
      piece.height = Math.ceil((maxY - minY) * dpr);
      const g = piece.getContext('2d');
      g.scale(dpr, dpr);
      g.translate(-minX, -minY);
      g.beginPath();
      poly.forEach((p, k) => (k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.save();
      g.clip();
      g.drawImage(src, 0, 0, w, h);
      g.restore();
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      g.lineWidth = 1.2;
      g.stroke();
      const cx = xs.reduce((s, x) => s + x, 0) / xs.length;
      const cy = ys.reduce((s, y) => s + y, 0) / ys.length;
      const dx = cx - at.x;
      const dy = cy - at.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = 0.12 + Math.random() * 0.22 + (last - j) * 0.03;
      shards.push({
        piece, minX, minY, bw: maxX - minX, bh: maxY - minY, cx, cy, ring: j,
        vx: (dx / d) * speed, vy: (dy / d) * speed - 0.15,
        spin: (Math.random() - 0.5) * 0.005,
        delay: j * 45
      });
    }
  }

  const gravity = 0.0016;
  const voidFill = ctx.createRadialGradient(at.x * dpr, at.y * dpr, 0, at.x * dpr, at.y * dpr, reach * dpr);
  voidFill.addColorStop(0, '#2a0b2e');
  voidFill.addColorStop(1, '#05020a');

  function whole() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  }

  // Where a shard is `t` ms into its fall.
  function drawShards(timeOf) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = voidFill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of shards) {
      const t = Math.max(0, timeOf(s));
      const ox = s.vx * t;
      const oy = s.vy * t + 0.5 * gravity * t * t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(s.cx + ox, s.cy + oy);
      ctx.rotate(s.spin * t);
      ctx.translate(-s.cx, -s.cy);
      ctx.drawImage(s.piece, s.minX, s.minY, s.bw, s.bh);
    }
  }

  // The cracks run out from the impact, ring by ring.
  function drawCracks(p) {
    whole();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = 'rgba(200, 160, 255, 0.95)';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const upTo = Math.max(1, Math.ceil(p * last));
    for (let i = 0; i < rays; i++) {
      const next = (i + 1) % rays;
      for (let j = 0; j < upTo; j++) {
        ctx.moveTo(grid[i][j].x, grid[i][j].y);
        ctx.lineTo(grid[i][j + 1].x, grid[i][j + 1].y);
        if (j > 0) {
          ctx.moveTo(grid[i][j].x, grid[i][j].y);
          ctx.lineTo(grid[next][j].x, grid[next][j].y);
        }
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * (1 - p)})`;
    ctx.fillRect(0, 0, w, h);
  }

  await frames((t) => drawCracks(t / CRACK), CRACK);
  await frames((t) => drawShards((s) => t - s.delay), FALL);
  await frames(() => drawShards((s) => FALL - s.delay), HOLD);
  await frames((t) => drawShards((s) => (FALL - s.delay) * (1 - easeInOut(t / BACK))), BACK);
  whole();
  canvas.classList.add('is-closing');
  await frames(() => {}, CLOSE);
  canvas.remove();
}

// --- Glitch -------------------------------------------------------------------------------
// Y2K corruption: colour channels split apart, slices tear sideways, blocks
// smear, scanlines roll. Choppy on purpose: a new frame every ~45ms.
const GLITCH_MS = 1500;

export async function glitch(field, shot) {
  const src = shot ? await loadImage(shot) : null;
  const { canvas, ctx, dpr } = stage(field);
  const W = canvas.width;
  const H = canvas.height;

  // The picture split into red and cyan, which add back up to the original.
  function channel(color) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, W, H);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    return c;
  }
  const red = src && channel('#ff0000');
  const cyan = src && channel('#00ffff');

  const scan = document.createElement('canvas');
  scan.width = 1;
  scan.height = Math.max(2, Math.round(3 * dpr));
  const sg = scan.getContext('2d');
  sg.fillStyle = 'rgba(0, 0, 0, 0.5)';
  sg.fillRect(0, 0, 1, Math.max(1, Math.round(dpr)));
  const scanlines = ctx.createPattern(scan, 'repeat');

  const rand = (n) => Math.random() * n;
  let lastDraw = -Infinity;

  await frames((t) => {
    if (t - lastDraw < 45) return;
    lastDraw = t;
    const p = t / GLITCH_MS;
    // Up and down, with spikes.
    const level = Math.pow(Math.sin(Math.PI * p), 0.6) * (Math.random() < 0.3 ? 1 : 0.55);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    if (src) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const split = (Math.random() < 0.5 ? -1 : 1) * level * 22 * dpr;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(cyan, -split, 0);
      ctx.drawImage(red, split, rand(level * 4 * dpr));
      ctx.globalCompositeOperation = 'source-over';
      // Torn slices.
      for (let i = Math.floor(level * 16); i > 0; i--) {
        const y = rand(H);
        const sh = (3 + rand(60)) * dpr;
        ctx.drawImage(canvas, 0, y, W, sh, (Math.random() - 0.5) * level * 220 * dpr, y, W, sh);
      }
      // Smeared blocks.
      for (let i = Math.floor(level * 6); i > 0; i--) {
        const bw = (40 + rand(260)) * dpr;
        const bh = (10 + rand(80)) * dpr;
        ctx.drawImage(canvas, rand(W - bw), rand(H - bh), bw, bh, rand(W - bw), rand(H - bh), bw, bh);
      }
    }
    // Bars of bad signal.
    for (let i = Math.floor(level * 7); i > 0; i--) {
      ctx.fillStyle = ['rgba(182, 255, 107, 0.35)', 'rgba(255, 107, 242, 0.35)', 'rgba(158, 231, 242, 0.4)'][i % 3];
      ctx.fillRect(0, rand(H), W, (1 + rand(5)) * dpr);
    }
    ctx.globalAlpha = 0.25 + level * 0.5;
    ctx.fillStyle = scanlines;
    ctx.fillRect(0, (t / 20) % (3 * dpr), W, H);
    ctx.globalAlpha = 1;
    // Now and then the whole frame inverts.
    if (src && Math.random() < 0.06 * level) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
  }, GLITCH_MS);
  canvas.remove();
}

// --- Shaders: Vortex, Burn, Melt ------------------------------------------------------------
// The picture becomes a texture on one full-window quad, and a fragment
// shader decides, for every pixel, where in the picture to look.
const VERTEX = `
attribute vec2 a;
varying vec2 uv;
void main() {
  uv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv;
uniform sampler2D tex;
uniform float aspect;
uniform float time;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) { v += amp * vnoise(p); p *= 2.0; amp *= 0.5; }
  return v;
}
// The void behind the screen: the same purple dark as Slash and Shatter.
vec3 voidColor(vec2 p) {
  float r = length((p - 0.5) * vec2(aspect, 1.0));
  return mix(vec3(0.16, 0.04, 0.18), vec3(0.02, 0.01, 0.04), clamp(r * 1.4, 0.0, 1.0));
}
vec3 pick(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return voidColor(p);
  return texture2D(tex, p).rgb;
}`;

// A black hole at `c` swirls the screen in. `e` is how strong, 0 to 1.
const VORTEX = COMMON + `
uniform vec2 c;
uniform float e;
void main() {
  vec2 d = (uv - c) * vec2(aspect, 1.0);
  float r = length(d);
  float twist = e * 11.0 * exp(-r * 2.4);
  float pull = e * 1.7 * exp(-r * 2.2);
  float s = sin(twist), co = cos(twist);
  vec2 rd = vec2(co * d.x - s * d.y, s * d.x + co * d.y) * (1.0 + pull);
  vec3 col = pick(c + rd / vec2(aspect, 1.0));
  float hole = 0.12 * e;
  col *= smoothstep(hole * 0.6, hole * 1.7, r);
  col += vec3(0.65, 0.25, 1.0) * exp(-pow((r - hole) / (0.02 + 0.03 * e), 2.0)) * e * 1.3;
  gl_FragColor = vec4(col, 1.0);
}`;

// Fire eats in from the edges along a noisy front. Everything below `th`
// has burned; a band of embers and a band of char sit on the front.
const BURN = COMMON + `
uniform float th;
void main() {
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float v = edge * 2.2 + fbm(uv * vec2(aspect, 1.0) * 5.0) * 0.55;
  float near = smoothstep(th + 0.25, th, v);
  vec2 shimmer = vec2(0.0, sin(uv.x * 70.0 + time * 12.0) * 0.003 * near);
  vec3 col = pick(uv + shimmer);
  float w = 0.05;
  if (v < th) {
    vec2 cell = floor(uv * vec2(aspect, 1.0) * 80.0);
    float spark = step(0.988, hash(cell + floor(time * 9.0))) * smoothstep(th - 0.35, th, v);
    col = voidColor(uv) + vec3(1.0, 0.45, 0.12) * spark;
  } else if (v < th + w) {
    col = mix(vec3(1.0, 0.95, 0.65), vec3(1.0, 0.3, 0.04), (v - th) / w) * 1.5;
  } else if (v < th + w * 3.0) {
    float k = (v - th - w) / (w * 2.0);
    col = mix(vec3(0.12, 0.04, 0.02), col * 0.8, k);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// The screen sags and drips downward in uneven columns. `m` is how far.
const MELT = COMMON + `
uniform float m;
float n1(float x) {
  float i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(vec2(i, 0.0)), hash(vec2(i + 1.0, 0.0)), f);
}
void main() {
  float drip = pow(n1(uv.x * 38.0) * 0.55 + n1(uv.x * 9.0 + 3.0) * 0.45, 1.6);
  float fall = m * (0.12 + drip * 0.95) * (0.35 + uv.y * 0.65);
  float sway = sin(uv.y * 16.0 + uv.x * 7.0) * 0.004 * m;
  vec2 p = vec2(uv.x + sway, uv.y - fall);
  vec3 col = p.y < 0.0 ? voidColor(uv) : texture2D(tex, p).rgb;
  // A wet shine along the dripping edge.
  col += vec3(1.0, 0.92, 0.75) * smoothstep(0.012, 0.0, abs(p.y)) * clamp(m, 0.0, 1.0) * 0.45;
  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || 'shader did not compile');
  return shader;
}

// Returns null where WebGL isn't available; the caller says so.
function shaderStage(field, src, fragment) {
  const { canvas, ctx: gl, w, h } = stage(field, 'webgl');
  if (!gl) {
    canvas.remove();
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'shader did not link');
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.viewport(0, 0, canvas.width, canvas.height);
  const where = {};
  const set = (name, value) => {
    if (!(name in where)) where[name] = gl.getUniformLocation(program, name);
    if (where[name] === null) return;
    if (Array.isArray(value)) gl.uniform2f(where[name], value[0], value[1]);
    else gl.uniform1f(where[name], value);
  };
  set('aspect', w / h);
  return {
    canvas,
    draw(uniforms) {
      for (const name in uniforms) set(name, uniforms[name]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      canvas.remove();
    }
  };
}

// Runs a shader for `duration` ms with uniforms from `at(t)`, then fades out.
// Resolves false when there is no WebGL.
async function runShader(field, shot, fragment, duration, at) {
  const src = shot ? await loadImage(shot) : darkGlass(innerWidth, innerHeight);
  const fx = shaderStage(field, src, fragment);
  if (!fx) return false;
  try {
    await frames((t) => fx.draw({ time: t / 1000, ...at(t) }), duration);
    fx.canvas.classList.add('is-closing');
    await frames(() => {}, CLOSE);
  } finally {
    fx.dispose();
  }
  return true;
}

const easeIn = (p) => p * p * p;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeOutBack = (p) => 1 + 2.4 * Math.pow(p - 1, 3) + 1.4 * Math.pow(p - 1, 2);

// Vortex: 1s in, held, then spat back out.
export function vortex(field, shot, at) {
  const c = [at.x / innerWidth, at.y / innerHeight];
  return runShader(field, shot, VORTEX, 2600, (t) => {
    const p = t / 2600;
    const e = p < 0.42 ? easeIn(p / 0.42) : p < 0.6 ? 1 : 1 - easeOut((p - 0.6) / 0.4);
    return { c, e };
  });
}

// Burn: fire takes the whole screen, holds on the dark, then un-burns.
export function burn(field, shot) {
  return runShader(field, shot, BURN, 3000, (t) => {
    const full = 1.8;
    const th = t < 1800 ? full * easeIn(t / 1800) * 0.6 + full * (t / 1800) * 0.4
      : t < 2100 ? full : full * (1 - easeOut((t - 2100) / 900));
    return { th };
  });
}

// Melt: slow sag that speeds up, a pause, then a snap back with a little bounce.
export function melt(field, shot) {
  return runShader(field, shot, MELT, 2300, (t) => {
    const m = t < 1500 ? easeIn(t / 1500) : t < 1750 ? 1 : 1 - easeOutBack((t - 1750) / 550);
    return { m };
  });
}

// --- Soul Rip -------------------------------------------------------------------------------
// The patch of screen around `at` tears loose as a ghost, drifts to the reaper
// at `to`, and is swallowed; the hole it left fills back in.
export async function soulRip(field, shot, at, to) {
  const src = shot ? await loadImage(shot) : darkGlass(innerWidth, innerHeight);
  const { canvas, ctx, w, h, dpr } = stage(field);
  const rw = Math.min(320, w * 0.4);
  const rh = Math.min(220, h * 0.35);
  const rx = Math.max(0, Math.min(w - rw, at.x - rw / 2));
  const ry = Math.max(0, Math.min(h - rh, at.y - rh / 2));
  const kx = src.width / w;
  const ky = src.height / h;

  // The ghost: the patch, drained of colour and tinted the spirit blue.
  const ghost = document.createElement('canvas');
  ghost.width = Math.ceil(rw * dpr);
  ghost.height = Math.ceil(rh * dpr);
  const g = ghost.getContext('2d');
  g.filter = 'grayscale(1) brightness(1.35) contrast(1.15)';
  g.drawImage(src, rx * kx, ry * ky, rw * kx, rh * ky, 0, 0, ghost.width, ghost.height);
  g.filter = 'none';
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(158, 231, 242, 0.45)';
  g.fillRect(0, 0, ghost.width, ghost.height);

  const LIFT = 450;
  const FLY = 1100;
  const GONE = 350;
  const MEND = 600;

  function base(holeAlpha) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (holeAlpha <= 0) return;
    // The hole: the void, with a ragged glowing rim.
    ctx.save();
    ctx.globalAlpha = holeAlpha;
    const fill = ctx.createRadialGradient(rx + rw / 2, ry + rh / 2, 0, rx + rw / 2, ry + rh / 2, Math.max(rw, rh));
    fill.addColorStop(0, '#2a0b2e');
    fill.addColorStop(1, '#05020a');
    ctx.fillStyle = fill;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = 'rgba(158, 231, 242, 0.8)';
    ctx.shadowColor = 'rgba(158, 231, 242, 0.9)';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();
  }

  // The ghost in wavering slices, so it looks like it's breathing.
  function drawGhost(x, y, scale, alpha, wobble, t) {
    const slices = 24;
    const sh = rh / slices;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(158, 231, 242, 0.9)';
    ctx.shadowBlur = 24 * scale;
    for (let i = 0; i < slices; i++) {
      const dx = Math.sin(i * 0.7 + t / 90) * wobble;
      ctx.drawImage(ghost, 0, i * sh * dpr, ghost.width, sh * dpr + 1,
        x - (rw / 2) * scale + dx, y - (rh / 2) * scale + i * sh * scale, rw * scale, sh * scale + 0.5);
    }
    ctx.restore();
  }

  const home = { x: rx + rw / 2, y: ry + rh / 2 };
  await frames((t) => {
    const p = t / LIFT;
    base(p);
    drawGhost(home.x, home.y - 14 * easeOut(p), 1 + 0.04 * p, 0.85, 4 * p, t);
  }, LIFT);
  // A curve that rises before it falls into him.
  const mid = { x: (home.x + to.x) / 2, y: Math.min(home.y, to.y) - 160 };
  await frames((t) => {
    const p = easeIn(t / FLY) * 0.7 + (t / FLY) * 0.3;
    const q = 1 - p;
    const x = q * q * home.x + 2 * q * p * mid.x + p * p * to.x;
    const y = q * q * (home.y - 14) + 2 * q * p * mid.y + p * p * to.y;
    base(1);
    drawGhost(x, y, 1.04 * (1 - p) + 0.08 * p, 0.85 * (1 - p * 0.4), 6 + 10 * p, t);
  }, FLY);
  await frames(() => base(1), GONE);
  await frames((t) => base(1 - easeOut(t / MEND)), MEND);
  canvas.classList.add('is-closing');
  await frames(() => {}, CLOSE);
  canvas.remove();
}
