// Frames of the confrontation at given times (dev only): a contact sheet's worth of JPEGs.
//   node scripts/confrontation/check.mjs <out dir> [t1,t2,...] [width]x[height]
// Times may be names from the timeline (arrive, raise, flinch, ...) or seconds. Prints the timeline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'confrontation-check';
// a time may carry a view after '@': 12@R:R+0.6;0.2;0.5 (look at the right hand from 0.6 m off it)
const times = (process.argv[3] || '1,4,8,12,20,30,40,50,60,70,80,90').split(',').map((s) => s.trim());
const [w, h] = (process.argv[4] || '960x540').split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const vite = await startVite(5186);
const page = await launchBrowser({ headless: true, width: w, height: h, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/confrontation/preview.html');
  await page.evaluate('new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { if (window.__ready !== undefined) { clearInterval(t); res(); } else if (Date.now() - t0 > 200000) rej(new Error("no ready")); }, 250); })', { timeout: 240000 })
    .catch((e) => { console.log(page.logs.join('\n')); throw e; });
  if (!(await page.evaluate('window.__ready'))) { console.log(page.logs.join('\n')); throw new Error('the scene did not load'); }
  const T = await page.evaluate('JSON.stringify(window.__T)');
  console.log('timeline', T);
  const tl = JSON.parse(T);
  const shots = [];
  for (const spec of times) {
    const [name, v] = spec.split('@');
    const t = isNaN(+name) ? (Array.isArray(tl[name]) ? tl[name][0] : tl[name]) : +name;
    let view = null;
    if (v) {
      const [l, p] = v.split(':');
      const m = p.match(/^(\w+)\+(.*)$/);
      view = { l: /^[A-Za-z]+$/.test(l) ? l : l.split(';').map(Number), p: m ? [m[1], ...m[2].split(';').map(Number)] : p.split(';').map(Number) };
    }
    const url = await page.evaluate(`window.__frame(${t}, ${JSON.stringify(view)})`, { timeout: 300000 });
    const file = join(outDir, `${String(t.toFixed(2)).padStart(6, '0')}-${name}${v ? '-v' + times.indexOf(spec) : ''}.jpg`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    shots.push([url, spec]);
  }
  // and the frames nine to a sheet, labelled
  for (let k = 0; k < shots.length; k += 9) {
    const url = await page.evaluate(`(async (list) => {
      const c = document.createElement('canvas'); c.width = 1440; c.height = 810;
      const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1440, 810);
      for (let i = 0; i < list.length; i++) {
        const im = new Image(); im.src = list[i][0]; await im.decode();
        const x = (i % 3) * 480, y = Math.floor(i / 3) * 270;
        g.drawImage(im, x, y, 480, 270);
        g.fillStyle = '#000'; g.fillRect(x, y, 190, 18); g.fillStyle = '#ff0'; g.font = '13px monospace'; g.fillText(list[i][1].slice(0, 26), x + 3, y + 13);
      }
      return c.toDataURL('image/jpeg', 0.85);
    })(${JSON.stringify(shots.slice(k, k + 9))})`);
    const file = join(outDir, `_sheet${k / 9}.jpg`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('sheet', file);
  }
  const errs = page.logs.filter((l) => /exception|error|warn/i.test(l));
  if (errs.length) console.log(errs.join('\n'));
} finally {
  await page.close();
  vite.close();
}
