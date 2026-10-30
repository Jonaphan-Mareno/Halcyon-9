// The confrontation in the game itself (dev only): ?level=3&confrontation in a headless Chrome.
// Starts the level, lets the scene play for a while (screenshots), presses Enter to skip to the
// choice, picks one, and prints what the page said.
//   node scripts/confrontation/game.mjs <out dir> [seconds to watch before skipping] [yes|no]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'confrontation-game';
const watch = +(process.argv[3] || 20);
const pick = process.argv[4] || 'yes';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vite = await startVite(5189);
const page = await launchBrowser({ headless: true, width: 960, height: 540, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shot = async (name) => writeFileSync(join(outDir, name + '.png'), await page.screenshot());
try {
  await page.goto(vite.url + '?level=3&confrontation');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { const b = document.getElementById("start-btn"); if (b) { clearInterval(t); b.click(); res(); } }, 300); })');
  console.log('started');
  // until the confrontation runs
  await page.evaluate('new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { const s = window.__game?.level2; if (s?.confrontation?.running) { clearInterval(t); res(); } else if (Date.now() - t0 > 400000) { clearInterval(t); rej(new Error("it never started")); } }, 500); })', { timeout: 420000 });
  console.log('confrontation running');
  const start = Date.now();
  for (let k = 0; (Date.now() - start) / 1000 < watch; k++) {
    await sleep(4000);
    const t = await page.evaluate('window.__game.level2.confrontation.t.toFixed(1)');
    await shot(`play-${String(k).padStart(2, '0')}-t${t}`);
  }
  const before = await page.evaluate('JSON.stringify({ t: window.__game.level2.confrontation.t, stats: window.__game.level2.confrontation.stats, ac: window.__game.level2.confrontation.ac?.state })');
  console.log('before skip', before);
  await page.key('Enter');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (document.querySelector("[data-choice]")) { clearInterval(t); res(); } }, 300); })', { timeout: 120000 });
  await sleep(2500);
  await shot('choice');
  await page.evaluate(`document.querySelector('[data-choice="${pick}"]').click()`);
  await sleep(1500);
  await shot('after');
  console.log(page.logs.filter((l) => /Confrontation|chose|exception|error/i.test(l)).join('\n'));
  console.log('state', await page.evaluate('window.__game.state'));
} finally {
  await page.close();
  vite.close();
}
