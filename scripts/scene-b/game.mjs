// The Save-ARIA ending in the game itself (dev only): ?level=3&ending=yes in a headless Chrome.
// Starts the level (the confrontation runs through to its choice and Yes is chosen), watches
// Scene B (screenshots), lets the narration play a while, skips it with Enter, closes the credits,
// and prints what the page said and the game's state at each step.
//   node scripts/scene-b/game.mjs <out dir> [seconds of Scene B to watch (default: all of it)] [seconds of narration]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const outDir = process.argv[2] || 'scene-b-game';
const watchB = +(process.argv[3] || 999);
const watchN = +(process.argv[4] || 14);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vite = await startVite(5198);
const page = await launchBrowser({ headless: true, width: 960, height: 540, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shot = async (name) => writeFileSync(join(outDir, name + '.png'), await page.screenshot());
const S = 'window.__game?.level2';
try {
  await page.goto(vite.url + '?level=3&ending=yes');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { const b = document.getElementById("start-btn"); if (b) { clearInterval(t); b.click(); res(); } }, 300); })');
  console.log('started');
  await page.evaluate(`new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { const s = ${S}; if (s?.ending?.running && s.sceneB?.running) { clearInterval(t); res(); } else if (Date.now() - t0 > 500000) { clearInterval(t); rej(new Error("Scene B never started")); } }, 500); })`, { timeout: 520000 });
  console.log('Scene B running; state', await page.evaluate('window.__game.state'));
  const start = Date.now();
  for (let k = 0; (Date.now() - start) / 1000 < watchB; k++) {
    await sleep(5000);
    const r = JSON.parse(await page.evaluate(`JSON.stringify({ t: ${S}.sceneB?.t, end: ${S}.sceneB?.T?.end, still: ${S}.confrontation?.still, narr: !!${S}.narration?.running })`));
    if (r.t === undefined || r.narr) break;
    await shot(`b-${String(k).padStart(2, '0')}-t${r.t.toFixed(1)}`);
    if (r.t > r.end) break;
  }
  if (!(await page.evaluate(`!!${S}.narration?.running`))) {
    // (watched only part of it: Enter goes to black and on)
    await page.key('Enter');
    console.log('skipped Scene B');
  }
  await page.evaluate(`new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { if (${S}.narration?.running) { clearInterval(t); res(); } else if (Date.now() - t0 > 120000) { clearInterval(t); rej(new Error("no narration")); } }, 300); })`, { timeout: 130000 });
  console.log('narration running; Scene B stats', await page.evaluate(`JSON.stringify(${S}.sceneB?.stats)`));
  for (let k = 0; k * 3.5 < watchN; k++) {
    await sleep(3500);
    await shot(`n-${String(k).padStart(2, '0')}`);
  }
  await page.key('Enter');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (document.querySelector(".ec-root")) { clearInterval(t); res(); } }, 300); })', { timeout: 60000 });
  await sleep(6000);
  await shot('credits');
  console.log('credits up; state', await page.evaluate('window.__game.state'), 'narration', await page.evaluate(`!!${S}.narration`), 'sceneB', await page.evaluate(`!!${S}.sceneB`));
  await page.key('Enter');
  await sleep(2500);
  console.log('after the credits:', await page.evaluate('location.href').catch(() => '(navigating)'));
  console.log(page.logs.filter((l) => /Scene B|Confrontation|Narration|chose|exception|error|warn/i.test(l)).join('\n'));
} finally {
  await page.close();
  vite.close();
}
