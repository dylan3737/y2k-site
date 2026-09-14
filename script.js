// Playlist Track Config
    const playlistData = [
      { 
        title: "Lo-Fi Chill", 
        artist: "Web Audio Synth", 
        type: "synth",
        preset: "lofi"
      },
      { 
        title: "Synthwave Sunset", 
        artist: "Web Audio Synth", 
        type: "synth",
        preset: "synthwave"
      },
      { 
        title: "Retro Groove", 
        artist: "Web Audio Synth", 
        type: "synth",
        preset: "retrogroove"
      },
      { 
        title: "Night Drive", 
        artist: "Web Audio Synth", 
        type: "synth",
        preset: "nightdrive"
      },
      { 
        title: "Pixel Rain", 
        artist: "Web Audio Synth",
        type: "synth",
        preset: "pixelrain"
      }
    ];

    let currentTrackIndex = 0;
    let isPlaying = false;

    // Web Audio API Synthesizer Engine
    let audioCtx = null;
    let synthInterval = null;

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

      // Distinct melody scale maps and speeds for each track
      const trackConfigs = {
        lofi: {
          notes: [261.63, 329.63, 392.00, 493.88, 440.00, 392.00, 329.63, 293.66], // Jazzy C Major 7th
          oscType: 'sine',
          speed: 550,
          hasBass: true
        },
        synthwave: {
          notes: [220.00, 261.63, 329.63, 440.00, 392.00, 246.94, 293.66, 392.00], // Moody minor progression
          oscType: 'sawtooth',
          speed: 350,
          hasBass: true
        },
        retrogroove: {
          notes: [130.81, 261.63, 164.81, 329.63, 196.00, 392.00, 220.00, 440.00], // Upbeat octave-skipping funk
          oscType: 'triangle',
          speed: 220,
          hasBass: false
        },
        nightdrive: {
          notes: [174.61, 220.00, 261.63, 349.23, 329.63, 261.63], // Atmospheric synth pulse
          oscType: 'sawtooth',
          speed: 400,
          hasBass: true
        },
        pixelrain: {
          notes: [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 880.00, 783.99], // Fast ascending chiptune
          oscType: 'square',
          speed: 150,
          hasBass: false
        }
      };

      const config = trackConfigs[preset] || trackConfigs.lofi;
      let step = 0;

      synthInterval = setInterval(() => {
        const freq = config.notes[step % config.notes.length];
        playSynthNote(freq, config.oscType, config.speed / 500, 0.12);
        
        if (config.hasBass && step % 2 === 0) {
          playSynthNote(freq / 2, 'sine', (config.speed / 500) * 1.5, 0.18);
        }

        step++;
      }, config.speed);
    }

    function stopSynthLoop() {
      if (synthInterval) {
        clearInterval(synthInterval);
        synthInterval = null;
      }
    }
    // Audio DOM Elements
    const audioPlayer = document.getElementById('audioPlayer');
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

      if (track.type === 'synth') {
        audioPlayer.pause();
        startSynthLoop(track.preset);
        isPlaying = true;
        musicWidgetWrapper.classList.add('playing');
        playBtn.innerText = '❚❚ PAUSE';
      } else {
        stopSynthLoop();
        audioPlayer.src = track.src;
        audioPlayer.play().then(() => {
          isPlaying = true;
          musicWidgetWrapper.classList.add('playing');
          playBtn.innerText = '❚❚ PAUSE';
        }).catch(err => {
          console.error("Playback failed:", err);
          // Fallback to internal synth if direct media blocked
          startSynthLoop('synthwave');
          isPlaying = true;
          musicWidgetWrapper.classList.add('playing');
          playBtn.innerText = '❚❚ PAUSE';
        });
      }
    }

    function pauseTrack() {
      stopSynthLoop();
      audioPlayer.pause();
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

    // Glitter Sparkle Trail Effect
    const sparkles = ['✦', '★', '✧', '❄', '✨'];
    window.addEventListener('mousemove', (e) => {
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

    // Tumblr Heart Like Handler
    function likePost(btn) {
      const countSpan = btn.querySelector('.like-count');
      let currentLikes = parseInt(countSpan.innerText);
      countSpan.innerText = currentLikes + 1;
      btn.style.fontWeight = 'bold';
    }

   // --- Guestbook (Formspree Integration) ---
const FORMSPREE_ID = 'xppzvlrz'; // Replace with your Formspree ID
const FORMSPREE_ENDPOINT = `https://formspree.io/f/${FORMSPREE_ID}`;

const guestbookForm = document.getElementById('guestbookForm');
const guestNameInput = document.getElementById('guestName');
const guestMessageInput = document.getElementById('guestMessage');
const guestbookSubmitBtn = document.getElementById('guestbookSubmit');
const guestbookStatus = document.getElementById('guestbookStatus');

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

if (guestbookForm) {
  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = guestNameInput.value.trim();
    const message = guestMessageInput.value.trim();
    if (!name || !message) return;

    guestbookSubmitBtn.disabled = true;
    guestbookStatus.textContent = 'Signing…';

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ name, message })
      });

      if (response.ok) {
        guestNameInput.value = '';
        guestMessageInput.value = '';
        guestbookStatus.textContent = '★ Thank you for signing!';
      } else {
        guestbookStatus.textContent = 'Failed to submit. Please try again.';
      }
    } catch (err) {
      console.error('Submission error:', err);
      guestbookStatus.textContent = 'Error submitting entry.';
    } finally {
      guestbookSubmitBtn.disabled = false;
      setTimeout(() => {
        guestbookStatus.textContent = '';
      }, 4000);
    }
  });
}
// --- Song Suggestion Formspree Integration ---
const songForm = document.getElementById('songForm');
const songNameInput = document.getElementById('songName');
const songNotesInput = document.getElementById('songNotes');
const songSubmitBtn = document.getElementById('songSubmit');
const songStatus = document.getElementById('songStatus');

if (songForm) {
  songForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const song = songNameInput.value.trim();
    const notes = songNotesInput.value.trim();
    if (!song || !notes) return;

    songSubmitBtn.disabled = true;
    songStatus.textContent = 'Sending…';

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ formType: 'Song Suggestion', song, notes })
      });

      if (response.ok) {
        songNameInput.value = '';
        songNotesInput.value = '';
        songStatus.textContent = '★ Song suggestion sent!';
      } else {
        songStatus.textContent = 'Failed to send. Please try again.';
      }
    } catch (err) {
      console.error('Submission error:', err);
      songStatus.textContent = 'Error sending suggestion.';
    } finally {
      songSubmitBtn.disabled = false;
      setTimeout(() => {
        songStatus.textContent = '';
      }, 4000);
    }
  });
}
    // WebGL Fluid Solver Initialization
    const canvas = document.getElementById('canvas');
    const themeBtn = document.getElementById('themeBtn');

    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    let isDarkMode = !prefersLight;

    if (!isDarkMode) {
      document.body.classList.add('light-mode');
    }

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
      return shader;
    }

    function createProgram(gl, vertexSource, fragmentSource) {
      const program = gl.createProgram();
      gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      return program;
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
    let dye, velocity, curl, divergence, pressure;

    if (webglAvailable) {
      splatProg = createProgram(gl, baseVS, splatFS);
      advectProg = createProgram(gl, baseVS, advectFS);
      curlProg = createProgram(gl, baseVS, curlFS);
      vorticityProg = createProgram(gl, baseVS, vorticityFS);
      divergenceProg = createProgram(gl, baseVS, divergenceFS);
      pressureProg = createProgram(gl, baseVS, pressureFS);
      gradSubProg = createProgram(gl, baseVS, gradientSubtractFS);
      displayProg = createProgram(gl, baseVS, displayFS);

      dye = createDoubleFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION);
      velocity = createDoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
      curl = createFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
      divergence = createFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
      pressure = createDoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
    }

    function createFBO(w, h) {
      gl.activeTexture(gl.TEXTURE0);
      let texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, ext.formatRGBA, w, h, 0, gl.RGBA, ext.halfFloat, null);

      let fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

      return { texture, fbo, width: w, height: h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
    }

    function createDoubleFBO(w, h) {
      let fbo1 = createFBO(w, h);
      let fbo2 = createFBO(w, h);
      return {
        get read() { return fbo1; },
        set read(val) { fbo1 = val; },
        get write() { return fbo2; },
        set write(val) { fbo2 = val; },
        swap() { let temp = fbo1; fbo1 = fbo2; fbo2 = temp; }
      };
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

      if (splatStack.length > 0) {
        for (let i = 0; i < splatStack.length; i++) {
          const s = splatStack.pop();
          splat(s.x, s.y, s.dx, s.dy, s.color);
        }
      }

      gl.viewport(0, 0, velocity.read.width, velocity.read.height);
      gl.useProgram(advectProg);
      gl.uniform2f(gl.getUniformLocation(advectProg, 'texelSize'), 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(gl.getUniformLocation(advectProg, 'uVelocity'), velocity.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(advectProg, 'uSource'), velocity.read.attach(0));
      gl.uniform1f(gl.getUniformLocation(advectProg, 'dt'), dt);
      gl.uniform1f(gl.getUniformLocation(advectProg, 'dissipation'), config.VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      gl.useProgram(curlProg);
      gl.uniform2f(gl.getUniformLocation(curlProg, 'texelSize'), 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(gl.getUniformLocation(curlProg, 'uVelocity'), velocity.read.attach(0));
      blit(curl);

      gl.useProgram(vorticityProg);
      gl.uniform2f(gl.getUniformLocation(vorticityProg, 'texelSize'), 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(gl.getUniformLocation(vorticityProg, 'uVelocity'), velocity.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(vorticityProg, 'uCurl'), curl.attach(1));
      gl.uniform1f(gl.getUniformLocation(vorticityProg, 'curl'), config.CURL);
      gl.uniform1f(gl.getUniformLocation(vorticityProg, 'dt'), dt);
      blit(velocity.write);
      velocity.swap();

      gl.useProgram(divergenceProg);
      gl.uniform2f(gl.getUniformLocation(divergenceProg, 'texelSize'), 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(gl.getUniformLocation(divergenceProg, 'uVelocity'), velocity.read.attach(0));
      blit(divergence);

      gl.useProgram(pressureProg);
      gl.uniform2f(gl.getUniformLocation(pressureProg, 'texelSize'), 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(gl.getUniformLocation(pressureProg, 'uDivergence'), divergence.attach(0));
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(gl.getUniformLocation(pressureProg, 'uPressure'), pressure.read.attach(1));
        blit(pressure.write);
        pressure.swap();
      }

      gl.useProgram(gradSubProg);
      gl.uniform2f(gl.getUniformLocation(gradSubProg, 'texelSize'), 1.0 / velocity.read.width, 1.0 / velocity.read.height);
      gl.uniform1i(gl.getUniformLocation(gradSubProg, 'uPressure'), pressure.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(gradSubProg, 'uVelocity'), velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      gl.viewport(0, 0, dye.read.width, dye.read.height);
      gl.useProgram(advectProg);
      gl.uniform2f(gl.getUniformLocation(advectProg, 'texelSize'), 1.0 / dye.read.width, 1.0 / dye.read.height);
      gl.uniform1i(gl.getUniformLocation(advectProg, 'uVelocity'), velocity.read.attach(0));
      gl.uniform1i(gl.getUniformLocation(advectProg, 'uSource'), dye.read.attach(1));
      gl.uniform1f(gl.getUniformLocation(advectProg, 'dt'), dt);
      gl.uniform1f(gl.getUniformLocation(advectProg, 'dissipation'), config.DENSITY_DISSIPATION);
      blit(dye.write);
      dye.swap();

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(displayProg);
      gl.uniform1i(gl.getUniformLocation(displayProg, 'uTexture'), dye.read.attach(0));
      gl.uniform1f(gl.getUniformLocation(displayProg, 'uInvert'), isDarkMode ? 0.0 : 1.0);
      blit(null);

      requestAnimationFrame(update);
    }

    function splat(x, y, dx, dy, color) {
      gl.viewport(0, 0, velocity.read.width, velocity.read.height);
      gl.useProgram(splatProg);
      gl.uniform1i(gl.getUniformLocation(splatProg, 'uTarget'), velocity.read.attach(0));
      gl.uniform1f(gl.getUniformLocation(splatProg, 'aspect'), canvas.width / canvas.height);
      gl.uniform2f(gl.getUniformLocation(splatProg, 'point'), x, y);
      gl.uniform3f(gl.getUniformLocation(splatProg, 'color'), dx, dy, 0.0);
      gl.uniform1f(gl.getUniformLocation(splatProg, 'radius'), config.SPLAT_RADIUS / 100);
      blit(velocity.write);
      velocity.swap();

      gl.viewport(0, 0, dye.read.width, dye.read.height);
      gl.useProgram(splatProg);
      gl.uniform1i(gl.getUniformLocation(splatProg, 'uTarget'), dye.read.attach(0));
      gl.uniform1f(gl.getUniformLocation(splatProg, 'aspect'), canvas.width / canvas.height);
      gl.uniform2f(gl.getUniformLocation(splatProg, 'point'), x, y);
      gl.uniform3f(gl.getUniformLocation(splatProg, 'color'), color[0], color[1], color[2]);
      gl.uniform1f(gl.getUniformLocation(splatProg, 'radius'), config.SPLAT_RADIUS / 100);
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

    themeBtn.addEventListener('click', () => {
      isDarkMode = !isDarkMode;
      document.body.classList.toggle('light-mode', !isDarkMode);
    });

    if (webglAvailable) {
      window.addEventListener('mousemove', e => updatePointer(e.clientX, e.clientY));

      window.addEventListener('touchstart', e => {
        const t = e.touches[0];
        pointer.x = t.clientX / window.innerWidth;
        pointer.y = 1.0 - t.clientY / window.innerHeight;
      }, { passive: true });

      window.addEventListener('touchmove', e => {
        e.preventDefault();
        const t = e.touches[0];
        updatePointer(t.clientX, t.clientY);
      }, { passive: false });
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
      closeModalBtn.focus();
    }

    function closeModalDialog() {
      modalContainer.classList.remove('active');
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        openModal(link.getAttribute('data-target'));
      });
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
        const focusable = modalContent.querySelectorAll(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

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

function startDrag(clientX, clientY) {
  if (!clientX || !clientY) return; // Prevents desktop flash-and-disappear bug
  
  isDragging = true;
  const rect = container.getBoundingClientRect();
  offsetX = clientX - rect.left;
  offsetY = clientY - rect.top;
  
  container.style.bottom = 'auto';
  container.style.right = 'auto';
  container.style.left = rect.left + 'px';
  container.style.top = rect.top + 'px';
}

  function moveDrag(clientX, clientY) {
    if (!isDragging) return;
    container.style.left = (clientX - offsetX) + 'px';
    container.style.top = (clientY - offsetY) + 'px';
  }

  function stopDrag() {
    isDragging = false;
  }

  // Mouse Listeners
  ghostBody.addEventListener('mousedown', (e) => startDrag(e.clientX, e.clientY));
  document.addEventListener('mousemove', (e) => moveDrag(e.clientX, e.clientY));
  document.addEventListener('mouseup', stopDrag);

  // Touch Listeners
  ghostBody.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startDrag(touch.clientX, touch.clientY);
  });
  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    moveDrag(touch.clientX, touch.clientY);
  });
  document.addEventListener('touchend', stopDrag);
});

// --- ACTIONS ---
function ghostAction(type) {
  const speech = document.getElementById('ghost-speech');
  const ghost = document.getElementById('ghost-character');

  ghost.classList.remove('dancing', 'mana-glow');

  if (type === 'spell') {
    if (manaLevel < 20) {
      speech.innerText = "❌ Out of Mana! Feed me mana first!";
      return;
    }
    manaLevel -= 20;
    speech.innerText = `✨ Abracadabra! (Mana: ${manaLevel}%)`;
    spawnSparkles();

  } else if (type === 'mana') {
    manaLevel = Math.min(100, manaLevel + 40);
    speech.innerText = `🧪 *Gulp!* Restored! (Mana: ${manaLevel}%)`;
    ghost.classList.add('mana-glow');

  } else if (type === 'summon') {
    speech.innerText = "🦇 I summoned a spooky friend!";
    spawnSingleParticle('🦇');

  } else if (type === 'dance') {
    speech.innerText = "💃 Party like it's 1999!";
    ghost.classList.add('dancing');
    setTimeout(() => ghost.classList.remove('dancing'), 2500);

  } else if (type === 'vanish') {
    speech.innerText = "💨 Disappearing act!";
    ghost.style.opacity = "0";
    setTimeout(() => {
      ghost.style.opacity = "1";
      speech.innerText = "👻 Peekaboo!";
    }, 2000);
  }
}

// --- PARTICLES ---
function spawnSparkles() {
  const ghost = document.getElementById('ghost-character');
  const rect = ghost.getBoundingClientRect();
  const icons = ['✨', '⭐', '🌟', '🔮', '💫'];

  for (let i = 0; i < 8; i++) {
    const sparkle = document.createElement('div');
    sparkle.className = 'magic-sparkle';
    sparkle.innerText = icons[Math.floor(Math.random() * icons.length)];
    
    const dx = (Math.random() - 0.5) * 120 + 'px';
    const dy = (Math.random() - 0.5) * 120 + 'px';
    
    sparkle.style.setProperty('--dx', dx);
    sparkle.style.setProperty('--dy', dy);
    sparkle.style.left = (rect.left + rect.width / 2) + 'px';
    sparkle.style.top = (rect.top + rect.height / 2) + 'px';

    document.body.appendChild(sparkle);
    setTimeout(() => sparkle.remove(), 1000);
  }
}

function spawnSingleParticle(emoji) {
  const ghost = document.getElementById('ghost-character');
  const rect = ghost.getBoundingClientRect();
  const p = document.createElement('div');
  p.className = 'magic-sparkle';
  p.innerText = emoji;
  p.style.setProperty('--dx', '60px');
  p.style.setProperty('--dy', '-80px');
  p.style.left = (rect.left + rect.width / 2) + 'px';
  p.style.top = (rect.top + rect.height / 2) + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 1000);
}