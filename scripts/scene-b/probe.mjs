// Voss's clips held at chosen frames (dev only): bone positions and labelled contact sheets.
//   node scripts/scene-b/probe.mjs <out dir> "<clip>@<t>[:view],..."  [bones]
// e.g. node scripts/scene-b/probe.mjs out "SitDown@1.5,FallForward@0.75:front" bones
// Views: side (from his right), front, three, back. With "bones", the bone positions are printed
// too (in his root's frame: +z his front, +x his left).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'scene-b-probe';
const specs = (process.argv[3] || 'SitIdle@0').split(',').map((s) => s.trim());
const bones = process.argv[4] === 'bones';
mkdirSync(outDir, { recursive: true });
const vite = await startVite(5188);
const page = await launchBrowser({ headless: true, width: 480, height: 480, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/scene-b/probe.html');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (window.__ready) { clearInterval(t); res(); } }, 200); })', { timeout: 240000 });
  console.log('clips', JSON.stringify(await page.evaluate('window.__clips')));
  const shots = [];
  for (const spec of specs) {
    // (a spec may carry a built pose after '+': SitDown@3.2+kneel=1:front)
    const [main, extra = ''] = spec.split('+');
    const [pose, view = 'side'] = main.split(':');
    const [name, at] = pose.split('@');
    await page.evaluate(`window.__extra = ${JSON.stringify(extra.replace(/=/g, ':').replace(/:(side|front|three|back)$/, ''))}`);
    if (bones) console.log(pose, JSON.stringify(await page.evaluate(`window.__bones(${JSON.stringify(name)}, ${+at})`)));
    shots.push([await page.evaluate(`window.__shot(${JSON.stringify(name)}, ${+at}, ${JSON.stringify(view)})`), spec]);
  }
  for (let k = 0; k < shots.length; k += 12) {
    const url = await page.evaluate(`(async (list) => {
      const c = document.createElement('canvas'); c.width = 1440; c.height = 720;
      const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1440, 720);
      for (let i = 0; i < list.length; i++) {
        const im = new Image(); im.src = list[i][0]; await im.decode();
        const x = (i % 6) * 240, y = Math.floor(i / 6) * 240;
        g.drawImage(im, x, y, 240, 240);
        g.fillStyle = '#000'; g.fillRect(x, y, 200, 16); g.fillStyle = '#ff0'; g.font = '12px monospace'; g.fillText(list[i][1], x + 3, y + 12);
      }
      return c.toDataURL('image/jpeg', 0.85);
    })(${JSON.stringify(shots.slice(k, k + 12))})`);
    const file = join(outDir, `_probe${k / 12}.jpg`);
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('sheet', file);
  }
} finally {
  await page.close();
  vite.close();
}
