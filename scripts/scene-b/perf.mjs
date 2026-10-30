// Scene B's frame rate on this machine's GPU (dev only): the preview, headless but on the real
// GPU (ANGLE on D3D11), drawn at 1280 x 720 through its own render(), for a few seconds at each
// of its expensive moments (the walk, the plug close-up, the bar, the drain, the fall).
//   node scripts/scene-b/perf.mjs
import { startVite, launchBrowser } from '../flashback1-photo/cdp.mjs';

const vite = await startVite(5199);
const page = await launchBrowser({ headless: true, width: 1280, height: 720, log: false, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  await page.goto(vite.url + 'scripts/scene-b/preview.html');
  await page.evaluate('new Promise((res, rej) => { const t = setInterval(() => { if (window.__error) { clearInterval(t); rej(new Error(window.__error)); } else if (window.__ready !== undefined) { clearInterval(t); res(); } }, 250); })', { timeout: 300000 });
  console.log('GPU:', await page.evaluate(`(() => { const g = document.querySelector('canvas').getContext('webgl2'); const x = g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); })()`));
  const T = JSON.parse(await page.evaluate('JSON.stringify(window.__T())'));
  for (const [name, at] of [['walk', T.walk + 0.5], ['plug', T.try1], ['sit, bar', T.p40 - 2], ['drain', T.drain + 0.2], ['fall', T.fall + 0.5]]) {
    const r = JSON.parse(await page.evaluate(`new Promise((res) => {
      window.__frame(${at});
      const sb = window.__sb;
      const times = [];
      let last = performance.now();
      const stop = performance.now() + 4000;
      const loop = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        sb.t += 1 / 60; sb._animate(sb.t, 1 / 60); sb._subtitles(sb.t); sb._draw(window.__r, sb.t);
        if (now < stop) requestAnimationFrame(loop); else { times.shift(); times.sort((a, b) => a - b); res(JSON.stringify({ fps: +(1000 / (times.reduce((a, b) => a + b, 0) / times.length)).toFixed(1), p95ms: +times[Math.floor(times.length * 0.95)].toFixed(1) })); }
      };
      requestAnimationFrame(loop);
    })`, { timeout: 60000 }));
    console.log(name.padEnd(9), JSON.stringify(r));
  }
} finally {
  await page.close();
  vite.close();
}
