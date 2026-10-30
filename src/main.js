import * as THREE from 'three';
import { Game } from './Game.js';
import { startIntro } from './intro/intro-cinematic.js';
import { createOpeningSettings } from './ui/OpeningSettings.js';
import { createDifficultyPicker } from './ui/DifficultyPicker.js';
import './ui/opening-settings.css';
import './style.css';

// Entry point for Halcyon-9
const game = new Game();
if (import.meta.env.DEV) window.__game = game;   // for poking at from the dev console

const params = new URLSearchParams(window.location.search);
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

if (classic) {
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
