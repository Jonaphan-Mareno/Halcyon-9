// The water lock's scene in the game itself (dev only): ?level=3&lock in a headless Chrome, or
// ?level=3&relay to look at the relay room and the hatch (it opens the hatch, as the reroute's win
// does, and swims him in). Screenshots every couple of seconds, the scene's state with each, and
// what the page said.
//   node scripts/relay-lock/game.mjs <out dir> [lock|relay] [seconds]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { launchBrowser } from '../flashback1-photo/cdp.mjs';

// (Vite as cdp.mjs starts it, but on vite.config.mjs here: no watching, so nothing reloads the page)
async function startVite(port) {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort', '--config', 'scripts/relay-lock/vite.config.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite did not start')), 30000);
    let said = '';
    proc.stdout.on('data', (d) => {
      said += String(d).replace(/\u001b\[[0-9;]*m/g, '');
      if (/localhost:\d+/.test(said)) { clearTimeout(timer); resolve(); }
    });
    proc.on('exit', (code) => reject(new Error('Vite exited ' + code)));
  });
  return { url: `http://localhost:${port}/`, close: () => proc.kill() };
}

const outDir = process.argv[2] || 'relay-lock-game';
const mode = process.argv[3] || 'lock';
const seconds = +(process.argv[4] || 90);
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vite = await startVite(5191);
const page = await launchBrowser({ headless: true, width: 960, height: 540, log: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shot = async (name) => writeFileSync(join(outDir, name + '.png'), await page.screenshot());
const state = () => page.evaluate(`(() => {
  const s = window.__game?.level2, L = s?.trench?.lock, sc = L?._scene;
  return JSON.stringify({ game: window.__game?.state, lock: L?.state, owns: L?.owns, T: sc ? +sc.T.toFixed(2) : null, shot: sc?.shot,
    landed: sc?.landed, sat: sc?.sat, water: L ? +(L.water.level - L.o.y).toFixed(2) : null, fog: s?.prep?._fogMode,
    conf: !!s?.confrontation?.running, actor: !!L?.actor, helmet: !!L?.helmet,
    clip: L?.actor?.currentName, feet: L?.actor ? ['leftFoot', 'rightFoot', 'leftCalf', 'pelvis'].map((b) => { const m = L.actor.bone(b)?.matrixWorld.elements; return m ? [+(m[12] - L.o.x).toFixed(2), +(m[13] - L.o.y).toFixed(2), +(m[14] - L.o.z).toFixed(2)] : null; }) : null,
    line: (() => { const d = document.getElementById('dialogue-box'); return d && d.classList.contains('visible') ? getComputedStyle(d).visibility + ': ' + d.textContent.slice(0, 40) : null; })() });
})()`);
try {
  await page.goto(vite.url + '?level=3&' + mode);
  await page.evaluate('new Promise((res) => { const t = setInterval(() => { const b = document.getElementById("start-btn"); if (b) { clearInterval(t); b.click(); res(); } }, 300); })');
  console.log('started');
  await page.evaluate('new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { const s = window.__game?.level2; if (s?.ready && s.trench?.lock) { clearInterval(t); res(); } else if (Date.now() - t0 > 400000) { clearInterval(t); rej(new Error("the level never loaded")); } }, 500); })', { timeout: 420000 });
  console.log('level ready', await state());
  if (mode === 'relay') {
    await sleep(3000);
    await shot('relay-00-room');
    // look at the hatch from the middle of the room
    await page.evaluate(`(() => { const s = window.__game.level2, L = s.trench.lock, c = s.controls;
      c.teleport(L.L(0, 0.2, -3.2)); c.camera.rotation.set(0, Math.PI, 0); c.facing = Math.PI; })()`);
    await sleep(2500);
    await shot('relay-01-hatch-sealed');
    // (the valves solved: the hatch slides open; then the reroute won)
    await page.evaluate('(() => { const t = window.__game.level2.trench; if (t.pressureSeal?.state) t.pressureSeal.state.solved = true; t.works.openRelayHatch(); })()');
    await sleep(4000);
    await page.evaluate('window.__game.level2.trench.lock.unseal()');
    for (let k = 0; k < 4; k++) { await sleep(2000); await shot('relay-02-unsealing-' + k); }
    console.log('after unseal', await state());
    await page.evaluate(`(() => { const s = window.__game.level2, L = s.trench.lock, c = s.controls;
      c.teleport(L.L(0, 0.4, -1.0)); c.camera.rotation.set(-0.1, Math.PI, 0); c.facing = Math.PI; })()`);
    await sleep(2500);
    await shot('relay-03-into-lock');
    await page.evaluate(`(() => { const s = window.__game.level2, L = s.trench.lock, c = s.controls;
      c.teleport(L.L(0, 0.6, 1.6)); })()`);
  }
  // a picture at each of these moments of the scene (its own clock), or every few seconds before it
  const at = (process.env.SHOTS || '0.5,1.5,2.6,3.8,5,6,6.6,7.2,8,9,10.5,12,13.5,15,16.5,18,19.5,21,22.5,24,25.5,27,28.5,30,32,34,36,38')
    .split(',').map(Number);
  const t0 = Date.now();
  let k = 0, last = 0;
  while ((Date.now() - t0) / 1000 < seconds) {
    await sleep(120);
    const j = JSON.parse(await state());
    if (process.env.TRACE && Date.now() - (globalThis.__traced || 0) > 2000) {
      globalThis.__traced = Date.now();
      console.log('t', ((Date.now() - t0) / 1000).toFixed(0), JSON.stringify(j));
      const errs = page.logs.filter((l) => /exception|error/i.test(l) && !/Pointer Lock|WrongDocument/.test(l));
      if (errs.length) console.log(errs.slice(-3).join('\n'));
    }
    // (NOLEAN=t: take the lean-back pose off at scene time t, to see what it does)
    if (process.env.NOLEAN && j.T >= +process.env.NOLEAN && !globalThis.__noLean) {
      globalThis.__noLean = true;
      await page.evaluate('window.__game.level2.trench.lock._leanOff?.()');
      console.log('lean off at', j.T);
    }
    const due = j.T != null ? at[k] != null && j.T >= at[k] : Date.now() - last > 4000;
    if (j.conf) { await sleep(3000); await shot('confrontation'); console.log('confrontation running'); break; }
    if (!due) continue;
    if (j.T != null) k++;
    last = Date.now();
    await shot(`lock-${String(k).padStart(2, '0')}-T${j.T ?? 'x'}-s${j.shot ?? 'x'}`);
    console.log(JSON.stringify(j));
  }
  console.log(page.logs.filter((l) => /RelayLock|exception|error|warn/i.test(l)).slice(0, 40).join('\n'));
} finally {
  await page.close();
  vite.close();
}
