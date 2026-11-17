// The Crypt: the rules of the idle game, with no I/O, so the main process, the
// page's browser stand-in and the tests all share them.
//
// Souls are banked here for good (the meter under the reaper is his energy, a
// different thing). They come from what the user does: ghosts caught, files
// reaped, focus timers finished. Souls raise skeletons, and skeletons dig up
// more souls on their own, including while the user is away or the app is shut.

export const RATE_PER_HOUR = 6;   // souls one skeleton digs up in an hour
export const BASE_COST = 25;      // the first skeleton
export const GROWTH = 1.15;       // each one costs this much more than the last
export const MAX_SKELETONS = 200;
// Time nobody was counting (the app shut, the computer asleep) pays out up to this.
export const AWAY_CAP_HOURS = 8;

// What each deed is worth, per unit: a ghost, a file, a minute of finished focus.
export const WORTH = { caught: 1, reaped: 5, focus: 1 };

const HOUR = 3600000;
const whole = (n, max) => (Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0);

export const fresh = (now = Date.now()) => ({ souls: 0, skeletons: 0, total: 0, at: now });

// Whatever was saved, made safe to use.
export function clean(raw, now = Date.now()) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    souls: whole(c.souls, 1e12),
    skeletons: Math.floor(whole(c.skeletons, MAX_SKELETONS)),
    total: whole(c.total, 1e12),
    at: Number.isFinite(c.at) && c.at <= now ? c.at : now
  };
}

export const cost = (owned) => Math.ceil(BASE_COST * GROWTH ** owned);
export const perHour = (c) => c.skeletons * RATE_PER_HOUR;

// Pay out what the skeletons dug since the last count. Returns the souls added.
export function settle(c, now = Date.now()) {
  const hours = Math.min(AWAY_CAP_HOURS, Math.max(0, (now - c.at) / HOUR));
  const dug = perHour(c) * hours;
  c.souls += dug;
  c.total += dug;
  c.at = now;
  return dug;
}

// Souls for a deed. Returns the souls added (0 for anything unknown).
export function earn(c, deed, n) {
  if (!(deed in WORTH) || !Number.isFinite(n) || n <= 0) return 0;
  const gained = Math.min(1000, n) * WORTH[deed];
  c.souls += gained;
  c.total += gained;
  return gained;
}

// Raise up to `count` skeletons, as many as the souls allow.
export function raise(c, count = 1) {
  const wanted = Math.max(1, Math.min(50, Math.floor(Number(count)) || 1));
  let raised = 0;
  while (raised < wanted && c.skeletons < MAX_SKELETONS && c.souls >= cost(c.skeletons)) {
    c.souls -= cost(c.skeletons);
    c.skeletons += 1;
    raised += 1;
  }
  if (raised) return { ok: true, raised };
  if (c.skeletons >= MAX_SKELETONS) return { ok: false, raised: 0, error: 'The crypt is full.' };
  return { ok: false, raised: 0, error: 'Not enough souls: the next skeleton costs ' + cost(c.skeletons) + ' and the crypt holds ' + Math.floor(c.souls) + '.' };
}

// What the page and Speak are shown: whole souls only.
export function view(c) {
  return {
    souls: Math.floor(c.souls),
    skeletons: c.skeletons,
    nextCost: cost(c.skeletons),
    perHour: perHour(c),
    total: Math.floor(c.total),
    awayCapHours: AWAY_CAP_HOURS
  };
}
