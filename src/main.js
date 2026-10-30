import * as THREE from 'three';
import { Game } from './Game.js';
import { startIntro } from './intro/intro-cinematic.js';
import { createOpeningSettings } from './ui/OpeningSettings.js';
import { createDifficultyPicker } from './ui/DifficultyPicker.js';
import { EndingNarration } from './level3/EndingNarration.js';
import { showEndCredits } from './ui/EndCredits.js';
import './ui/opening-settings.css';
import './style.css';

// Entry point for Halcyon-9
const params = new URLSearchParams(window.location.search);
// ?voss-anim (dev only): the preview of Voss's acting clips (src/dev/voss-anim-preview.js) instead of the game
const vossAnim = import.meta.env.DEV && params.has('voss-anim');
if (vossAnim) import('./dev/voss-anim-preview.js').then((m) => m.startVossAnimPreview());

// ?ending=narration: only the narration of the Save-ARIA ending and the credits after it
// (level3/EndingNarration.js, ui/EndCredits.js), instead of the game; a click starts it (the
// browser wants one before it plays sound)
const narrationOnly = params.get('ending') === 'narration';
if (narrationOnly) {
  document.getElementById('welcome-screen')?.remove();
  const n = new EndingNarration(document.body);
  const loading = n.preload();
  const gate = document.createElement('div');
  gate.style.cssText = 'position:fixed;inset:0;z-index:80;background:#000;color:#cfefff;display:flex;align-items:center;justify-content:center;font:200 1.1rem sans-serif;letter-spacing:.3em;cursor:pointer';
  gate.textContent = 'CLICK TO PLAY THE NARRATION';
  document.body.appendChild(gate);
  gate.addEventListener('click', async () => {
    gate.remove();
    await loading;
    await n.play();
    n.dispose();
    await showEndCredits(document.body);
    window.location.href = window.location.pathname;
  }, { once: true });
}

const game = vossAnim || narrationOnly ? null : new Game();
if (import.meta.env.DEV) window.__game = game;   // for poking at from the dev console

// The opening cinematic plays as soon as the page loads, with no menu. It is skipped for the
// test links (?level=2, ?level=3, ?flashback1...) and with ?nointro, which keep the old start screen.
const classic = params.has('level') || params.has('nointro') || params.has('flashback1') || params.has('keypad');

// The old start screen: a WAKE UP button, whose click starts the game and takes the mouse
function setUpStartScreen() {
  document.documentElement.classList.remove('cine');
  const startBtn = document.getElementById('start-btn');
  const welcomeScreen = document.getElementById('welcome-screen');
  const welcomeContent = document.getElementById('welcome-content');

  if (startBtn && welcomeScreen && welcomeContent) {
    const openingSettings = createOpeningSettings(document.body, 'opening-options-btn');
    const difficultyPicker = createDifficultyPicker();
    welcomeContent.insertBefore(difficultyPicker.element, startBtn);
    welcomeContent.appendChild(openingSettings.button);

    // Preload the background image to prevent Flash of Unstyled Content (FOUC)
    const bgImg = new Image();
    bgImg.src = './assets/textures/bunker_bg.jpg';

    bgImg.onload = () => {
      // Once the large image is loaded, fade in the text content
      welcomeContent.style.opacity = '1';
    };

    startBtn.addEventListener('click', () => {
      openingSettings.dispose();
      difficultyPicker.dispose();
      // Fade out welcome screen
      welcomeScreen.style.opacity = '0';

      // We MUST initialize and request pointer lock synchronously!
      // Browsers block pointer lock if it's called inside a setTimeout
      game.init();
      game.lockControls();

      // After fade transition, hide the UI overlay entirely
      setTimeout(() => {
        welcomeScreen.style.display = 'none';
      }, 1500); // 1.5s matches CSS transition
    });
  } else {
    // Fallback if UI is missing
    game.init();
  }
}

if (vossAnim || narrationOnly) {
  // (nothing else starts)
} else if (classic) {
  setUpStartScreen();
} else {
  // The game is built once the screen has gone black after the video (building it stalls the page,
  // which would make the video stutter) and the wake-up waits for it.
  let begun = false;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const begin = () => {
    if (begun) return;
    begun = true;
    try {
      resolveReady(game.beginOpening());
    } catch (e) {
      console.error('The game failed to start behind the cinematic.', e);
      resolveReady();
    }
  };

  startIntro({
    getComposer: () => game.renderer?.composer,
    whenGameReady: () => { begin(); return ready; },
    setGameRendering: (on) => { game.renderHeld = !on; },
    onWakeEnd: () => game.endOpeningWake(),
    onAriaCue: () => game.openingAriaLine(),
    // The video would not load or play: start the game normally
    onFallback: () => {
      if (begun) game.endOpeningWake();     // (it was already running behind the cinematic)
      else setUpStartScreen();
    }
  });
}
