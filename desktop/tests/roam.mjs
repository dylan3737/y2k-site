// Roaming between monitors. The door maths runs anywhere; the rest starts the
// real app and needs a desktop of several monitors:
//   tests/plp-desktop.sh node tests/roam.mjs
// With one monitor (plain xvfb-run, or a laptop) the app part is skipped.
import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { doorsOf } from '../screens.js';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
  if (!ok) failures++;
}

// --- Doors ------------------------------------------------------------------------
const mon = (id, x, y, width, height, work) => ({ id, bounds: { x, y, width, height }, workArea: work || { x, y, width, height } });
const L = mon(1, 0, 0, 1080, 1920);
const M = mon(2, 1080, 420, 1920, 1080);
const R = mon(3, 3000, 0, 1080, 1920);
const plp = [L, M, R];
const show = (list) => JSON.stringify(list);

let doors = doorsOf(L, plp);
check('a portrait monitor has one door, where the landscape one touches it', doors.length === 1 &&
  doors[0].id === 2 && doors[0].side === 'right' && doors[0].from === 420 && doors[0].to === 1500, show(doors));
doors = doorsOf(M, plp);
check('the landscape one in the middle has a door each side, all the way up', doors.length === 2 &&
  doors.some((d) => d.side === 'left' && d.id === 1 && d.from === 0 && d.to === 1080) &&
  doors.some((d) => d.side === 'right' && d.id === 3 && d.from === 0 && d.to === 1080), show(doors));
check('one monitor alone has no doors', doorsOf(L, [L]).length === 0);

// A taskbar along the bottom of the middle monitor: its doors stop above it.
const taskbar = mon(2, 1080, 420, 1920, 1080, { x: 1080, y: 420, width: 1920, height: 1032 });
doors = doorsOf(taskbar, [L, taskbar, R]);
check('doors stop at a taskbar', doors.every((d) => d.from === 0 && d.to === 1032), show(doors));
// A menu bar at the top of a monitor: page coordinates start under it.
const menubar = mon(1, 0, 0, 1080, 1920, { x: 0, y: 25, width: 1080, height: 1895 });
doors = doorsOf(menubar, [menubar, M, R]);
check('doors are measured from the top of the work area', doors[0].from === 395 && doors[0].to === 1475, show(doors));

const above = mon(4, 0, -1080, 1920, 1080);
const below = mon(5, 0, 0, 1920, 1080);
check('monitors stacked one above the other have doors top and bottom',
  doorsOf(below, [above, below])[0].side === 'top' && doorsOf(above, [above, below])[0].side === 'bottom');
check('a gap between monitors is no door', doorsOf(mon(1, 0, 0, 1920, 1080), [mon(1, 0, 0, 1920, 1080), mon(2, 1940, 0, 1920, 1080)]).length === 0);
check('monitors that only touch at a corner have no door', doorsOf(mon(1, 0, 0, 1920, 1080), [mon(1, 0, 0, 1920, 1080), mon(2, 1920, 1080, 1920, 1080)]).length === 0);
check('a sliver of shared edge is no door', doorsOf(mon(1, 0, 0, 1920, 1080), [mon(1, 0, 0, 1920, 1080), mon(2, 1920, 1000, 1920, 1080)]).length === 0);

// --- The app, on several monitors ----------------------------------------------------
const here = path.dirname(fileURLToPath(import.meta.url));
// Its own data folder on every system (XDG_CONFIG_HOME alone is Linux only).
const scratch = mkdtempSync(path.join(tmpdir(), 'reaper-roam-'));
const env = { ...process.env, XDG_CONFIG_HOME: scratch, REAPER_USER_DATA: path.join(scratch, 'Reaper'), OLLAMA_HOST: '127.0.0.1:1' };
// A returning user: walking is what is tested here, not the first-run guide.
mkdirSync(env.REAPER_USER_DATA, { recursive: true });
writeFileSync(path.join(env.REAPER_USER_DATA, 'companion.json'), JSON.stringify({ guided: true }));
delete env.ANTHROPIC_API_KEY;
const app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron'), args: [path.join(here, '..')], env });
try {
  const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea })));
  if (displays.length < 2) {
    console.log('SKIP  the app on several monitors (this desktop has one; run under tests/plp-desktop.sh)');
  } else {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForSelector('#body');
    await page.waitForTimeout(800);
    const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    const onMonitor = async () => {
      const b = await bounds();
      const d = displays.find((x) => Math.abs(x.workArea.x - b.x) <= 2 && Math.abs(x.workArea.y - b.y) <= 2);
      return d ? displays.indexOf(d) : -1;
    };
    const reaper = () => page.evaluate(() => ({ x: window.__reaper.pos.x, y: window.__reaper.pos.y, w: innerWidth, h: innerHeight, mode: window.__reaper.mode }));
    const settle = async (want, tries = 40) => {
      for (let i = 0; i < tries; i++) {
        if ((await onMonitor()) === want && !(await page.evaluate(() => window.__reaper.crossing))) return true;
        await page.waitForTimeout(100);
      }
      return false;
    };

    check('he starts on the primary monitor', (await onMonitor()) === 0, JSON.stringify(await bounds()));
    const seen = await page.evaluate(() => window.__reaper.doors);
    check('the page knows the door to the next monitor', seen.length === 1 && seen[0].side === 'right' && seen[0].from === 420 && seen[0].to === 1500, JSON.stringify(seen));

    // Walking: put him by the door, nudge his next wander to choose it.
    await page.evaluate(() => {
      const r = window.__reaper;
      // Already at the doorway's height, so the walk is short. With every roll
      // at 0.1 he aims 10% of the way down the door: 420 + 108 = 528.
      r.pos.x = innerWidth - 92 - 60;
      r.pos.y = 528 - 57;
      // A low roll picks a door, and the first one.
      window.realRandom = Math.random;
      Math.random = () => 0.1;
      r.retarget();
    });
    check('he walks through a doorway onto the next monitor', await settle(1, 150));
    await page.evaluate(() => { Math.random = window.realRandom; });
    let at = await reaper();
    check('the window is now the landscape monitor', at.w === 1920 && at.h === 1080, JSON.stringify(at));
    // His middle was at y 528 on the desktop, which is 108 on a monitor that starts at 420.
    check('he comes in at the left edge, at the same height on the desktop', at.x < 20 && Math.abs(at.y + 57 - 108) <= 2, JSON.stringify(at));
    // (Given time: on CI's virtual display the animation frames can be slow after the window moves.)
    check('and walks on in, away from the doorway', await page.waitForFunction(() => window.__reaper.pos.x > 40, null, { timeout: 15000 }).then(() => true, () => false));
    await page.reload();
    await page.waitForSelector('#body');
    await page.waitForTimeout(600);
    // From here on he only moves when thrown, so a stroll can't spoil a check.
    const still = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('settings', { wander: false }));
    await still();
    check('after a reload he knows both doors of the middle monitor', (await page.evaluate(() => window.__reaper.doors.map((d) => d.side).sort().join())) === 'left,right');

    // Flinging: drag him fast toward the right edge and let go.
    await page.evaluate(() => { window.__reaper.pos.x = innerWidth - 400; window.__reaper.pos.y = 300; });
    await page.waitForTimeout(100);
    const box = await page.locator('#body').boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(sx + i * 25, sy, { steps: 1 });
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
    check('flung at an edge with a door, he flies through it', await settle(2));
    at = await reaper();
    check('and lands on the far portrait monitor, coming in from its left edge', at.h === 1920 && at.x < 300, JSON.stringify(at));
    await page.waitForFunction(() => window.__reaper.mode !== 'fly', null, { timeout: 8000 }).catch(() => {});

    // The far edge of the last monitor has no door: a fling there bounces.
    await page.evaluate(() => { window.__reaper.pos.x = innerWidth - 300; window.__reaper.pos.y = 900; });
    await page.waitForTimeout(100);
    const box2 = await page.locator('#body').boundingBox();
    await page.mouse.move(box2.x + 46, box2.y + 57);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box2.x + 46 + i * 25, box2.y + 57, { steps: 1 });
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
    check('an edge with no monitor beyond it is a wall', (await onMonitor()) === 2);

    // Low down on a portrait monitor, the landscape one isn't beside him: no door there.
    const crossed = await page.evaluate(async () => {
      const r = window.__reaper;
      r.pos.x = 30;
      r.pos.y = innerHeight - 200;
      const door = r.doors.find((d) => d.side === 'left');
      return { door, below: innerHeight - 200 + 57 > door.to };
    });
    check('a portrait monitor\'s door only spans the landscape one beside it', crossed.below && crossed.door.to === 1500, JSON.stringify(crossed));

    // Roaming switched off in the tray: a fling at a doorway bounces.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('settings', { roam: false }));
    await page.evaluate(() => { window.__reaper.pos.x = 300; window.__reaper.pos.y = 900; });
    await page.waitForTimeout(100);
    const box3 = await page.locator('#body').boundingBox();
    await page.mouse.move(box3.x + 46, box3.y + 57);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box3.x + 46 - i * 25, box3.y + 57, { steps: 1 });
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
    await page.waitForTimeout(1500);
    check('with roaming off, a doorway is a wall too', (await onMonitor()) === 2 && (await page.evaluate(() => window.__companion === undefined)));
    check('no page errors', errors.length === 0, errors.join('; '));
  }
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await app.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll roam checks passed');
process.exit(failures ? 1 : 0);
