import { settings } from '../core/Settings.js';

// The prologue: a piece of Voss's past, before he wakes in the cell (see
// docs/story-delivery-01-prologue-polaroids.md). It plays in the opening cinematic's black, after
// BEGIN and before the eyes open.
//
//   1. six Polaroids, one at a time: a camera shutter (and a flash), then the photo drops onto the
//      screen, develops, and is voiced. The first four are Mom's, over a bittersweet music box; the
//      music ends with the fourth and the last two are Voss's, over a low, ominous drone.
//   2. black and silence
//   3. the last day, in the dark: Mom, Voss, Mom, Voss, with subtitles
//
// Everything is played through Web Audio. Each recording is levelled to the same loudness as it
// loads (Voss's takes were recorded quieter than his mother's), so no file needs re-exporting.
// The music is played from public/assets/audio/music/prologue.mp3 if there is one; otherwise a
// music box is synthesised here. Enter skips it all.
//
// Use (see intro-cinematic.js):
//   preloadPrologue()                         fetch the photos and the recordings (while the video plays)
//   const p = playPrologue(root, { before, onDialogue })
//   await p.done; p.skip()

const AUDIO = './assets/audio/lvl1-mom&voss/';
const PHOTOS = './assets/textures/prologue/';
const MUSIC_FILE = './assets/audio/music/prologue.mp3';

// The montage: photo, recording, subtitle. The first four are Mom's and have the music under them
export const PROLOGUE_PHOTOS = [
  { photo: 'photo1', clip: 'my_little_voss', speaker: 'mom', text: 'My little Voss.', tilt: -4 },
  { photo: 'photo2', clip: 'explorer', speaker: 'mom', text: 'He wants to be an explorer.', tilt: 3 },
  { photo: 'photo3', clip: 'top', speaker: 'mom', text: "He's top of the class again.", tilt: -2 },
  { photo: 'photo4', clip: 'doctor', speaker: 'mom', text: 'My Dr. Voss!', tilt: 4 },
  { photo: 'photo5', clip: 'mom_keeps_falling', speaker: 'voss', text: 'Mom keeps falling...', tilt: -6 },
  { photo: 'photo6', clip: 'mom_keep_forgetting', speaker: 'voss', text: 'Mom keeps forgetting...', tilt: 1 }
];
const MUSIC_PHOTOS = 4;

// The last day, over black. pause: the silence before the line, in seconds. cutAt: the next line
// cuts in this many seconds into the recording, and this one is faded out under it
export const PROLOGUE_DIALOGUE = [
  { clip: 'mom1', speaker: 'mom', text: 'Voss, are you going to school already?', pause: 0 },
  { clip: 'voss1', speaker: 'voss', text: "Mom, I'm 25—", pause: 0.6, cutAt: 2.0 },
  { clip: 'mom2', speaker: 'mom', text: 'My legs, ah! <i>[falls]</i>', pause: 0 },
  { clip: 'voss2', speaker: 'voss', text: "Mom! No, not again... it's been happening every day lately.<br>I'll save you, Mom. I'll save you.", pause: 0.5 }
];

export const PROLOGUE_CONFIG = {
  LEAD_IN: 0.8,             // black before the music
  MUSIC_LEAD: 1.4,          // the music plays alone this long before the first shutter
  FLASH: 0.4,               // the shutter's flash fades over this long
  DROP: 0.7,                // the photo's fall onto the screen
  DEVELOP: 1.8,             // pale and milky to full colour
  HOLD: 3.0,                // each photo stays at least this long after it lands...
  AFTER_VOICE: 0.4,         // ...and at least this long after its line ends
  EXIT: 0.5,                // the photo slides away
  MUSIC_FADE: 1.6,          // the music fades as the fourth photo leaves, and the drone comes in
  DREAD_FADE: 2.0,          // the drone fades as the last photo leaves
  SILENCE: 2.0,             // black and silence before the last day (longer while the game is still building)
  SILENCE_MAX: 15,          // but no longer than this
  END_HOLD: 1.6,            // black after Voss's last line
  ASSET_WAIT: 8,            // wait this long for the photos and recordings, then play what there is

  VOICE_LOUDNESS: -21,      // dB (RMS of the spoken part): every recording is levelled to this
  MAX_BOOST: 4,             // at most x4 (+12 dB)
  MUSIC_VOLUME: 0.32,       // under the voices
  SFX_VOLUME: 0.8,
  READ_SECONDS_PER_CHAR: 0.06   // a line whose recording would not load is shown this long
};

const STYLE = `
#pl-root { position: absolute; inset: 0; background: #000; overflow: hidden; pointer-events: none;
  --pl-w: min(78vw, calc(72vh * 940 / 1090)); }
#pl-root .pl-photo { position: absolute; left: 50%; top: 46%; width: var(--pl-w); aspect-ratio: 940 / 1090;
  transform: translate(-50%, -50%) rotate(var(--pl-tilt)); box-shadow: 0 18px 50px rgba(0, 0, 0, 0.75), 0 3px 8px rgba(0, 0, 0, 0.6); }
#pl-root .pl-photo img { display: block; width: 100%; height: 100%; }
#pl-root .pl-photo.drop { animation: pl-drop var(--pl-drop) cubic-bezier(0.3, 0.9, 0.35, 1.08) both; }
#pl-root .pl-photo.drop img { animation: pl-develop var(--pl-develop) ease-out both; }
#pl-root .pl-photo.exit { transition: transform var(--pl-exit) ease-in, opacity var(--pl-exit) ease-in;
  transform: translate(-50%, 30%) rotate(calc(var(--pl-tilt) * 3)); opacity: 0; }
@keyframes pl-drop {
  from { transform: translate(-50%, -135%) rotate(calc(var(--pl-tilt) * -2.5)) scale(1.12); opacity: 0; }
  35% { opacity: 1; }
  to { transform: translate(-50%, -50%) rotate(var(--pl-tilt)) scale(1); opacity: 1; }
}
@keyframes pl-develop {
  from { filter: sepia(0.5) brightness(1.7) contrast(0.35) saturate(0.2); }
  to { filter: none; }
}
#pl-flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
#pl-sub { position: absolute; left: 16px; right: 16px; bottom: 7vh; text-align: center; opacity: 0;
  transition: opacity 0.35s ease; font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif;
  font-size: clamp(0.95rem, 1.7vw, 1.45rem); line-height: 1.45; color: #f2f2ee; text-shadow: 0 2px 6px #000, 0 0 2px #000; }
#pl-sub.on { opacity: 1; }
#pl-sub b { font-weight: 600; letter-spacing: 0.14em; font-size: 0.78em; margin-right: 0.6em; }
#pl-sub b.mom { color: #f3c99b; }
#pl-sub b.voss { color: #9feaf5; }
@media (prefers-reduced-motion: reduce) {
  #pl-root .pl-photo.drop { animation-name: pl-fade; }
  #pl-root .pl-photo.exit { transform: translate(-50%, -50%) rotate(var(--pl-tilt)); }
  @keyframes pl-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;

const SPEAKER = { mom: 'MOM', voss: 'VOSS' };

// ---- loading (once per page) ----
let ctx = null;
let loading = null;
const buffers = new Map();    // clip -> { buffer, gain }
const images = new Map();     // photo -> HTMLImageElement
let musicBuffer = null;

function audioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = AC ? new AC() : null;
  }
  return ctx;
}

// The gain that brings a recording to VOICE_LOUDNESS: the RMS of its spoken part (the 1024-sample
// blocks louder than 5% of the loudest), held back so its peaks stay under full scale
function levelling(buffer) {
  const n = buffer.length;
  const mix = new Float32Array(n);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) mix[i] += d[i] / buffer.numberOfChannels;
  }
  let peak = 0;
  const blocks = [];
  for (let i = 0; i + 1024 <= n; i += 1024) {
    let s = 0;
    for (let j = i; j < i + 1024; j++) { s += mix[j] * mix[j]; peak = Math.max(peak, Math.abs(mix[j])); }
    blocks.push(Math.sqrt(s / 1024));
  }
  const loudest = Math.max(0, ...blocks);
  const spoken = blocks.filter((b) => b > loudest * 0.05);
  if (!spoken.length || peak === 0) return 1;
  const rms = Math.sqrt(spoken.reduce((a, b) => a + b * b, 0) / spoken.length);
  const want = Math.pow(10, PROLOGUE_CONFIG.VOICE_LOUDNESS / 20) / rms;
  return Math.min(want, 0.95 / peak, PROLOGUE_CONFIG.MAX_BOOST);
}

async function loadClip(clip) {
  const ac = audioContext();
  if (!ac) return;
  const r = await fetch(AUDIO + clip + '.mp3');
  if (!r.ok) return;
  const buffer = await ac.decodeAudioData(await r.arrayBuffer());
  buffers.set(clip, { buffer, gain: levelling(buffer) });
}

function loadImage(photo) {
  const img = new Image();
  img.decoding = 'async';
  img.src = PHOTOS + photo + '.webp';
  return img.decode().then(() => { images.set(photo, img); });
}

export function preloadPrologue() {
  if (loading) return loading;
  const clips = [...PROLOGUE_PHOTOS, ...PROLOGUE_DIALOGUE].map((l) => l.clip);
  const music = fetch(MUSIC_FILE)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => (b && audioContext() ? audioContext().decodeAudioData(b) : null))
    .then((b) => { musicBuffer = b; })
    .catch(() => {});                     // (no file, or not audio: the music box is synthesised)
  loading = Promise.all([
    ...clips.map((c) => loadClip(c).catch(() => {})),       // (a missing line is shown as text only)
    ...PROLOGUE_PHOTOS.map((p) => loadImage(p.photo).catch(() => {})),
    music
  ]);
  return loading;
}

// ---- sound ----

// A burst of white noise, length seconds long
function noise(ac, length) {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst(ac, out, at, { length, type, freq, q = 1, gain }) {
  const src = ac.createBufferSource();
  src.buffer = noise(ac, length);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + length);
  src.connect(f).connect(g).connect(out);
  src.start(at);
}

// An instant camera: the shutter's two clicks with a thunk under them, then the motor pushing the print out
function shutterSound(ac, out) {
  const t = ac.currentTime + 0.01;
  burst(ac, out, t, { length: 0.018, type: 'highpass', freq: 2500, gain: 0.9 });
  burst(ac, out, t + 0.01, { length: 0.07, type: 'bandpass', freq: 1300, q: 2.5, gain: 0.25 });
  burst(ac, out, t + 0.085, { length: 0.022, type: 'highpass', freq: 1800, gain: 0.6 });
  const thunk = ac.createOscillator();
  const tg = ac.createGain();
  thunk.frequency.setValueAtTime(150, t);
  thunk.frequency.exponentialRampToValueAtTime(55, t + 0.06);
  tg.gain.setValueAtTime(0.5, t);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  thunk.connect(tg).connect(out);
  thunk.start(t);
  thunk.stop(t + 0.1);
  // the motor
  const m = ac.createOscillator();
  m.type = 'sawtooth';
  m.frequency.setValueAtTime(95, t + 0.16);
  m.frequency.linearRampToValueAtTime(80, t + 0.7);
  const mf = ac.createBiquadFilter();
  mf.type = 'bandpass';
  mf.frequency.value = 700;
  mf.Q.value = 1.5;
  const mg = ac.createGain();
  mg.gain.setValueAtTime(0, t + 0.16);
  mg.gain.linearRampToValueAtTime(0.12, t + 0.22);
  mg.gain.setValueAtTime(0.12, t + 0.62);
  mg.gain.linearRampToValueAtTime(0, t + 0.72);
  m.connect(mf).connect(mg).connect(out);
  m.start(t + 0.16);
  m.stop(t + 0.75);
}

// The print landing
function landSound(ac, out) {
  burst(ac, out, ac.currentTime + 0.01, { length: 0.07, type: 'lowpass', freq: 1800, gain: 0.18 });
}

// A soft reverb: decaying noise as the room
function reverb(ac, seconds = 2.4) {
  const conv = ac.createConvolver();
  const len = Math.ceil(ac.sampleRate * seconds);
  const b = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  conv.buffer = b;
  return conv;
}

// The music box: a slow waltz in C, warm with a little ache (I, vi, IV, V). Notes are MIDI numbers;
// each melody note is [note, beats]
const BEAT = 60 / 84;
const BARS = [
  { chord: [48, 52, 55], melody: [[76, 2], [79, 1]] },              // C
  { chord: [45, 48, 52], melody: [[84, 1.5], [83, 0.5], [81, 1]] }, // Am
  { chord: [41, 45, 48], melody: [[81, 2], [79, 0.5], [77, 0.5]] }, // F
  { chord: [43, 47, 50], melody: [[79, 1], [77, 1], [74, 1]] },     // G
  { chord: [48, 52, 55], melody: [[76, 1], [79, 1], [84, 1]] },     // C
  { chord: [45, 48, 52], melody: [[88, 1.5], [86, 0.5], [84, 1]] }, // Am
  { chord: [38, 41, 45], melody: [[81, 1], [77, 1], [86, 1]] },     // Dm
  { chord: [43, 47, 50], melody: [[83, 1.5], [81, 0.5], [79, 1]] }  // G
];
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

function tine(ac, out, at, midi, gain, decay) {
  for (const [mult, g] of [[1, 1], [2, 0.22], [3.01, 0.07]]) {
    const o = ac.createOscillator();
    o.frequency.value = hz(midi) * mult;
    const e = ac.createGain();
    e.gain.setValueAtTime(0, at);
    e.gain.linearRampToValueAtTime(gain * g, at + 0.005);
    e.gain.setTargetAtTime(0, at + 0.005, decay / mult);
    o.connect(e).connect(out);
    o.start(at);
    o.stop(at + decay * 5);
  }
}

export function synthMusic(ac, out, loops = 3) {
  const t0 = ac.currentTime + 0.05;
  const bar = BEAT * 3;
  for (let l = 0; l < loops; l++) {
    BARS.forEach((b, i) => {
      const at = t0 + (l * BARS.length + i) * bar;
      tine(ac, out, at, b.chord[0], 0.22, 0.9);                       // the bass, on the one
      for (const beat of [1, 2]) {                                      // and the chord, softly, on two and three
        for (const n of b.chord) tine(ac, out, at + beat * BEAT, n + 12, 0.045, 0.35);
      }
      let m = at;
      for (const [note, beats] of b.melody) {
        tine(ac, out, m, note, 0.16, 0.7);
        m += beats * BEAT;
      }
    });
  }
}

// ---- the sequence ----

// Plays the prologue over root (the cinematic's black). onDialogue() is called as the screen goes
// to black for the last day: a good moment to build the game. If it returns a promise, the silence
// lasts until it resolves (up to SILENCE_MAX), so the stall is hidden in the silence.
// Returns { done, skip() }; done resolves when it has finished or been skipped.
export function playPrologue(root, { before = null, onDialogue = () => {} } = {}) {
  const cfg = PROLOGUE_CONFIG;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  const layer = document.createElement('div');
  layer.id = 'pl-root';
  layer.style.setProperty('--pl-drop', cfg.DROP + 's');
  layer.style.setProperty('--pl-develop', cfg.DEVELOP + 's');
  layer.style.setProperty('--pl-exit', cfg.EXIT + 's');
  const flash = document.createElement('div');
  flash.id = 'pl-flash';
  const sub = document.createElement('div');
  sub.id = 'pl-sub';
  layer.append(flash, sub);
  root.insertBefore(layer, before);

  const ac = audioContext();
  ac?.resume().catch(() => {});
  // the buses: voice, music and effects, each at the player's own volume
  const bus = (v) => { if (!ac) return null; const g = ac.createGain(); g.gain.value = v; g.connect(ac.destination); return g; };
  const voiceOut = bus(settings.get('voice'));
  const musicOut = bus(settings.get('music') * cfg.MUSIC_VOLUME);
  const sfxOut = bus(settings.get('effects') * cfg.SFX_VOLUME);
  if (musicOut) {
    const wet = ac.createGain();
    wet.gain.value = 0.35;
    const verb = reverb(ac);
    verb.connect(wet).connect(ac.destination);
    musicOut.connect(verb);
  }
  const sources = new Set();

  let skipReject;
  const skipped = new Promise((_, reject) => { skipReject = reject; });
  skipped.catch(() => {});
  const timers = new Set();
  const wait = (s) => Promise.race([new Promise((r) => { const id = setTimeout(() => { timers.delete(id); r(); }, s * 1000); timers.add(id); }), skipped]);
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  function subtitle(line) {
    if (!line) { sub.classList.remove('on'); return; }
    sub.innerHTML = `<b class="${line.speaker}">${SPEAKER[line.speaker]}</b>${line.text}`;
    sub.classList.add('on');
  }

  // Plays a line's recording; resolves when it ends (or after a reading time, if it did not load).
  // With line.cutAt it resolves that far in and the voice is faded out (cut off by the next line)
  function say(line) {
    const clip = buffers.get(line.clip);
    if (!clip || !ac) return wait(line.cutAt ?? Math.max(1.5, line.text.length * cfg.READ_SECONDS_PER_CHAR));
    const src = ac.createBufferSource();
    src.buffer = clip.buffer;
    const g = ac.createGain();
    g.gain.value = clip.gain;
    src.connect(g).connect(voiceOut);
    sources.add(src);
    const ended = new Promise((r) => { src.onended = () => { sources.delete(src); r(); }; });
    src.start();
    if (line.cutAt == null) return Promise.race([ended, skipped]);
    return Promise.race([ended, wait(line.cutAt).then(() => {
      g.gain.setValueAtTime(clip.gain, ac.currentTime);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + 0.15);
    })]);
  }

  // Under Voss's two photos: a low, uneasy drone (two detuned tones beating against each other,
  // a dark rumble breathing under them, and a faint high whine)
  function startDread() {
    if (!musicOut) return null;
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 2.5);
    g.connect(musicOut);
    const nodes = [];
    for (const [f, v] of [[55, 0.35], [58.3, 0.3], [82.4, 0.12], [1244, 0.012], [1318, 0.01]]) {
      const o = ac.createOscillator();
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = v;
      o.connect(og).connect(g);
      nodes.push(o);
    }
    const rumble = ac.createBufferSource();
    rumble.buffer = noise(ac, 4);
    rumble.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 160;
    lp.Q.value = 4;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.18;
    const depth = ac.createGain();
    depth.gain.value = 90;
    lfo.connect(depth).connect(lp.frequency);
    const rg = ac.createGain();
    rg.gain.value = 0.5;
    rumble.connect(lp).connect(rg).connect(g);
    nodes.push(rumble, lfo);
    for (const n of nodes) { n.start(t); sources.add(n); }
    return g;
  }

  function startMusic() {
    if (!musicOut) return;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(1, ac.currentTime + 1.2);
    g.connect(musicOut);
    if (musicBuffer) {
      const src = ac.createBufferSource();
      src.buffer = musicBuffer;
      src.loop = true;
      src.connect(g);
      src.start();
      sources.add(src);
    } else {
      synthMusic(ac, g);
    }
    return g;
  }

  async function showPhoto(p) {
    const img = images.get(p.photo);
    // the shutter, and its flash
    if (sfxOut) shutterSound(ac, sfxOut);
    flash.style.transition = 'none';
    flash.style.opacity = '0.85';
    await nextFrame();
    flash.style.transition = `opacity ${cfg.FLASH}s ease-out`;
    flash.style.opacity = '0';
    await wait(0.25);
    // the print drops in, developing
    let el = null;
    if (img) {
      el = document.createElement('div');
      el.className = 'pl-photo';
      el.style.setProperty('--pl-tilt', p.tilt + 'deg');
      el.appendChild(img);
      layer.insertBefore(el, flash);
      await nextFrame();
      el.classList.add('drop');
    }
    await wait(cfg.DROP * 0.8);
    if (sfxOut && el) landSound(ac, sfxOut);
    subtitle(p);
    await Promise.all([wait(cfg.HOLD), say(p).then(() => wait(cfg.AFTER_VOICE))]);
    subtitle(null);
    return el;
  }

  async function hidePhoto(el) {
    if (!el) return;
    el.classList.remove('drop');
    el.classList.add('exit');
    await wait(cfg.EXIT);
    el.remove();
  }

  async function run() {
    await Promise.race([preloadPrologue(), wait(cfg.ASSET_WAIT)]);
    await wait(cfg.LEAD_IN);
    const music = startMusic();
    await wait(cfg.MUSIC_LEAD);

    const fadeOut = (g, seconds) => {
      if (!g) return;
      g.gain.setValueAtTime(g.gain.value, ac.currentTime);
      g.gain.linearRampToValueAtTime(0, ac.currentTime + seconds);
    };
    let dread = null;
    for (const [i, p] of PROLOGUE_PHOTOS.entries()) {
      const el = await showPhoto(p);
      if (i === MUSIC_PHOTOS - 1) {
        fadeOut(music, cfg.MUSIC_FADE);
        dread = startDread();
      }
      if (i === PROLOGUE_PHOTOS.length - 1) fadeOut(dread, cfg.DREAD_FADE);
      await hidePhoto(el);
      if (i === MUSIC_PHOTOS - 1) await wait(Math.max(0, cfg.MUSIC_FADE - cfg.EXIT));
      else if (i === PROLOGUE_PHOTOS.length - 1) await wait(Math.max(0, cfg.DREAD_FADE - cfg.EXIT));
      else await wait(0.15);
    }

    // black, and silence, while the game is built (building it stalls the page, which would hold a
    // subtitle on screen and leave gaps between the lines)
    const built = Promise.resolve(onDialogue()).catch(() => {});
    await Promise.all([wait(cfg.SILENCE), Promise.race([built, wait(cfg.SILENCE_MAX)])]);
    for (const line of PROLOGUE_DIALOGUE) {
      await wait(line.pause);
      subtitle(line);
      await say(line);
      if (line.cutAt != null) continue;        // (cut off: the next line comes straight in)
      await wait(0.25);
      subtitle(null);
    }
    await wait(cfg.END_HOLD);
  }

  function cleanup() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    for (const s of sources) { try { s.stop(); } catch (e) { /* already stopped */ } }
    sources.clear();
    for (const out of [voiceOut, musicOut, sfxOut]) out?.disconnect();   // (cuts the synthesised notes too)
    layer.remove();
    style.remove();
  }

  let finished = false;
  const done = run().catch(() => {}).then(() => {
    finished = true;
    cleanup();
  });
  return {
    done,
    skip() {
      if (finished) return;
      onDialogue();                      // (the game still has to be built)
      skipReject(new Error('skipped'));
    }
  };
}
