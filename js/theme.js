import { load, save } from './store.js';

const themeBtn = document.getElementById('themeBtn');
const THEME_KEY = 'y2k-theme';

// Dark is the house look; light only once a visitor picks it with the switch.
let isDarkMode = load(THEME_KEY) !== 'light';

export function isDark() {
  return isDarkMode;
}

function syncThemeButton() {
  const light = !isDarkMode;
  document.body.classList.toggle('light-mode', light);
  themeBtn.setAttribute('aria-pressed', light ? 'true' : 'false');
  themeBtn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
}

syncThemeButton();

themeBtn.addEventListener('click', () => {
  isDarkMode = !isDarkMode;
  syncThemeButton();
  save(THEME_KEY, isDarkMode ? 'dark' : 'light');
});
