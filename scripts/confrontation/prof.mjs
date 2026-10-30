// What one frame of the confrontation costs on the CPU, part by part (dev only; headless, so slow)
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';
const vite = await startVite(5188);
const page = await launchBrowser({ headless: true, width: 320, height: 180, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/confrontation/preview.html');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (window.__ready !== undefined) { clearInterval(t); res(); } }, 250); })', { timeout: 240000 });
  const r = await page.evaluate(`(() => {
    const c = window.__conf, parts = ['_walk', '_acting', '_look', '_mouths', '_cableUpdate', '_ariaUpdate', '_lights', '_camera', '_sounds'];
    const sum = {};
    for (const p of parts) { const f = c[p].bind(c); sum[p] = 0; c[p] = (...a) => { const t0 = performance.now(); const r = f(...a); sum[p] += performance.now() - t0; return r; }; }
    const up = c.actor.update.bind(c.actor); sum.actor = 0;
    c.actor.update = (dt) => { const t0 = performance.now(); up(dt); sum.actor += performance.now() - t0; };
    const chunks = []; for (let k = 0; k < 9; k++) { const a = performance.now(); for (let i = 0; i < 300; i++) { c.t += 1 / 30; c._animate(c.t, 1 / 30); } chunks.push(+((performance.now() - a) / 300).toFixed(2)); }
    console.log("chunks " + chunks.join(" "));
    const t0 = performance.now(); const n = 90;
    for (let i = 0; i < n; i++) { c.t += 1 / 30; c._animate(c.t, 1 / 30); }
    const all = (performance.now() - t0) / n;
    const out = { perFrame: +all.toFixed(2) };
    for (const k in sum) out[k] = +(sum[k] / n).toFixed(2);
    return JSON.stringify(out);
  })()`);
  console.log(r);
  console.log(page.logs.filter((l) => l.includes('chunks')).join(' '));
} finally { await page.close(); vite.close(); }
