import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { settings } from '../core/Settings.js';
import { CREDITS_HTML } from './credits.js';

// HALCYON-9's opening cinematic.
//
//   1. the page loads and a full-screen video of the station (intro.mp4: the sound is in the
//      video, there is no separate music file) fades in from black. (intro.mp4 is the first,
//      moody shot of the generated video, 4.5 s, cut before it changes to a brighter shot; the
//      whole video is kept as reference/intro-original.mp4.)
//   2. a few seconds in, at the music's drop, the title and then the subtitle fade in
//   3. near the end the title holds (the video plays out and stays on its last frame) with two
//      buttons under it: BEGIN, and CREDITS (CREDITS.md, on a panel over the title; Esc or Close
//      takes it away). Begin (or Enter) fades the picture, the titles and the sound to black.
//   4. a short black hold
//   5. the wake-up: the game (built during the black, so nothing heavy runs while the video plays)
//      is seen through Voss's eyes
//      opening, blinking, opening again, hazy and sharpening. This is a fragment shader added as
//      the last effect before FXAA in the game's post-processing chain, and it is taken out
//      again when it is done.
//   6. a beat later ARIA's first line is cued
//
// Space skips to step 3 (the buttons). It runs once per page load.
//
// Use (see main.js):
//   startIntro({
//     getComposer: () => game.renderer.composer,       // the game's EffectComposer, once it exists
//     whenGameReady: () => promise,                    // called once the screen is black: build the game,
//                                                      // and resolve when Level 1 has loaded
//     setGameRendering: (on) => {},                    // the game draws nothing until the waking shader is in place
//     onStarted: () => {},                             // the video is playing
//     onWakeStart: () => {}, onWakeEnd: () => {},      // the eyes start to open / the wake-up is over
//     onAriaCue: () => {},                             // time for ARIA's first line
//     onComplete: () => {},                            // everything is done and cleaned up
//     onFallback: () => {}                             // the video would not load: start the game normally
//   });
//
// Every timing is in INTRO_CONFIG, in seconds unless it says otherwise.

export const INTRO_CONFIG = {
  VIDEO_SRC: './assets/video/intro.mp4',

  // Hold everything behind a black screen with a Start button (a click is a user gesture, so
  // sound is certain). Off while we find out whether sound works without it.
  REQUIRE_CLICK_GATE: false,

  LOAD_TIMEOUT: 4.0,          // wait this long for the video (canplaythrough), then skip the cinematic
  VIDEO_FADE_IN: 0.8,         // the picture fades up from black

  MUSIC_DROP_TIME: 1.0,       // the title appears, this far into the video
  TITLE_FADE: 1.0,
  SUBTITLE_DELAY: 0.5,        // after the title starts to appear
  SUBTITLE_FADE: 0.8,
  TITLE_TEXT: 'HALCYON-9',
  SUBTITLE_TEXT: 'Deep Sea Research Station',
  TITLE_TOP: '7vh',           // how far down the title sits
  TITLE_SHIFT_X: '0vw',       // how far right of the centre (0: centred)

  FADE_START: null,           // when the buttons come up, in video seconds; null: duration minus FADE_OUT_BEFORE_END
  FADE_OUT_BEFORE_END: 1.5,
  FADE_OUT: 1.5,              // after Begin, the picture, titles and sound fade together over this long
  BLACK_HOLD: 0.6,            // then black, before the eyes open (longer while the game is still loading)
  SKIP_HINT_DELAY: 1.0,       // "Press Space to skip" (to the buttons) shows after this long

  GAME_READY_TIMEOUT: 20,     // wait this long (in black) for Level 1 to load before waking up anyway
  WARMUP_MAX: 3.0,            // then, still in black, let the game draw until its frames come smoothly (at most this long)
  WARMUP_FRAMES: 12,          // this many smooth frames in a row...
  WARMUP_FRAME_MS: 40,        // ...each under this many milliseconds

  // Fetched quietly while the video plays (network only, no work on the page), so the game's
  // files are already here when it is built in the black
  PREFETCH: [
    './assets/models/controlroom.glb',
    './assets/models/cell.glb',
    './assets/models/aria-head.glb',
    './assets/models/torch.glb',
    './assets/textures/aria_components/aria-idle.mp4',
    './assets/textures/screen_wear.jpg'
  ],

  // The wake-up: [time, how open the eyes are (0 black, 1 and over fully seen), haze (1 blurred and
  // grey, 0 sharp)]. Values between the keys are eased. Out of black a dim blur, back to black
  // (a blink), then up fully as the view sharpens.
  WAKE_KEYS: [
    [0.0, 0.00, 1.00],
    [0.5, 0.00, 1.00],
    [1.9, 0.34, 0.92],        // first opening, slow: a dim blur
    [2.6, 0.40, 0.88],
    [3.1, 0.00, 0.86],        // blink: black
    [3.5, 0.00, 0.84],
    [4.6, 0.85, 0.55],        // open again, more fully
    [5.2, 1.25, 0.30],        // wide open
    [6.2, 1.25, 0.00]         // sharp
  ],
  ARIA_DELAY: 1.0             // ARIA's line comes this long after the second opening is complete
};

let started = false;          // the cinematic runs once per page load

const STYLE = `
#hi-root { position: fixed; inset: 0; z-index: 100000; background: #000; overflow: hidden;
  font-family: 'Helvetica Neue', 'Segoe UI Light', 'Segoe UI', Arial, sans-serif; user-select: none; }
#hi-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; }
#hi-titles { position: absolute; left: 0; right: 0; top: var(--hi-top); text-align: center;
  transform: translateX(var(--hi-shift)); pointer-events: none; color: #eef5f3; }
#hi-title { font-weight: 200; font-size: clamp(1.8rem, 5.6vw, 6.4rem); letter-spacing: 0.5em; padding-left: 0.5em;
  text-shadow: 0 0 28px rgba(0, 229, 255, 0.38), 0 0 6px rgba(0, 229, 255, 0.28); opacity: 0; }
#hi-sub { margin-top: 0.9em; font-weight: 200; font-size: clamp(0.7rem, 1.45vw, 1.5rem); letter-spacing: 0.46em;
  padding-left: 0.46em; text-transform: uppercase; color: rgba(232, 244, 241, 0.8);
  text-shadow: 0 0 14px rgba(0, 229, 255, 0.25); opacity: 0; }
#hi-fade { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; }
.hi-hint { position: absolute; font-size: clamp(0.65rem, 0.95vw, 0.9rem); letter-spacing: 0.12em; color: #cfe8e6;
  opacity: 0; transition: opacity 0.8s ease; pointer-events: none; }
.hi-hint.on { opacity: 0.42; }
#hi-skip { right: 2.2vw; bottom: 2.6vh; }
#hi-sound { left: 50%; bottom: 2.6vh; transform: translateX(-50%); }
#hi-gate { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: #000; }
#hi-gate button { background: transparent; color: #cfe8e6; border: 1px solid rgba(207, 232, 230, 0.5); padding: 0.9rem 2.6rem;
  font: 200 clamp(1rem, 1.6vw, 1.5rem)/1 inherit; letter-spacing: 0.4em; cursor: pointer; }
#hi-gate button:hover { background: rgba(207, 232, 230, 0.12); }
#hi-menu { position: absolute; left: 0; right: 0; bottom: 14vh; display: flex; flex-direction: column;
  align-items: center; gap: 1.1rem; opacity: 0; transition: opacity 0.9s ease; pointer-events: none; }
#hi-menu.on { opacity: 1; pointer-events: auto; }
.hi-btn { min-width: 15rem; background: rgba(0, 0, 0, 0.25); color: #eef5f3; border: 1px solid rgba(207, 232, 230, 0.45);
  padding: 0.85rem 2.4rem; font: 200 clamp(0.95rem, 1.4vw, 1.3rem)/1 'Helvetica Neue', 'Segoe UI Light', 'Segoe UI', Arial, sans-serif;
  letter-spacing: 0.42em; padding-left: calc(2.4rem + 0.42em); cursor: pointer;
  text-shadow: 0 0 12px rgba(0, 229, 255, 0.3); transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease; }
.hi-btn:hover, .hi-btn:focus-visible { background: rgba(0, 229, 255, 0.1); border-color: rgba(0, 229, 255, 0.7);
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.25); outline: none; }
#hi-credits { position: absolute; inset: 0; display: none; background: rgba(2, 8, 12, 0.88); backdrop-filter: blur(3px); }
#hi-credits.on { display: block; }
#hi-credits-scroll { position: absolute; inset: 0; overflow-y: auto; padding: 5vh 16px 8vh; }
#hi-credits-body { max-width: 920px; margin: 0 auto; color: rgba(232, 244, 241, 0.86); font-size: 0.92rem;
  line-height: 1.55; letter-spacing: 0.02em; user-select: text; }
#hi-credits-body h1 { font-weight: 200; font-size: clamp(1.4rem, 3vw, 2.2rem); letter-spacing: 0.3em; color: #eef5f3;
  text-shadow: 0 0 18px rgba(0, 229, 255, 0.3); margin: 0 0 1.2rem; padding-right: 7rem; }
#hi-credits-body h2 { font-weight: 300; font-size: 1.15rem; letter-spacing: 0.14em; color: #9feaf5; margin: 2.2rem 0 0.6rem;
  padding-bottom: 0.35rem; border-bottom: 1px solid rgba(0, 229, 255, 0.2); }
#hi-credits-body p, #hi-credits-body ul { margin: 0.6rem 0; }
#hi-credits-body ul { padding-left: 1.3rem; }
#hi-credits-body a { color: #7fdcea; word-break: break-all; }
#hi-credits-body code { font-family: Consolas, monospace; font-size: 0.85em; color: #cfe8e6;
  background: rgba(255, 255, 255, 0.06); padding: 0 0.25em; word-break: break-all; }
.hi-table { overflow-x: auto; margin: 0.8rem 0; }
#hi-credits-body table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
#hi-credits-body th, #hi-credits-body td { text-align: left; vertical-align: top; padding: 0.45rem 0.7rem;
  border-bottom: 1px solid rgba(207, 232, 230, 0.12); }
#hi-credits-body th { font-weight: 400; color: #9feaf5; letter-spacing: 0.06em; }
#hi-credits-close { position: absolute; top: 2.4vh; right: max(16px, 2.4vw); min-width: 0; z-index: 1; background: rgba(2, 8, 12, 0.94); }
`;

// ---------------------------------------------------------------------------------------------
// The waking-eyes shader: a full-screen pass over the finished game frame.
//   uOpen  how open the eyes are: how much of the picture comes through (0 black; 0.9 and over all of it)
//   uHaze  1: heavily blurred, grey and narrowed; 0: the plain picture
// No lids are drawn: the picture comes up out of black, blurred, and goes back for a blink.
// ---------------------------------------------------------------------------------------------
export const EyeShader = {
  name: 'WakingEyesShader',
  uniforms: {
    tDiffuse: { value: null },
    uOpen: { value: 0 },
    uHaze: { value: 1 },
    uTime: { value: 0 },
    uAspect: { value: 1 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uOpen;
    uniform float uHaze;
    uniform float uTime;
    uniform float uAspect;
    varying vec2 vUv;

    // twelve taps on a spiral: a cheap, smooth disc blur
    vec3 blurred(vec2 uv, float radius) {
      vec3 sum = texture2D(tDiffuse, uv).rgb;
      float total = 1.0;
      for (int i = 1; i < 12; i++) {
        float fi = float(i);
        float a = fi * 2.39996;
        float r = radius * sqrt(fi / 12.0);
        vec2 off = vec2(cos(a) / uAspect, sin(a)) * r;
        float w = 1.0 - 0.5 * fi / 12.0;
        sum += texture2D(tDiffuse, uv + off).rgb * w;
        total += w;
      }
      return sum / total;
    }

    void main() {
      // the eyes are not still: the view drifts a little while it is hazy
      vec2 uv = vUv + uHaze * 0.005 * vec2(sin(uTime * 1.3), cos(uTime * 1.7));
      vec3 sharp = texture2D(tDiffuse, uv).rgb;
      vec3 col = sharp;
      float lum = dot(sharp, vec3(0.299, 0.587, 0.114));
      if (uHaze > 0.01) {
        vec3 soft = blurred(uv, uHaze * 0.03);
        col = soft;
        // a soft glow round the brightest parts only (the room as a whole stays as bright as it
        // is: the lighting must not jump while he wakes)
        float bl = dot(soft, vec3(0.299, 0.587, 0.114));
        col += soft * smoothstep(0.55, 1.0, bl) * 0.35 * uHaze;
        lum = dot(col, vec3(0.299, 0.587, 0.114));
        // washed out: the colour drains, the brightness does not change
        col = mix(vec3(lum), col, 1.0 - 0.7 * uHaze);
      }
      // tunnel vision, closing in when hazy (soft and colourless: no edge to see)
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float vig = smoothstep(1.05, 0.2, length(d) * (1.0 + 0.7 * uHaze));
      col *= mix(1.0, vig, 0.3 + 0.55 * uHaze);

      // how open the eyes are: how much of the picture comes through, out of black
      float seen = clamp(uOpen / 0.9, 0.0, 1.0);
      seen = seen * seen * (3.0 - 2.0 * seen);
      gl_FragColor = vec4(col * seen, 1.0);
    }`
};

// time -> [open, haze], eased between the keys
export function wakeAt(keys, t) {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const k = THREE.MathUtils.smoothstep((t - a[0]) / (b[0] - a[0]), 0, 1);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    }
  }
  const last = keys[keys.length - 1];
  return [last[1], last[2]];
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Runs fn every frame, and also on a slow timer: a hidden tab stops animation frames, but the
// video (and its sound) keeps going, so the timeline must not stall. Returns a stop function.
function drive(fn) {
  let on = true;
  let raf = 0;
  const frame = () => {
    if (!on) return;
    raf = requestAnimationFrame(frame);
    fn();
  };
  const timer = setInterval(() => { if (on) fn(); }, 200);
  frame();
  return () => {
    on = false;
    clearInterval(timer);
    cancelAnimationFrame(raf);
  };
}

// Starts the cinematic. Returns { done: Promise, skip() }, or null if it has already run.
export function startIntro(options = {}) {
  if (started) return null;
  started = true;
  const cfg = INTRO_CONFIG;
  const state = { skip: false, phase: 'loading', skipResolve: null };
  const api = {
    skip() { requestSkip(); },
    done: null
  };

  // ---- the elements and handlers, all removed at the end ----
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'hi-root';
  root.style.setProperty('--hi-top', cfg.TITLE_TOP);
  root.style.setProperty('--hi-shift', cfg.TITLE_SHIFT_X);
  const video = document.createElement('video');
  video.id = 'hi-video';
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = false;
  video.disablePictureInPicture = true;
  video.setAttribute('playsinline', '');
  const titles = document.createElement('div');
  titles.id = 'hi-titles';
  const title = document.createElement('div');
  title.id = 'hi-title';
  title.textContent = cfg.TITLE_TEXT;
  const sub = document.createElement('div');
  sub.id = 'hi-sub';
  sub.textContent = cfg.SUBTITLE_TEXT;
  titles.append(title, sub);
  const fade = document.createElement('div');
  fade.id = 'hi-fade';
  const skipHint = document.createElement('div');
  skipHint.id = 'hi-skip';
  skipHint.className = 'hi-hint';
  skipHint.textContent = 'Press Space to skip';
  const soundHint = document.createElement('div');
  soundHint.id = 'hi-sound';
  soundHint.className = 'hi-hint';
  soundHint.textContent = 'Click or press any key for sound';
  const menu = document.createElement('div');
  menu.id = 'hi-menu';
  const beginBtn = document.createElement('button');
  beginBtn.type = 'button';
  beginBtn.className = 'hi-btn';
  beginBtn.textContent = 'BEGIN';
  const creditsBtn = document.createElement('button');
  creditsBtn.type = 'button';
  creditsBtn.className = 'hi-btn';
  creditsBtn.textContent = 'CREDITS';
  menu.append(beginBtn, creditsBtn);
  const credits = document.createElement('div');
  credits.id = 'hi-credits';
  credits.setAttribute('role', 'dialog');
  credits.setAttribute('aria-label', 'Credits');
  credits.innerHTML = `<button type="button" class="hi-btn" id="hi-credits-close">CLOSE</button>
    <div id="hi-credits-scroll"><div id="hi-credits-body">${CREDITS_HTML}</div></div>`;
  const closeBtn = credits.querySelector('#hi-credits-close');
  root.append(video, titles, fade, menu, credits, skipHint, soundHint);
  document.body.appendChild(root);

  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  let eyePass = null;
  let composer = null;
  let unlocking = false;

  const volume = () => settings.get('music');
  function requestSkip() {
    if (state.phase === 'playing' || state.phase === 'loading') {
      state.skip = true;
      state.skipResolve?.();
    }
  }
  const openCredits = (on) => {
    credits.classList.toggle('on', on);
    (on ? closeBtn : creditsBtn).focus({ preventScroll: true });
  };
  creditsBtn.addEventListener('click', () => openCredits(true));
  closeBtn.addEventListener('click', () => openCredits(false));
  const onKey = (e) => {
    if (e.code === 'Space' && state.phase !== 'menu') {
      e.preventDefault();
      requestSkip();
    }
    // on the buttons: Esc closes the credits, Enter begins (unless it is on another button)
    if (state.phase === 'menu') {
      if (e.code === 'Escape' && credits.classList.contains('on')) openCredits(false);
      else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !credits.classList.contains('on') &&
               document.activeElement !== creditsBtn) {
        e.preventDefault();
        beginBtn.click();
      }
    }
  };
  // the first click or key unmutes a video that had to start silent
  const unlock = () => {
    if (!unlocking) return;
    unlocking = false;
    video.muted = false;
    video.volume = Math.max(0, Math.min(1, volume() * state.fadeGain));
    soundHint.classList.remove('on');
    console.log('[intro] sound enabled by the first click or key');
    if (video.paused && !video.ended) video.play().catch(() => {});
  };
  state.fadeGain = 1;
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  function cleanup() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    video.pause();
    video.removeAttribute('src');
    video.src = '';
    video.load();
    root.remove();
    style.remove();
    options.setGameRendering?.(true);
    if (eyePass && composer) {
      composer.removePass(eyePass);
      eyePass.dispose();                // its material and full-screen quad
      eyePass = null;
    }
  }

  async function run() {
    // ---- loading: wait for canplaythrough, but never hang the game ----
    video.src = cfg.VIDEO_SRC;
    video.load();
    const loaded = await new Promise((resolve) => {
      let finished = false;
      const end = (ok) => { if (!finished) { finished = true; resolve(ok); } };
      if (video.readyState >= 4) return end(true);
      video.addEventListener('canplaythrough', () => end(true), { once: true });
      video.addEventListener('error', () => end(false), { once: true });
      later(() => end(false), cfg.LOAD_TIMEOUT * 1000);
    });
    if (!loaded) {
      console.warn('[intro] the video did not load in time; skipping the cinematic');
      cleanup();
      options.onFallback?.();
      return 'failed';
    }

    if (cfg.REQUIRE_CLICK_GATE) {
      const gate = document.createElement('div');
      gate.id = 'hi-gate';
      gate.innerHTML = '<button type="button">START</button>';
      root.appendChild(gate);
      await new Promise((resolve) => gate.querySelector('button').addEventListener('click', resolve, { once: true }));
      gate.remove();
    }

    // ---- play, with sound if the browser lets us ----
    video.volume = volume();
    let sound = true;
    try {
      await video.play();
    } catch (e) {
      sound = false;
      video.muted = true;
      try {
        await video.play();
      } catch (e2) {
        console.warn('[intro] the video would not play at all; skipping the cinematic');
        cleanup();
        options.onFallback?.();
        return 'failed';
      }
    }
    if (sound) {
      console.log('[intro] audio started');
    } else {
      console.warn('[intro] audio blocked by the browser: playing muted until the first click or key');
      unlocking = true;
      soundHint.classList.add('on');
    }
    state.phase = 'playing';
    options.onStarted?.();
    for (const url of cfg.PREFETCH) {
      try { fetch(url, { priority: 'low' }).then((r) => r.blob()).catch(() => {}); } catch (e) { /* only a head start */ }
    }
    video.style.transition = `opacity ${cfg.VIDEO_FADE_IN}s ease`;
    requestAnimationFrame(() => { video.style.opacity = '1'; });
    later(() => { if (state.phase === 'playing') skipHint.classList.add('on'); }, cfg.SKIP_HINT_DELAY * 1000);

    // ---- the timeline, read from the video's own clock so it stays with the picture ----
    const duration = isFinite(video.duration) ? video.duration : 10;
    const fadeStart = cfg.FADE_START ?? Math.max(0, duration - cfg.FADE_OUT_BEFORE_END);
    let titleShown = false, stopDrive = () => {};
    // After Begin the picture and titles fade under a black layer animated by CSS (smooth even if
    // the page is busy); the sound follows it down
    const fadeTo = (seconds) => {
      fade.style.transition = `opacity ${seconds}s linear`;
      fade.style.opacity = '1';
    };
    const setSound = (p) => {
      state.fadeGain = 1 - p;
      if (!unlocking) video.volume = Math.max(0, Math.min(1, volume() * state.fadeGain));
    };

    await new Promise((resolve) => {
      state.skipResolve = resolve;
      const tick = () => {
        if (state.skip) return resolve();
        const t = video.currentTime;
        if (!titleShown && t >= cfg.MUSIC_DROP_TIME) {
          titleShown = true;
          title.style.transition = `opacity ${cfg.TITLE_FADE}s ease`;
          title.style.opacity = '1';
          later(() => {
            sub.style.transition = `opacity ${cfg.SUBTITLE_FADE}s ease`;
            sub.style.opacity = '1';
          }, cfg.SUBTITLE_DELAY * 1000);
        }
        if (t >= fadeStart || video.ended) resolve();
      };
      stopDrive = drive(tick);
    });
    stopDrive();

    // ---- the title holds, with BEGIN and CREDITS under it (the video plays out and stays on its
    // last frame). If Space got here early, the titles come up at once ----
    state.phase = 'menu';
    skipHint.classList.remove('on');
    if (state.skip) {
      for (const el of [title, sub]) {
        el.style.transition = 'opacity 0.4s ease';
        el.style.opacity = '1';
      }
    }
    menu.classList.add('on');
    beginBtn.focus({ preventScroll: true });
    await new Promise((resolve) => beginBtn.addEventListener('click', resolve, { once: true }));
    menu.classList.remove('on');

    // ---- Begin: the picture, the titles and the sound fade to black together ----
    soundHint.classList.remove('on');
    fadeTo(cfg.FADE_OUT);
    const fadeT0 = performance.now();
    await new Promise((resolve) => {
      const stop = drive(() => {
        const p = Math.min(1, (performance.now() - fadeT0) / (cfg.FADE_OUT * 1000));
        setSound(p);
        if (p >= 1) { stop(); resolve(); }
      });
    });
    state.phase = 'black';
    unlocking = false;
    video.pause();
    video.style.display = 'none';
    titles.style.display = 'none';
    soundHint.classList.remove('on');

    // ---- black: the game is built now (at least BLACK_HOLD long, longer if it needs it) ----
    const gameReady = options.whenGameReady
      ? Promise.race([Promise.resolve().then(() => options.whenGameReady()).catch(() => {}), wait(cfg.GAME_READY_TIMEOUT * 1000)])
      : Promise.resolve();
    await Promise.all([wait(cfg.BLACK_HOLD * 1000), gameReady]);

    // ---- the wake-up: the waking-eyes pass goes on before the black cover comes off ----
    composer = options.getComposer?.() || null;
    const keys = cfg.WAKE_KEYS;
    const end = keys[keys.length - 1][0];
    const openAt = (keys.find((k) => k[1] >= 1) || keys[keys.length - 1])[0];   // the second opening is complete
    const cueAt = openAt + cfg.ARIA_DELAY;
    if (composer) {
      eyePass = new ShaderPass(EyeShader);
      eyePass.uniforms.uOpen.value = 0;
      eyePass.uniforms.uHaze.value = 1;
      composer.insertPass(eyePass, Math.max(0, composer.passes.length - 1));     // before FXAA
    }
    // Still in black: let the game draw (the first frames compile its shaders and upload its
    // textures, which stalls) until its frames come smoothly, so the eyes open on a smooth picture
    options.setGameRendering?.(true);
    await new Promise((resolve) => {
      let last = performance.now(), smooth = 0;
      const start = last;
      const frame = () => {
        const now = performance.now();
        smooth = now - last < cfg.WARMUP_FRAME_MS ? smooth + 1 : 0;
        last = now;
        if (smooth >= cfg.WARMUP_FRAMES || now - start > cfg.WARMUP_MAX * 1000) return resolve();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      later(resolve, (cfg.WARMUP_MAX + 0.5) * 1000);     // (a hidden tab draws no frames)
    });
    state.phase = 'wake';
    options.onWakeStart?.();
    if (!composer) {
      // (no post-processing to put the shader in: just fade the cover away)
      root.style.transition = 'opacity 1.5s ease';
      root.style.opacity = '0';
      await wait(1500);
    } else {
      root.style.display = 'none';
    }
    const t0 = performance.now();
    let wakeEnded = false, cued = false;
    await new Promise((resolve) => {
      const step = () => {
        if (wakeEnded && cued) return;
        const t = (performance.now() - t0) / 1000;
        if (eyePass) {
          const [open, haze] = wakeAt(keys, t);
          const u = eyePass.uniforms;
          u.uOpen.value = open;
          u.uHaze.value = haze;
          u.uTime.value = t;
          u.uAspect.value = window.innerWidth / Math.max(1, window.innerHeight);
        }
        if (!wakeEnded && t >= end) {
          wakeEnded = true;
          options.onWakeEnd?.();
        }
        if (!cued && t >= cueAt) {
          cued = true;
          options.onAriaCue?.();
        }
        if (wakeEnded && cued) { stop(); resolve(); }
      };
      const stop = drive(step);
    });
    return 'played';
  }

  api.done = run().then((result) => {
    cleanup();
    if (result === 'played') options.onComplete?.();
    return result;
  }).catch((e) => {
    console.error('[intro] the cinematic failed; starting the game normally', e);
    cleanup();
    options.onFallback?.();
    return 'failed';
  });
  return api;
}
