// Pictures of the narration at given times (dev only).
//   node scripts/scene-b/narration-check.mjs <out dir> [t1,t2,...]
// Times may be names from its timeline (hall, react, families, window, troll, photo; a line id such
// as n3; a name+1.5 adds seconds) or seconds. Prints the timeline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'narration-check';
const specs = (process.argv[3] || '2,4,polaroid+2,hall+3,n3b+0.8,react+0.5,react+2,families+1,families+3,families+5,window+1,window+4,troll+3,photo+2').split(',');
mkdirSync(outDir, { recursive: true });
const vite = await startVite(5196);
const page = await launchBrowser({ headless: true, width: 960, height: 540, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/scene-b/narration.html?headless');
  await page.evaluate('new Promise((res, rej) => { const t = setInterval(() => { if (window.__error) { clearInterval(t); rej(new Error(window.__error)); } else if (window.__ready) { clearInterval(t); res(); } }, 200); })', { timeout: 120000 });
  const T = JSON.parse(await page.evaluate('window.__at(0)'));
  console.log('timeline', JSON.stringify(T));
  for (const spec of specs) {
    const [b, plus = 0] = spec.split('+');
    const t = (isNaN(+b) ? (T[b] ?? T.line[b][0]) : +b) + +plus;
    await page.evaluate(`window.__at(${t})`);
    // (the pictures fade in over a second: wait it out)
    await page.evaluate('new Promise((r) => setTimeout(r, 1700))');
    await page.evaluate(`window.__at(${t})`);
    writeFileSync(join(outDir, `${t.toFixed(2).padStart(6, '0')}-${spec.replace(/[^\w.+-]/g, '_')}.png`), await page.screenshot());
  }
  const errs = page.logs.filter((l) => /exception|error/i.test(l));
  if (errs.length) console.log(errs.join('\n'));
} finally {
  await page.close();
  vite.close();
}
