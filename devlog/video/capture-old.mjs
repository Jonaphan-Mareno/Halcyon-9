// Films old versions of the game for the devlog's "before" shots (dev only):
//   node devlog/video/capture-old.mjs <scratch dir> <commit> <name> [query] [wait s] [keys...]
// Checks the commit out into its own worktree (sharing this checkout's node_modules: the
// dependencies are the same), serves it with Vite, opens it in a headless browser at 1080x506,
// clicks into it, presses the keys given (a key name, or "wait:<s>"), then saves a frame every
// 0.1 s for 5 s. The worktree is removed afterwards.
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launchBrowser } from '../../scripts/flashback1-photo/cdp.mjs';

const [scratch, commit, name, query = '', waitS = '12', ...keys] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const repo = resolve('.');
const tree = join(scratch, 'wt-' + commit);
const out = join(scratch, 'old', name);
mkdirSync(out, { recursive: true });

if (!existsSync(tree)) execSync(`git worktree add --detach "${tree}" ${commit}`, { stdio: 'ignore' });
if (!existsSync(join(tree, 'node_modules'))) execSync(`cmd /c mklink /J "${join(tree, 'node_modules')}" "${join(repo, 'node_modules')}"`, { stdio: 'ignore' });

const port = 5300 + Math.floor(Math.random() * 300);
const vite = spawn(process.execPath, [join(repo, 'node_modules/vite/bin/vite.js'), tree, '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((ok, fail) => {
  const t = setTimeout(() => fail(new Error('vite did not start')), 40000);
  vite.stdout.on('data', (d) => { if (/localhost:\d+/.test(String(d).replace(/\u001b\[[0-9;]*m/g, ''))) { clearTimeout(t); ok(); } });
});
const page = await launchBrowser({ headless: true, width: 1080, height: 506, log: false, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 506, deviceScaleFactor: 1, mobile: false });
  await page.goto(`http://localhost:${port}/${query}`);
  await sleep(4000);
  const click = async (x = 540, y = 253) => {
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  await click();
  await sleep(Number(waitS) * 1000);
  for (const k of keys) {
    if (k.startsWith('wait:')) { await sleep(Number(k.slice(5)) * 1000); continue; }
    if (k === 'click') { await click(); continue; }
    if (k.startsWith('click:')) { const [, x, y] = k.split(':'); await click(Number(x), Number(y)); continue; }
    if (k.startsWith('look:')) {           // look:<dx>: the mouse moved sideways in small steps
      const dx = Number(k.split(':')[1]);
      for (let i = 0; i < 20; i++) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 540 + (dx * i) / 20, y: 253 });
      continue;
    }
    if (k.startsWith('hold:')) {           // hold:<code>:<seconds>
      const [, code, s] = k.split(':');
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Key', '').toLowerCase() });
      await sleep(Number(s) * 1000);
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.replace('Key', '').toLowerCase() });
      continue;
    }
    await page.key(k, k === 'Enter' ? 'Enter' : k);
    await sleep(600);
  }
  for (let i = 0; i < 50; i++) {
    writeFileSync(join(out, `f${String(i + 1).padStart(4, '0')}.png`), await page.screenshot());
    await sleep(100);
  }
  writeFileSync(join(out, 'logs.txt'), page.logs.join('\n'));
  console.log('CAPTURED', name);
} finally {
  await page.close();
  vite.kill();
  await sleep(500);
}
