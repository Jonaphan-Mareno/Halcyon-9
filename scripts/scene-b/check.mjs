// Frames of Scene B at given times (dev only): a contact sheet's worth of JPEGs.
//   node scripts/scene-b/check.mjs <out dir> [t1,t2,...] [width]x[height]
// Times may be names from its timeline (lower, take, in, drain, fall, ...; a name+1.5 adds seconds) or seconds.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'scene-b-check';
// a time may carry a view after '@': 12@R:R+0.6;0.2;0.5 (look at the right hand from 0.6 m off it)
const times = (process.argv[3] || '0.5,3,6,9,13,18,22,26,30,35,40,45,50,55,60,64,68,72').split(',').map((s) => s.trim());
const [w, h] = (process.argv[4] || '960x540').split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const vite = await startVite(5189);
const page = await launchBrowser({ headless: true, width: w, height: h, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/scene-b/preview.html');
  await page.evaluate('new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { if (window.__error) { clearInterval(t); rej(new Error(window.__error)); } else if (window.__ready !== undefined) { clearInterval(t); res(); } else if (Date.now() - t0 > 200000) rej(new Error("no ready")); }, 250); })', { timeout: 240000 })
    .catch((e) => { console.log(page.logs.join('\n')); throw e; });
  if (!(await page.evaluate('window.__ready'))) { console.log(page.logs.join('\n')); throw new Error('the scene did not load'); }
  const T = await page.evaluate('JSON.stringify(window.__T())');
  console.log('timeline', T);
  const tl = JSON.parse(T);
  const shots = [];
  for (const spec of times) {
    const [name, v] = spec.split('@');
    const [base, plus = 0] = name.split('+');
    const named = (k) => (Array.isArray(tl[k]) ? tl[k][0] : tl[k] ?? (tl.line[k] ? tl.line[k][0] : NaN));
    const t = (isNaN(+base) ? named(base) : +base) + +plus;
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
