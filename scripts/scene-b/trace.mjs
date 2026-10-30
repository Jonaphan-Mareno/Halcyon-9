// Scene B's camera, frame by frame (dev only): the fastest moves inside each shot, which finds snaps.
//   node scripts/scene-b/trace.mjs [t1]
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const vite = await startVite(5195);
const page = await launchBrowser({ headless: true, width: 320, height: 180, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/scene-b/preview.html');
  await page.evaluate('new Promise((res, rej) => { const t = setInterval(() => { if (window.__error) { clearInterval(t); rej(new Error(window.__error)); } else if (window.__ready !== undefined) { clearInterval(t); res(); } }, 250); })', { timeout: 300000 });
  const T = JSON.parse(await page.evaluate('JSON.stringify(window.__T())'));
  const rows = JSON.parse(await page.evaluate(`JSON.stringify(window.__trace(${+process.argv[2] || T.end}))`, { timeout: 600000 }));
  // per shot: the fastest speed of the camera's position (m/s) and turn (rad/s) between frames
  const shots = new Map();
  for (let i = 1; i < rows.length; i++) {
    const [t, s, x, y, z, qx, qy, qz, qw] = rows[i], p = rows[i - 1];
    if (s !== p[1]) continue;                       // (a cut)
    const dt = t - p[0];
    const v = Math.hypot(x - p[2], y - p[3], z - p[4]) / dt;
    const dot = Math.min(1, Math.abs(qx * p[5] + qy * p[6] + qz * p[7] + qw * p[8]));
    const w = 2 * Math.acos(dot) / dt;
    const o = shots.get(s) || { from: t, v: 0, w: 0, vAt: 0, wAt: 0 };
    if (v > o.v) { o.v = v; o.vAt = t; }
    if (w > o.w) { o.w = w; o.wAt = t; }
    shots.set(s, o);
  }
  for (const [s, o] of shots) console.log(`shot ${String(s).padStart(2)} from ${o.from.toFixed(1).padStart(5)} s: fastest ${o.v.toFixed(2)} m/s at ${o.vAt.toFixed(2)}, turn ${o.w.toFixed(2)} rad/s at ${o.wAt.toFixed(2)}`);
} finally {
  await page.close();
  vite.close();
}
