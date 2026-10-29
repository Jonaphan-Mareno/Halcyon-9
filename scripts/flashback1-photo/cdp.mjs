// A very small Chrome DevTools Protocol client, for scripts that need a real browser (WebGL):
// starts Chrome (or Edge) and the Vite dev server, and talks to one page.
//
//   const vite = await startVite();               // http://localhost:<port>/
//   const page = await launchBrowser({ headless: true });
//   await page.goto(vite.url + 'scripts/flashback1-photo/index.html');
//   const value = await page.evaluate('window.someValue');
//   await page.close(); vite.close();
//
// Chrome is looked for in the usual places; CHROME=<path to chrome.exe> overrides. Needs Node 22
// (its built-in WebSocket).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function browserPath() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chrome or Edge found: set CHROME to its path.');
  return found;
}

// The Vite dev server, on a free port of its own
export async function startVite(port = 5179) {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite did not start')), 30000);
    let said = '';
    proc.stdout.on('data', (d) => {
      said += String(d).replace(/\u001b\[[0-9;]*m/g, '');     // (without its colours)
      if (/localhost:\d+/.test(said)) { clearTimeout(timer); resolve(); }
    });
    proc.on('exit', (code) => reject(new Error('Vite exited ' + code)));
  });
  return { url: `http://localhost:${port}/`, close: () => proc.kill() };
}

export async function launchBrowser({ headless = true, width = 1280, height = 720, args = [], log = true } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const dir = mkdtempSync(join(tmpdir(), 'h9-browser-'));
  const proc = spawn(browserPath(), [
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, headless ? '--headless=new' : '',
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required',
    `--window-size=${width},${height}`, ...args, 'about:blank'
  ].filter(Boolean), { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 150 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) throw new Error('The browser did not open a debugging port');
  const sock = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { sock.onopen = resolve; sock.onerror = reject; });

  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  sock.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else {
      for (const f of listeners) f(msg);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    sock.send(JSON.stringify({ id: i, method, params }));
  });

  const logs = [];
  listeners.add((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(`[${msg.params.type}] ${text}`);
      if (log) console.log(`  page ${msg.params.type}: ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      const text = d.exception?.description || d.text;
      logs.push('[exception] ' + text);
      if (log) console.log('  page exception: ' + text);
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');

  const page = {
    send,
    logs,
    on: (f) => listeners.add(f),
    async goto(url) {
      const loaded = new Promise((resolve) => {
        const f = (msg) => { if (msg.method === 'Page.loadEventFired') { listeners.delete(f); resolve(); } };
        listeners.add(f);
      });
      await send('Page.navigate', { url });
      await loaded;
    },
    async evaluate(expression, { timeout = 120000 } = {}) {
      const r = await Promise.race([
        send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
        sleep(timeout).then(() => { throw new Error('evaluate timed out: ' + expression.slice(0, 80)); })
      ]);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async screenshot() {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      return Buffer.from(r.data, 'base64');
    },
    async key(code, key = code) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: key === 'Enter' ? 13 : 0 });
    },
    async close() {
      try { sock.close(); } catch { /* */ }
      proc.kill();
      await sleep(500);
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* (the browser may still hold it) */ }
    }
  };
  return page;
}
