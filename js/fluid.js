// WebGL fluid: a small Navier-Stokes solver in fragment shaders, stirred by the
// cursor, the reaper and the music. Falls back to a CSS gradient without WebGL.
import { isDark } from './theme.js';
import { reducedMotion } from './store.js';

const canvas = document.getElementById('canvas');

resizeCanvas();

// Scale the simulation down on smaller/lower-power devices, and respect
// a visitor's reduced-motion preference instead of forcing the effect on them.
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
if (!reducedMotion) {
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
  uniform float uEclipse;
  void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      float m = max(c.r, max(c.g, c.b));
      c = mix(c, vec3(m * 1.15, m * 0.06, m * 0.12), uEclipse);
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
      display: uniformMap(displayProg, ['uTexture', 'uInvert', 'uEclipse'])
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
let eclipseUntil = 0;
export function eclipse(ms) {
  eclipseUntil = Date.now() + ms;
}

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
  gl.uniform1f(U.display.uInvert, isDark() ? 0.0 : 1.0);
  gl.uniform1f(U.display.uEclipse, Math.min(1, Math.max(0, (eclipseUntil - Date.now()) / 1500)));
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
// moved since the last stir. Each effect is a no-op without WebGL.
export function wake(clientX, clientY, vx, vy) {
  if (!webglAvailable) return;
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
}

export function pulse(clientX, clientY) {
  if (!webglAvailable) return;
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
}

export function breath() {
  if (!webglAvailable) return;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    splatStack.push({
      x: 0.5 + Math.cos(a) * 0.1,
      y: 0.5 + Math.sin(a) * 0.08,
      dx: Math.cos(a) * 0.07,
      dy: Math.sin(a) * 0.07,
      color: [0.12, 0.02, 0.22],
      radius: 2.6
    });
  }
}

export function note(note) {
  if (!webglAvailable) return;
  const t = Math.min(1, Math.max(0, (note - 60) / 22));
  const drift = Date.now() / 2400;
  splatStack.push({
    x: 0.18 + t * 0.64,
    y: 0.5 + Math.sin(drift + t * 3) * 0.22,
    dx: (Math.random() - 0.5) * 0.1,
    dy: 0.16,
    color: [0.34 + t * 0.22, 0.05 + (1 - t) * 0.08, 0.62 - t * 0.18],
    radius: 1.1
  });
}

export function sigil() {
  if (!webglAvailable) return;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    splatStack.push({
      x: 0.5 + Math.cos(a) * 0.16,
      y: 0.5 + Math.sin(a) * 0.16 * (canvas.width / canvas.height),
      dx: -Math.sin(a) * 0.3,
      dy: Math.cos(a) * 0.3,
      color: [0.5, 0.42, 0.08],
      radius: 0.8
    });
  }
}

export function burst(clientX, clientY) {
  if (!webglAvailable) return;
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
}

function isFluidGestureTarget(node) {
  return !(node && node.closest && node.closest(
    '.modal-content, .game-card, .game-ring, nav.bottom-nav, .ghost-pet, a, button, input, textarea, select, label'
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

if (webglAvailable) {
  update();
}
