import voiceFiles from 'virtual:voice-files';

// Recorded sound fetched ahead of time, into memory. The lines (ARIA, Voss, the logs) are played
// with new Audio(url) the moment they are needed; from a web server that means a fresh request
// each time, which waits behind whatever the level is still downloading, so the voice came in
// late (it did on the school's server). preloadAudio() fetches them while the level loads and
// keeps each as a blob: URL; audioSrc(url) hands that back, so playing a line needs no network.
// Anything not fetched yet is played from its own URL, as before.
//
//   preloadVoices(level)    a level's lines: 1, 2 or 3
//   preloadAudio(urls)      any other files (the hatch's sounds)
//   audioSrc(url)           what to give new Audio()

const ready = new Map();      // url -> blob: URL, once fetched
const queued = new Set();
const queue = [];
const AT_ONCE = 2;            // fetches in flight: the browser has about 6 connections to a server,
let running = 0;              // and the level's models need the rest

export function audioSrc(url) {
  return ready.get(url) || url;
}

export function preloadAudio(urls) {
  for (const url of urls) {
    if (queued.has(url)) continue;
    queued.add(url);
    queue.push(url);
  }
  pump();
}

function pump() {
  while (running < AT_ONCE && queue.length) {
    const url = queue.shift();
    running++;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => { if (blob) ready.set(url, URL.createObjectURL(blob)); })
      .catch(() => {})                       // (a missing line still plays as text, as before)
      .finally(() => { running--; pump(); });
  }
}

// Which recordings belong to which level, by their names: ARIA's l2-/l3 lines and the logs are
// Levels 2 and 3; Voss's v- lines are spoken in both; the rest (the intro, the puzzles) are Level 1's
const DIR = './assets/audio/';
const LEVEL = {
  1: { aria: (f) => !/^l[23]/.test(f), voss: (f) => f.startsWith('intro-'), logs: () => false },
  2: { aria: (f) => f.startsWith('l2'), voss: (f) => f.startsWith('l2') || f.startsWith('v-'), logs: () => true },
  3: { aria: (f) => f.startsWith('l3'), voss: (f) => f.startsWith('v-'), logs: () => false }
};

// The team's own sound effects (free, from Pixabay; in public/assets/audio/sound-effects/)
export const CLIPS = {
  splash: DIR + 'sound-effects/universfield-water-splash-199583.mp3',          // dropping into Level 3's water
  wade: DIR + 'sound-effects/shakil10000-walking-in-the-water-3-234728.mp3',  // walking through it
  metalHit: DIR + 'sound-effects/floraphonic-metal-hit-12-193278.mp3',        // a hit in the chute
  glass: DIR + 'sound-effects/universfield-broken-glass-impact-454859.mp3',   // the brick through the window
  button: DIR + 'sound-effects/emilianodleon-button-ui-sound-effect-395762.mp3', // a keypad's keys
  hatch: DIR + 'sound-effects/hatch-opening.mp3',                       // Level 2's hatch lid landing open
  krakenScream: DIR + 'sound-effects/kraken-screaming.mp3',             // many voices, over the kraken's screams
  cellDoor: DIR + 'sound-effects/opening-cell-door.mp3',                // Level 1's cell door
  flicker: DIR + 'sound-effects/freesound_community-lights-flicker-on-and-some-electrical-noises-33079.mp3', // its dying lights
  paper: DIR + 'sound-effects/floraphonic-paper-collect-7-186721.mp3',  // picking up or looking at paper, a photo
  tech: DIR + 'sound-effects/button-press-tech.mp3',                    // pressing a machine's button: a log, a terminal, a panel
  ding: DIR + 'sound-effects/frigginmouse-ding-dong-new-267803.mp3'     // the lift's doors opening or closing
};

// One of them looped without a gap (through Web Audio, so a quiet recording can be turned up past
// full): returns { stop(fade), pause(), resume() }. Nothing plays until it has loaded.
let loopCtx = null;
export function loopClip(url, gain = 1) {
  loopCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  const ctx = loopCtx;
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);
  let src = null, stopped = false;
  fetch(audioSrc(url)).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((buf) => {
    if (stopped) return;
    src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(out);
    src.start();
    out.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
  }).catch(() => {});
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return {
    stop(fade = 1.5) {
      stopped = true;
      out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      setTimeout(() => { try { src?.stop(); } catch { /* not started */ } out.disconnect(); }, fade * 1000 + 200);
    },
    pause() { out.gain.setTargetAtTime(0, ctx.currentTime, 0.05); },
    resume() { if (!stopped) out.gain.setTargetAtTime(gain, ctx.currentTime, 0.2); }
  };
}

// One of them, played once (a fresh copy each time, so quick repeats overlap)
export function playClip(url, volume = 1) {
  const a = new Audio(audioSrc(url));
  a.volume = Math.max(0, Math.min(1, volume));
  a.play().catch(() => {});
  return a;
}

export function preloadVoices(level) {
  const pick = LEVEL[level];
  if (!pick) return;
  const urls = [];
  for (const [dir, keep] of Object.entries(pick)) {
    for (const f of voiceFiles[dir] || []) if (keep(f)) urls.push(DIR + dir + '/' + f);
  }
  preloadAudio(urls);
}
