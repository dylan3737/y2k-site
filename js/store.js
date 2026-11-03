// localStorage can be missing or throw (private windows, blocked storage),
// so every read and write goes through these.
export function load(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (err) {
    return fallback;
  }
}

export function save(key, value) {
  try { localStorage.setItem(key, String(value)); } catch (err) {}
}

export function forget(keys) {
  keys.forEach((key) => {
    try { localStorage.removeItem(key); } catch (err) {}
  });
}

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
