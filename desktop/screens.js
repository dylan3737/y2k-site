// Which edges of a monitor lead to another one. Plain data in, plain data out,
// so it can be tested without Electron.
export const SIDES = ['left', 'right', 'top', 'bottom'];
export const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const TOUCH = 2;      // px between monitors that still count as touching
const MIN_DOOR = 120; // a shared stretch of edge shorter than this is no door

// The doors of the monitor he is on, in page coordinates (from the top left of
// its work area): which side, the stretch of that side that leads through, and
// the monitor it leads to.
export function doorsOf(here, all) {
  const b = here.bounds;
  const w = here.workArea;
  const out = [];
  for (const d of all) {
    if (d.id === here.id) continue;
    const o = d.bounds;
    const yFrom = Math.max(b.y, o.y, w.y);
    const yTo = Math.min(b.y + b.height, o.y + o.height, w.y + w.height);
    const xFrom = Math.max(b.x, o.x, w.x);
    const xTo = Math.min(b.x + b.width, o.x + o.width, w.x + w.width);
    if (yTo - yFrom >= MIN_DOOR) {
      if (Math.abs(o.x + o.width - b.x) <= TOUCH) out.push({ id: d.id, side: 'left', from: yFrom - w.y, to: yTo - w.y });
      if (Math.abs(b.x + b.width - o.x) <= TOUCH) out.push({ id: d.id, side: 'right', from: yFrom - w.y, to: yTo - w.y });
    }
    if (xTo - xFrom >= MIN_DOOR) {
      if (Math.abs(o.y + o.height - b.y) <= TOUCH) out.push({ id: d.id, side: 'top', from: xFrom - w.x, to: xTo - w.x });
      if (Math.abs(b.y + b.height - o.y) <= TOUCH) out.push({ id: d.id, side: 'bottom', from: xFrom - w.x, to: xTo - w.x });
    }
  }
  return out;
}
