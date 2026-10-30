// The camera's speed through the whole scene (dev only): every frame where it moves fast without a
// cut, and the cuts. node scripts/confrontation/trace.mjs
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const vite = await startVite(5187);
const page = await launchBrowser({ headless: true, width: 320, height: 180, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/confrontation/preview.html');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (window.__ready !== undefined) { clearInterval(t); res(); } }, 250); })', { timeout: 240000 });
  const T = JSON.parse(await page.evaluate('JSON.stringify(window.__T)'));
  const tr = await page.evaluate(`window.__trace(${T.prompt + 6})`, { timeout: 600000 });
  let worstMove = 0, worstTurn = 0;
  for (let i = 1; i < tr.length; i++) {
    const [t, s, x, y, z, ...q] = tr[i], [t0, s0, x0, y0, z0, ...q0] = tr[i - 1];
    const dt = t - t0;
    const v = Math.hypot(x - x0, y - y0, z - z0) / dt;
    const dot = Math.min(1, Math.abs(q[0] * q0[0] + q[1] * q0[1] + q[2] * q0[2] + q[3] * q0[3]));
    const w = (2 * Math.acos(dot) * 180) / Math.PI / dt;
    if (s !== s0) { console.log(`cut at ${t.toFixed(2)} to shot ${s}`); continue; }
    worstMove = Math.max(worstMove, v);
    worstTurn = Math.max(worstTurn, w);
    // (a change of speed: a jolt)
    if (v > 1.6 || w > 70) console.log(`fast at ${t.toFixed(2)} (shot ${s}): ${v.toFixed(2)} m/s, ${w.toFixed(0)} deg/s`);
  }
  console.log(`worst without a cut: ${worstMove.toFixed(2)} m/s, ${worstTurn.toFixed(0)} deg/s`);
} finally {
  await page.close();
  vite.close();
}
