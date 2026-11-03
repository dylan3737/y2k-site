// Page chrome: the ticker date, click and cursor effects, the bottom nav, dialogs and copy buttons.
import { hideGameCard } from './games.js';
import { reducedMotion } from './store.js';

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
function spawnBullseye(clientX, clientY) {
  if (reducedMotion) return;
  const wrap = document.createElement('div');
  wrap.className = 'bullseye';
  wrap.style.left = clientX + 'px';
  wrap.style.top = clientY + 'px';

  const face = document.createElement('span');
  face.className = 'bullseye-face';
  wrap.appendChild(face);
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 850);
}
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  spawnBullseye(e.clientX, e.clientY);
});

// Glitter Sparkle Trail Effect
const sparkles = ['✦', '★', '✧', '❄', '✨'];
window.addEventListener('mousemove', (e) => {
  if (reducedMotion) return;
  if (Math.random() < 0.25) {
    const span = document.createElement('span');
    span.className = 'sparkle';
    span.innerText = sparkles[Math.floor(Math.random() * sparkles.length)];
    span.style.left = e.clientX + 'px';
    span.style.top = e.clientY + 'px';
    span.style.color = ['#ffa6d5', '#8fdcf0', '#b5f2d0', '#fff1a8'][Math.floor(Math.random() * 4)];
    document.body.appendChild(span);
    setTimeout(() => span.remove(), 800);
  }
});

// Modals Handling
const modalContainer = document.getElementById('modalContainer');
const modalContent = modalContainer.querySelector('.modal-content');
const closeModalBtn = document.getElementById('closeModal');
const navLinks = document.querySelectorAll('nav.bottom-nav .nav-link');
const modalSections = document.querySelectorAll('.modal-section');

let lastFocusedElement = null;

export function isModalOpen() {
  return modalContainer.classList.contains('active');
}

export function openModal(targetId) {
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
    if (link.id === 'portfolioTab') {
      const ring = document.querySelector('.game-ring');
      const open = ring.classList.toggle('is-open');
      link.setAttribute('aria-pressed', open ? 'true' : 'false');
      if (!open) hideGameCard();
      return;
    }
    if (link.hasAttribute('data-music')) {
      const ring = document.querySelector('.song-ring');
      const open = ring.classList.toggle('is-open');
      link.setAttribute('aria-pressed', open ? 'true' : 'false');
      return;
    }
    openModal(link.getAttribute('data-target'));
  });
});

// Any other element that wants to open a modal section (e.g. "All work"
// in the game ring) just needs a data-open-modal attribute.
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-open-modal]');
  if (trigger) openModal(trigger.dataset.openModal);
});

// Copy buttons anywhere on the page, including ones added later.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const text = btn.dataset.copy;
  const done = () => {
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
  };
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      if (document.execCommand('copy')) done();
      else btn.textContent = 'Select it';
    } catch (err) {
      btn.textContent = 'Select it';
    }
    area.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
  else fallback();
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
