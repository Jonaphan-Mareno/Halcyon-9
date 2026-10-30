// The loudness of the ending's recordings (dev only): Scenes A, B and C and the narrations. Length,
// sample peak and integrated loudness (LUFS) of each file, decoded in a headless Chrome.
//   node scripts/confrontation/loudness.mjs [out.json]
// The gains in src/level3/Confrontation.js (VOICE_GAIN_DB) were set from its output.
import { writeFileSync } from 'node:fs';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const vite = await startVite(5185);
const page = await launchBrowser({ headless: true, width: 200, height: 200, log: false });
try {
  await page.goto(vite.url + 'scripts/confrontation/loudness.html');
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { if (window.__ready) { clearInterval(t); res(); } }, 100); })');
  const m = await page.evaluate('window.__measure()');
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(m, null, 1));
  console.log(JSON.stringify(m, null, 1));
  const errs = page.logs.filter((l) => /exception|error/i.test(l));
  if (errs.length) console.log(errs.join('\n'));
} finally {
  await page.close();
  vite.close();
}
