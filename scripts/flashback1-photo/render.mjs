// Renders the photograph of Flashback 1 and saves it as
// public/assets/textures/flashback1/briefing-photo.webp (see photo.js for what it is).
// Run from the project folder: node scripts/flashback1-photo/render.mjs
// (Starts the dev server and a headless Chrome itself; CHROME=<path> picks the browser.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { startVite, launchBrowser } from './cdp.mjs';

const OUT = 'public/assets/textures/flashback1/briefing-photo.webp';
const vite = await startVite();
const page = await launchBrowser({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + 'scripts/flashback1-photo/index.html');
  await page.evaluate(`new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (window.__error) { clearInterval(t); reject(new Error(window.__error)); }
      if (window.__ready) { clearInterval(t); resolve(); }
    }, 100);
  })`, { timeout: 180000 });
  const url = await page.evaluate('window.__photo');
  const data = Buffer.from(url.split(',')[1], 'base64');
  mkdirSync('public/assets/textures/flashback1', { recursive: true });
  writeFileSync(OUT, data);
  console.log('wrote', OUT, Math.round(data.length / 1024) + ' KB');
} finally {
  await page.close();
  vite.close();
}
