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

export function preloadVoices(level) {
  const pick = LEVEL[level];
  if (!pick) return;
  const urls = [];
  for (const [dir, keep] of Object.entries(pick)) {
    for (const f of voiceFiles[dir] || []) if (keep(f)) urls.push(DIR + dir + '/' + f);
  }
  preloadAudio(urls);
}
