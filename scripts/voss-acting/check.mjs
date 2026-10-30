// Renders contact sheets of Voss's acting clips and writes the measurements (dev only).
//   node scripts/voss-acting/check.mjs <out dir> [sheets.json] [nomeasure]
// sheets.json: [{ name, clip, frames | times, views }, { name, steps: [[t, 'code'], ...], duration, every, views }]
// (see check.js; starts the dev server and a headless Chrome itself, as flashback1-photo does)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'voss-acting-check';
const sheets = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : [];
mkdirSync(outDir, { recursive: true });
const vite = await startVite(5183);
const page = await launchBrowser({ headless: true, width: 400, height: 400, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/voss-acting/check.html');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (window.__ready) { clearInterval(t); res(); } }, 200); })', { timeout: 240000 })
    .catch((e) => { console.log(page.logs.join('\n')); throw e; });
  if (!process.argv[4]) {
    const m = await page.evaluate('window.__measure()', { timeout: 240000 });
    writeFileSync(join(outDir, 'measure.json'), JSON.stringify(m, null, 1));
    console.log('measured');
  }
  for (const s of sheets) {
    const url = await page.evaluate(`window.__sheet(${JSON.stringify(s)})`, { timeout: 300000 });
    writeFileSync(join(outDir, s.name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', s.name);
  }
  const errs = page.logs.filter((l) => /exception|error|warn/i.test(l));
  if (errs.length) console.log(errs.join('\n'));
} finally {
  await page.close();
  vite.close();
}
