// Screen effects drawn over a picture of the screen: Shatter and Glitch.
// Like Slash, they never touch real windows; the picture is wrecked and then
// put back, and the canvas removed.

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// A full-window canvas behind the reaper, in device pixels.
function stage(field) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  field.prepend(canvas);
  return { canvas, ctx: canvas.getContext('2d'), w: innerWidth, h: innerHeight, dpr };
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
