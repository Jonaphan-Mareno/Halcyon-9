// Browser regression check for the actual Game, Level1 and KeypadUI modules. Run from the repo:
// node scripts/check-keypad-guards.mjs
// CHROME=/path/to/chrome selects a browser (see flashback1-photo/cdp.mjs).
import assert from 'node:assert/strict';
import { startVite, launchBrowser } from './flashback1-photo/cdp.mjs';

const vite = await startVite(5196);
let page;
try {
  page = await launchBrowser({ width: 640, height: 480, log: false,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
  await page.goto(vite.url + '?nointro');
  const results = await page.evaluate(`(async () => {
    const { Game } = await import('/src/Game.js');
    const { Level1 } = await import('/src/levels/Level1.js');
    const { KeypadUI } = await import('/src/ui/KeypadUI.js');
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const check = (condition, message) => { if (!condition) throw Error(message); };
    const passed = [];
    const fixture = (state = 'PLAYING', relaySolved = true) => {
      const game = Object.create(Game.prototype);
      const calls = { opened: 0, stopped: 0, hints: 0, toasts: [] };
      const keypad = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
      keypad.userData.maxInteractionDistance = 3.25;
      const level = Object.create(Level1.prototype);
      Object.assign(level, { keypad, maintenanceTag: null, relaySolved, keypadSeen: false,
        openElevatorDoor: () => calls.opened++,
        onLockedHint: () => calls.hints++,
        onUseKeypad: () => game.enterKeypadMode(keypad) });
      Object.assign(game, { state, currentLevel: level, camera: { instance: new THREE.PerspectiveCamera(75, 1) },
        controls: { stop: () => calls.stopped++, lock() {}, instance: { unlock() {}, enabled: true } },
        reticle: document.createElement('div'),
        ui: { setPrompt() {}, setWaypoint() {}, showToast: text => calls.toasts.push(text) },
        _keypadFailures: 0, _tagHintGiven: false,
        _hideCodeNote() {}, _prepareFlashback() {}, ariaSays: () => calls.hints++ });
      // Complete camera transitions immediately; retain the real entry/exit and keypad UI logic.
      game._startCamAnim = (_position, _quaternion, complete) => complete?.();
      game.keypadUI = new KeypadUI({ onSubmit: code => game.onKeypadSubmit(code), onCancel: () => game.exitKeypadMode() });
      return { game, level, keypad, calls, dispose() {
        game.keypadUI.root.remove();
        window.removeEventListener('keydown', game.keypadUI.onKeyDown);
        keypad.geometry.dispose(); keypad.material.dispose();
      } };
    };

    for (const state of ['PLAYING', 'KEYPAD', 'PUZZLE', 'PAUSED', 'GAME_OVER']) {
      const f = fixture(state, false);
      try {
        f.game.enterKeypadMode(f.keypad);
        f.game.onKeypadSubmit('441009');
        f.game.onKeypadSubmit('000000');
        check(f.calls.opened === 0 && f.calls.stopped === 0 && f.calls.hints === 0 && f.calls.toasts.length === 0,
          'Unsolved relay caused keypad side effects in ' + state);
        check(f.game.state === state && !f.level.keypadSeen && !f.game.keypadUI.isOpen && f.game._keypadFailures === 0,
          'Unsolved relay changed keypad state in ' + state);
        passed.push('Unsolved relay blocks entry and both code results in ' + state);
      } finally { f.dispose(); }
    }
    for (const state of ['PLAYING', 'PUZZLE', 'PAUSED', 'GAME_OVER']) {
      const f = fixture(state);
      try {
        f.game.onKeypadSubmit('441009');
        check(f.calls.opened === 0 && f.calls.toasts.length === 0 && f.game.state === state,
          'Submission accepted outside keypad mode: ' + state);
        passed.push('Submission ignored in ' + state);
      } finally { f.dispose(); }
    }
    {
      const f = fixture();
      try {
        f.level.onInteract(f.keypad);
        check(f.game.state === 'KEYPAD' && f.game.keypadUI.isOpen && f.level.keypadSeen, 'Valid interaction did not open keypad');
        f.game.keypadUI.value = '441009'; f.game.keypadUI.submit();
        check(f.calls.opened === 1 && f.game.state === 'PLAYING' && !f.game.keypadUI.isOpen, 'Valid code did not unlock and close keypad');
        passed.push('Solved relay allows normal keypad interaction and the correct code');
      } finally { f.dispose(); }
    }
    {
      const f = fixture();
      try {
        f.game.enterKeypadMode(f.keypad);
        f.game.keypadUI.value = '000000'; f.game.keypadUI.submit();
        check(f.calls.opened === 0 && f.game._keypadFailures === 1 && f.calls.hints === 1 && f.game.state === 'PLAYING',
          'Wrong-code feedback changed');
        passed.push('Wrong code still denies access and gives the existing hint');
      } finally { f.dispose(); }
    }
    {
      const f = fixture();
      try {
        f.game.enterKeypadMode(f.keypad); f.game.exitKeypadMode(); f.game.onKeypadSubmit('441009');
        check(f.calls.opened === 0, 'A late submission unlocked the door after cancellation');
        f.game.enterKeypadMode(f.keypad); f.level.relaySolved = false;
        f.game.keypadUI.value = '441009'; f.game.keypadUI.submit();
        check(f.calls.opened === 0, 'Submission did not recheck the relay prerequisite');
        passed.push('Cancelled submissions and invalidated prerequisites cannot unlock the elevator');
      } finally { f.dispose(); }
    }
    {
      const f = fixture('KEYPAD');
      try {
        f.game.currentLevel = null; f.game.onKeypadSubmit('441009');
        f.game.state = 'PLAYING'; f.game.enterKeypadMode(f.keypad);
        check(f.calls.opened === 0 && f.calls.stopped === 0, 'A stale callback accessed a missing level');
        passed.push('Missing-level callbacks are safely ignored');
      } finally { f.dispose(); }
    }
    return passed;
  })()`, { timeout: 30000 });
  assert.equal(results.length, 13);
  for (const result of results) console.log('PASS: ' + result);
} finally {
  if (page) await page.close();
  vite.close();
}
