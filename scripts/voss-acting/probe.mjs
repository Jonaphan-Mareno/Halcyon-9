import { writeFileSync } from 'node:fs';
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';
const page_ = process.argv[2] || 'scripts/voss-acting/probe.html';
const vite = await startVite(5181);
const page = await launchBrowser({ headless: true, args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  await page.goto(vite.url + page_);
  const out = await page.evaluate(`new Promise((res,rej)=>{const t=setInterval(()=>{if(window.__out){clearInterval(t);res(window.__out)}},200)})`, { timeout: 180000 });
  writeFileSync(process.argv[3] || 'probe-out.json', JSON.stringify(out, null, 1));
} finally { await page.close(); vite.close(); }
