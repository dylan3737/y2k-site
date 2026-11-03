// The reaper: dragging, roaming, resting, and the lines he says on his own.
import * as audio from './audio.js';
import * as fluid from './fluid.js';
import { showGameCard } from './games.js';
import { isModalOpen } from './ui.js';
import { ghostAction, soul, gainSoul, syncMana } from './actions.js';
import { riteHint } from './rites.js';
import { load, reducedMotion } from './store.js';

export function initReaper() {
  const container = document.getElementById('ghost-pet-container');
  const ghostBody = document.getElementById('ghost-character');

  const speech = document.getElementById('ghost-speech');
  if (speech) {
    speech.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.toggle();
    });
  }

  if (!container || !ghostBody) return;

  // --- DRAGGABLE LOGIC ---
  let isDragging = false;
  let dragMoved = 0;
  let offsetX = 0, offsetY = 0;
  let pos = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let interactionPause = false;
  let idleTimer = null;
  const roamEnabled = !reducedMotion;
  let hurry = false;

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
    hurry = false;
    isDragging = true;
    dragMoved = 0;
    interactionPause = true;
    const rect = container.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;

    pos.x = rect.left;
    pos.y = rect.top;
    setPosition(pos.x, pos.y);
    ghostBody.classList.add('is-moving');
  }

  function markUnder(selector) {
    const body = ghostBody.getBoundingClientRect();
    const cx = body.left + body.width / 2;
    const cy = body.top + body.height / 2;
    const marks = document.querySelectorAll(selector);
    let best = null;
    let bestDist = Infinity;
    for (let i = 0; i < marks.length; i++) {
      const rect = marks[i].getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const dist = Math.hypot(cx - (rect.left + rect.width / 2), cy - (rect.top + rect.height / 2));
      const reach = body.width * 0.45 + rect.width * 0.65;
      if (dist < reach && dist < bestDist) {
        best = marks[i];
        bestDist = dist;
      }
    }
    return best;
  }

  function songUnder() { return markUnder('.song-mark'); }
  function gameUnder() { return markUnder('.game-mark'); }

  function moveDrag(clientX, clientY) {
    if (!isDragging) return;
    const b = getBounds();
    pos.x = clamp(clientX - offsetX, b.minX, b.maxX);
    pos.y = clamp(clientY - offsetY, b.minY, b.maxY);
    setPosition(pos.x, pos.y);
    dragMoved += Math.hypot(pos.x - (container._lx || pos.x), pos.y - (container._ly || pos.y));
    container._lx = pos.x;
    container._ly = pos.y;
    const hit = songUnder();
    const game = gameUnder();
    document.querySelectorAll('.song-mark').forEach((mark) => {
      mark.classList.toggle('is-near', mark === hit);
    });
    document.querySelectorAll('.game-mark').forEach((mark) => {
      mark.classList.toggle('is-near', mark === game);
    });
    stirFromMotion();
  }

  let restLock = false;

  function onRest() {
    const ring = document.getElementById('rest-circle');
    if (!ring) return false;
    const body = ghostBody.getBoundingClientRect();
    const zone = ring.getBoundingClientRect();
    const dist = Math.hypot(
      (body.left + body.width / 2) - (zone.left + zone.width / 2),
      (body.top + body.height / 2) - (zone.top + zone.height / 2)
    );
    return dist < zone.width * 0.5 + body.width * 0.45;
  }

  function leaveRest() {
    restLock = false;
    interactionPause = false;
    clearIdle();
    const ring = document.getElementById('rest-circle');
    const zone = ring ? ring.getBoundingClientRect() : null;
    for (let i = 0; i < 8; i++) {
      pickNewTarget();
      if (!zone) break;
      const dx = (target.x + container.offsetWidth / 2) - (zone.left + zone.width / 2);
      const dy = (target.y + 48) - (zone.top + zone.height / 2);
      if (Math.hypot(dx, dy) > 200) break;
    }
    const speech = document.getElementById('ghost-speech');
    if (speech) speech.textContent = 'Rested.';
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    interactionPause = false;
    ghostBody.classList.remove('is-moving');
    clearIdle();
    const hit = songUnder();
    const game = gameUnder();
    document.querySelectorAll('.song-mark').forEach((mark) => mark.classList.remove('is-near'));
    document.querySelectorAll('.game-mark').forEach((mark) => mark.classList.remove('is-near'));
    if (hit && dragMoved > 12) {
      audio.playAt(Number(hit.dataset.song));
    }
    if (game && dragMoved > 12) showGameCard(Number(game.dataset.game));
    restLock = onRest() && soul() < 100;
    if (restLock) return;
    if (onRest()) leaveRest();
    else pickNewTarget();
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

  // Where the container may go. Wandering keeps his whole column (bubble,
  // reaper, soul bar, buttons) on screen; a drag or a walk to the rest circle
  // only keeps his body on screen, so he can reach the circle at the bottom.
  function getBounds(wholeColumn) {
    const rect = container.getBoundingClientRect();
    const body = ghostBody.getBoundingClientRect();
    const offX = body.left - rect.left;
    const offY = body.top - rect.top;
    return {
      minX: 8 - offX,
      minY: 8 - offY,
      maxX: window.innerWidth - offX - body.width - 8,
      // The extra 18px leaves room for his bubble growing to a second line.
      maxY: wholeColumn ? window.innerHeight - rect.height - 26 : window.innerHeight - offY - body.height - 8
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
    fluid.wake(
      rect.left + rect.width * (flipped ? 0.68 : 0.32),
      rect.top + rect.height * 0.36,
      vx,
      vy
    );
  }

  // Lift a spot so the reaper and his buttons stay above the nav when he is over it.
  function clearOfNav(x, y) {
    const nav = document.querySelector('nav.bottom-nav');
    if (!nav) return y;
    const n = nav.getBoundingClientRect();
    const rect = container.getBoundingClientRect();
    if (x + rect.width < n.left || x > n.right) return y;
    return Math.min(y, n.top - rect.height - 8);
  }

  function pickNewTarget() {
    const b = getBounds(true);
    target.x = b.minX + Math.random() * Math.max(0, b.maxX - b.minX);
    target.y = b.minY + Math.random() * Math.max(0, b.maxY - b.minY);
    target.y = Math.max(b.minY, clearOfNav(target.x, target.y));
  }

  function roamStep() {
    if (!roamEnabled) return;

    if (!isDragging && !interactionPause && !restLock) {
      const dx = target.x - pos.x;
      const dy = target.y - pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        hurry = false;
        ghostBody.classList.remove('is-moving');
        if (!idleTimer) {
          idleTimer = setTimeout(() => {
            idleTimer = null;
            if (roamEnabled && !isDragging && !interactionPause && !restLock) pickNewTarget();
          }, 1500 + Math.random() * 2500);
        }
      } else {
        clearIdle();
        ghostBody.classList.add('is-moving');
        const speed = Math.min(hurry ? 4 : 1.1, dist * 0.04);
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
    const b = getBounds(true);
    pos.y = clamp(clearOfNav(rect.left, rect.top), b.minY, b.maxY);
    setPosition(pos.x, pos.y);

    if (!roamEnabled) return; // stay put but remain draggable

    pickNewTarget();
    requestAnimationFrame(roamStep);
  }

  // Keep him on screen and off the nav when the layout changes: a resize or
  // rotation, or the pixel font arriving and wrapping the nav onto two rows.
  function refit() {
    if (isDragging || restLock || hurry) return;
    const b = getBounds(true);
    pos.x = clamp(pos.x, b.minX, b.maxX);
    pos.y = clamp(clearOfNav(pos.x, pos.y), b.minY, b.maxY);
    setPosition(pos.x, pos.y);
    target.x = clamp(target.x, b.minX, b.maxX);
    target.y = clamp(clearOfNav(target.x, target.y), b.minY, b.maxY);
  }

  window.addEventListener('resize', refit);
  if (document.fonts) document.fonts.addEventListener('loadingdone', refit);
  // His column changes size when the font arrives or his bubble wraps.
  if ('ResizeObserver' in window) new ResizeObserver(refit).observe(container);
  const nav = document.querySelector('nav.bottom-nav');
  if (nav && 'ResizeObserver' in window) new ResizeObserver(refit).observe(nav);

  // Reaper action buttons (Reap/Summon/Hex) use data-ghost-action
  // attributes rather than inline onclick, so delegate from the container.
  container.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-ghost-action]');
    if (actionBtn) ghostAction(actionBtn.dataset.ghostAction);
  });

  syncMana();
  startRoaming();

  // First visits get a nudge toward the songs until one has been played.
  const hintSeen = load('y2k-hint-seen') === '1';
  if (!hintSeen) {
    const HINT = 'Drag me to a song.';
    setTimeout(() => {
      if (audio.playing() || isDragging || isModalOpen()) return;
      const musicTab = document.getElementById('musicTab');
      if (musicTab && musicTab.getAttribute('aria-pressed') !== 'true') musicTab.click();
      if (speech) speech.textContent = HINT;
      setTimeout(() => {
        if (speech && speech.textContent === HINT && !audio.playing()) speech.textContent = '✦ listen';
      }, 8000);
    }, 4000);
  }

  // Clicking the rest circle (or Enter on it) sends the reaper over to rest,
  // so soul can be restored without dragging.
  const restButton = document.getElementById('rest-circle');
  if (restButton) {
    restButton.addEventListener('click', () => {
      if (soul() >= 100) {
        if (speech) speech.textContent = 'Soul is full.';
        return;
      }
      const zone = restButton.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      const body = ghostBody.getBoundingClientRect();
      const b = getBounds();
      const x = clamp(zone.left + zone.width / 2 - (body.left - rect.left) - body.width / 2, b.minX, b.maxX);
      const y = clamp(zone.top + zone.height / 2 - (body.top - rect.top) - body.height / 2, b.minY, b.maxY);
      clearIdle();
      interactionPause = false;
      if (roamEnabled) {
        target.x = x;
        target.y = y;
        hurry = true;
      } else {
        pos.x = x;
        pos.y = y;
        setPosition(x, y);
      }
      if (speech) speech.textContent = 'Going to rest.';
    });
  }

  // Lines for the visitor's time of day, now and then while he idles.
  function timeLine() {
    const h = new Date().getHours();
    if (h < 5) return 'Up late.';
    if (h < 9) return 'Early. The dead sleep in.';
    if (h < 12) return 'Morning. Still here.';
    if (h < 17) return 'Long day?';
    if (h < 21) return 'Dusk. My hour.';
    return 'Night. Stay a while.';
  }

  function sayIdle(text) {
    if (!speech || audio.playing() || isDragging || speech.textContent !== '✦ listen') return;
    speech.textContent = text;
    setTimeout(() => {
      if (speech.textContent === text && !audio.playing()) speech.textContent = '✦ listen';
    }, 6000);
  }

  if (hintSeen) setTimeout(() => sayIdle(timeLine()), 2500);
  setInterval(() => { if (Math.random() < 0.4) sayIdle(timeLine()); }, 70000);

  let trickle = 0;
  setInterval(() => {
    const ring = document.getElementById('rest-circle');
    if (!ring) return;
    const resting = onRest();
    const wasLocked = restLock;
    if (resting && !isDragging && soul() < 100) {
      gainSoul(6);
    } else if (soul() < 100 && ++trickle % 9 === 0) {
      // A slow trickle (about 1 every 4s) away from the circle.
      gainSoul(1);
    }
    restLock = resting && !isDragging && soul() < 100;
    ring.classList.toggle('is-resting', restLock);
    const speech = document.getElementById('ghost-speech');
    if (restLock && !wasLocked && speech) {
      const hint = Math.random() < 0.5 ? riteHint() : null;
      speech.textContent = hint || 'Rest.';
    }
    if (wasLocked && !restLock && !isDragging) leaveRest();
  }, 450);

}
