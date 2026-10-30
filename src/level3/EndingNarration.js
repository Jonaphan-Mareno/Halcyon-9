import { VOICE_GAIN_DB } from './Confrontation.js';
import { voiceBus, dbGain, decode, speechShape } from './endingAudio.js';
import { settings } from '../core/Settings.js';

// The narration after the "Save ARIA" ending (docs/ending-confrontation-script.md, "The
// narration"): a gentle narrator over black, then over pictures, each picture timed to its words.
//
//   1  "Voss died shortly after."            black, after three seconds of black and silence
//   2  "He never remembered his mother..."   the prologue's Polaroid of her, young, slowly closer
//   3  "After ARIA got connected..."         a conference hall on the mainland, people in suits and
//                                            coats seen from behind, ARIA's face on a giant screen:
//                                            "...and how the organism can cure dementia." (her
//                                            caption; end-aria-10 if it is recorded), then a cut to
//                                            the hall reacting (on its feet, clapping)
//   4  "Voss's research was used..."         old people and their families holding each other, then
//                                            (at the pause before "and his mother...") his mother,
//                                            old, at the window of the memory care ward in the
//                                            morning, looking out and smiling, seen from outside
//   5  "Oh, and ARIA? ..."                   ARIA's trolling (public/assets/ending/aria-troll.html)
//   6  "Well, wasn't that a wonderful story." the cue for the restored crew photo, held after it
//
// The hall and the window are renders (Blender/scripts/render_ending_conference.py and
// render_ending_window.py: the game's own characters, and the prologue's model of his mother),
// pushed slowly in, with ARIA's talking on her screen and the morning on the glass drawn over them;
// the families are drawn here, on a canvas, in a stylised, backlit style. Each line's timing is its
// recording's real length (where its speech ends) and, for line 4, where its pause is; a missing
// recording shows its subtitle for as long as its words take (NARRATION_FALLBACK, at 2.4 words a
// second). Enter skips to the end.
// play() resolves when the picture has faded to black after the photo (or on the skip): the
// credits come next (whoever plays this hands over to them).

const AUDIO = './assets/audio/';
export const NARRATION = [
  { id: 'n1', clip: 'ending/end-narrator-1', text: 'Voss died shortly after.' },
  { id: 'n2', clip: 'ending/end-narrator-2', text: 'He never remembered his mother, but ARIA did.' },
  { id: 'n3', clip: 'ending/end-narrator-3', text: 'After ARIA got connected to the mainland she explained everything that happened on Halcyon-9 the last few months.' },
  // ARIA on the screen: a caption, and her recording if there is one (optional)
  { id: 'a10', clip: 'aria/end-aria-10', who: 'aria', text: '...and how the organism can cure dementia.', optional: true },
  { id: 'n4', clip: 'ending/end-narrator-4', text: "Voss's research was used to help countless people bring back a lifetime of memories, and his mother was the first person to be cured." },
  { id: 'n5', clip: 'ending/end-narrator-5', text: 'Oh, and ARIA? She spent her days happily trolling people on the internet.' },
  // (the owner's wording, to be confirmed)
  { id: 'n6', clip: 'ending/the-end', text: "Well, wasn't that a wonderful story." }
];
const WORDS_PER_SECOND = 2.4;
export const NARRATION_FALLBACK = Object.fromEntries(NARRATION.map((l) => [l.id, +(l.text.split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

const POLAROID = './assets/textures/prologue/photo1.webp';           // "My little Voss": her, young
// The rendered pictures (made small by scripts/ending-shots/compose.mjs, which prints SCREEN and
// GLASS): where ARIA's screen and the window's glass are in them (0..1 of the picture from its top
// left: top left, top right, bottom right, bottom left), and where each pushes in toward
const SHOTS = {
  hall: './assets/textures/ending/conference-wide.webp',
  react: './assets/textures/ending/conference-react.webp',
  window: './assets/textures/ending/mom-window.webp'
};
const SCREEN = [[0.2, 0.1], [0.8, 0.1], [0.8, 0.5], [0.2, 0.5]];
const GLASS = [[0.2, 0.1], [0.8, 0.1], [0.8, 0.9], [0.2, 0.9]];
const FOCUS = { hall: [0.5, 0.4], react: [0.5, 0.5], window: [0.5, 0.4] };
// the press's camera flashes in the hall reacting: [s after the cut, x, y (0..1 of the picture)]
const FLASHES = [[0.45, 0.8, 0.4], [1.3, 0.25, 0.45], [2.15, 0.62, 0.35]];
const TROLL = './assets/ending/aria-troll.html';
const TROLL_LENGTH = 6.3;                                               // its pile, to buried
// The restored crew photo (scripts/ending-photo/); if it is missing, the torn print of Flashback 1
const PHOTO = './assets/textures/ending/crew-photo.webp';
const PHOTO_FALLBACK = './assets/textures/flashback1/briefing-photo.webp';
const SKIP_AFTER = 1.0;

const STYLE = `
.en-root { position: fixed; inset: 0; z-index: 60; background: #000; overflow: hidden; cursor: none;
  font-family: 'Helvetica Neue', 'Segoe UI', Arial, sans-serif; }
.en-pic { position: absolute; inset: 0; opacity: 0; transition: opacity var(--fade, 1.2s) ease; display: flex;
  align-items: center; justify-content: center; }
.en-pic.on { opacity: 1; }
.en-pic canvas { width: 100%; height: 100%; display: block; }
.en-polaroid { height: 80vh; max-width: 86vw; object-fit: contain; transform: rotate(-4deg) scale(1);
  transition: transform 16s linear; box-shadow: 0 2vh 6vh rgba(0, 0, 0, 0.7); }
.en-polaroid.in { transform: rotate(-3deg) scale(1.13); }
.en-photo { max-height: 74vh; max-width: 88vw; object-fit: contain; transform: rotate(1.5deg) scale(0.985);
  transition: transform 9s ease-out; box-shadow: 0 2vh 7vh rgba(0, 0, 0, 0.75); }
.en-photo.in { transform: rotate(0.6deg) scale(1.03); }
.en-troll { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; pointer-events: none; background: #000; }
.en-sub { position: absolute; left: 0; right: 0; bottom: 0; height: 9vh; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 5; }
.en-sub.on { opacity: 1; }
.en-sub > div { max-width: 88vw; text-align: center; color: #f1f4f2; font-size: 2.3vh; line-height: 1.35;
  text-shadow: 0 0 0.6vh #000, 0 0 1.4vh #000; }
.en-sub .who { font-size: .8em; letter-spacing: .2em; font-weight: bold; margin-right: .7em; color: #7fe3ff; }
.en-sub .narrator { font-style: italic; color: #f4efe6; }
.en-hint { position: absolute; right: 1.2rem; top: 1.2rem; font-size: .72rem; letter-spacing: .15rem; color: #cfefff;
  opacity: 0; transition: opacity .4s; z-index: 6; }
.en-black { position: absolute; inset: 0; background: #000; opacity: 0; transition: opacity 1.5s ease; z-index: 4; pointer-events: none; }
`;

export class EndingNarration {
  // root: where the overlay goes (the page's body is fine: it covers everything)
  constructor(root = document.body) {
    this.root = root;
    this.running = false;
    this.ready = false;
    this.t = 0;
    this._onKey = (e) => this._key(e);
  }

  // The recordings, the pictures' images and the trolling page (started hidden, so it is loaded)
  preload() {
    this._loading ||= this._load().then(() => { this.ready = true; }).catch((e) => console.warn('Narration: could not set up.', e));
    return this._loading;
  }

  async _load() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ac = AC ? new AC() : null;
    this.len = { ...NARRATION_FALLBACK };
    this.shape = {};
    this.buffers = new Map();
    const image = (src) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = src;
    });
    const [hall, react, win, polaroid, photo] = await Promise.all([
      image(SHOTS.hall), image(SHOTS.react), image(SHOTS.window), image(POLAROID), image(PHOTO).then((im) => im || image(PHOTO_FALLBACK)),
      ...(this.ac ? NARRATION.map(async (l) => {
        const b = await decode(this.ac, AUDIO + l.clip + '.mp3');
        if (!b) return console.info('Narration: no recording yet for', l.clip, l.optional ? '(her caption only)' : '(its subtitle is shown instead)');
        this.buffers.set(l.id, b);
        this.shape[l.id] = speechShape(b);
        this.len[l.id] = this.shape[l.id].end;
      }) : [])
    ]);
    this.shots = { hall, react, window: win };
    for (const [k, im] of Object.entries(this.shots)) if (!im) console.warn('Narration: no picture for', k, '(', SHOTS[k], ')');
    this.polaroidSrc = polaroid?.src || POLAROID;
    this.photoSrc = photo?.src || PHOTO_FALLBACK;
    this.photoIsRestored = !!photo && photo.src.includes('crew-photo');
  }

  // When everything happens (s, from the start of the black)
  _timeline() {
    const len = this.len, T = { line: {} };
    const L = T.line;
    const say = (id, at) => {
      L[id] = [at, at + len[id]];
      return L[id][1];
    };
    // 1: three seconds of black and silence, then the line over black
    let at = say('n1', 3.0);
    // 2: the Polaroid
    T.polaroid = at + 0.6;
    at = say('n2', T.polaroid + 0.9);
    // 3: the hall, ARIA on the screen; her caption after the narrator; a cut to the hall reacting
    T.hall = at + 1.0;
    at = say('n3', T.hall + 0.8);
    at = say('a10', at + 0.45);
    T.react = L.a10[0] + 0.62 * len.a10;
    // 4: the families; then, at the pause in the line, his mother at the window
    T.families = at + 1.1;
    at = say('n4', T.families + 0.6);
    const pauses = this.shape.n4?.pauses || [];
    let gap = null;
    for (const p of pauses) if (!gap || p[1] - p[0] > gap[1] - gap[0]) gap = p;
    T.window = L.n4[0] + (gap ? gap[0] + 0.1 : 0.6 * len.n4);
    // (a full second of silence after "the first person to be cured")
    // 5: the trolling, from the start of the line
    T.troll = at + 1.2;
    at = say('n5', T.troll + 0.35);
    // 6: the closing line is the photo's cue; it is held after it, then black
    at = say('n6', Math.max(at, T.troll + TROLL_LENGTH) + 0.7);
    T.photo = L.n6[0] - 0.05;
    T.black = at + 4.0;
    T.end = T.black + 1.6;
    return T;
  }

  // ------------------------------------------------------------------ playing
  play() {
    this.running = true;
    this.T = this._timeline();
    this._mount();
    window.addEventListener('keydown', this._onKey, true);
    this._startSound();
    this._start = performance.now();
    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this._frame();
    };
    loop();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _key(e) {
    if (!this.running || e.code !== 'Enter' || this.t < SKIP_AFTER || this._skipping) return;
    e.preventDefault();
    e.stopPropagation();
    this._skip();
  }

  _skip() {
    this._skipping = true;
    this._stopSound(0.4);
    this.black.style.transition = 'opacity .6s ease';
    this.black.style.opacity = '1';
    this.sub.classList.remove('on');
    setTimeout(() => this._finish('skipped'), 700);
  }

  _finish(how) {
    if (this._finished) return;
    this._finished = true;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(how);
  }

  _mount() {
    const style = (this._style = document.createElement('style'));
    style.textContent = STYLE;
    document.head.appendChild(style);
    const el = (this.el = document.createElement('div'));
    el.className = 'en-root';
    el.innerHTML = `
      <div class="en-pic" data-pic="polaroid" style="--fade:1.4s"><img class="en-polaroid" alt=""></div>
      <div class="en-pic" data-pic="hall"><canvas></canvas></div>
      <div class="en-pic" data-pic="react"><canvas></canvas></div>
      <div class="en-pic" data-pic="families"><canvas></canvas></div>
      <div class="en-pic" data-pic="window" style="--fade:0.9s"><canvas></canvas></div>
      <div class="en-pic" data-pic="troll" style="--fade:0.5s"></div>
      <div class="en-pic" data-pic="photo" style="--fade:0.7s"><img class="en-photo" alt="The crew of Halcyon-9"></div>
      <div class="en-black"></div>
      <div class="en-sub"><div><span class="who"></span><span class="text"></span></div></div>
      <div class="en-hint">Enter: skip</div>`;
    this.root.appendChild(el);
    this.pics = Object.fromEntries([...el.querySelectorAll('.en-pic')].map((p) => [p.dataset.pic, p]));
    el.querySelector('.en-polaroid').src = this.polaroidSrc;
    el.querySelector('.en-photo').src = this.photoSrc;
    this.black = el.querySelector('.en-black');
    this.sub = el.querySelector('.en-sub');
    this.subWho = el.querySelector('.who');
    this.subText = el.querySelector('.text');
    this.hint = el.querySelector('.en-hint');
    this.canvases = {};
    for (const k of ['hall', 'react', 'families', 'window']) this.canvases[k] = this.pics[k].querySelector('canvas');
    // the trolling page, loaded now (hidden) and started on its cue
    const frame = (this.troll = document.createElement('iframe'));
    frame.className = 'en-troll';
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('aria-hidden', 'true');
    frame.src = TROLL;
    frame.addEventListener('load', () => {
      try {
        frame.contentDocument?.getElementById('replay')?.remove();
        if (frame.contentDocument?.body) frame.contentDocument.body.onclick = null;
      } catch (e) { /* (another origin: it plays as it loads) */ }
    });
    this.pics.troll.appendChild(frame);
    document.exitPointerLock?.();
  }

  _frame() {
    const ac = this.ac;
    // (clock: a time to hold it at, for checking its pictures)
    const t = (this.t = this.clock ?? (ac && ac.state === 'running' && this._t0 !== undefined ? ac.currentTime - this._t0 : (performance.now() - this._start) / 1000));
    const T = this.T, L = T.line;
    if (this._skipping) return;
    this.hint.style.opacity = t > SKIP_AFTER && t < T.black ? 0.45 : 0;
    // which picture shows
    const show = t >= T.photo ? 'photo' : t >= T.troll ? 'troll' : t >= T.window ? 'window' : t >= T.families ? 'families' : t >= T.react ? 'react' : t >= T.hall ? 'hall' : t >= T.polaroid ? 'polaroid' : null;
    if (show !== this._shown) {
      this._shown = show;
      // (the hall cuts to its reaction; everything else dissolves)
      if (show === 'react') for (const k of ['hall', 'react']) this.pics[k].style.setProperty('--fade', '0s');
      if (show === 'families') this.pics.react.style.setProperty('--fade', '1.2s');
      for (const [k, p] of Object.entries(this.pics)) p.classList.toggle('on', k === show);
      if (show === 'polaroid') requestAnimationFrame(() => this.el.querySelector('.en-polaroid').classList.add('in'));
      if (show === 'photo') requestAnimationFrame(() => this.el.querySelector('.en-photo').classList.add('in'));
      if (show === 'troll') this._startTroll();
    }
    // the pictures, drawn while they show or fade
    const sh = this.shots;
    if (show === 'hall' || (t >= T.hall - 0.1 && t < T.react)) this._paint('hall', t - T.hall, (c, w, h, s) => paintHall(c, w, h, s, sh.hall, t - L.a10[0], L.a10[1] - L.a10[0]));
    if (show === 'react' || (t >= T.react - 0.1 && t < T.families + 1.3)) this._paint('react', t - T.react, (c, w, h, s) => paintReact(c, w, h, s, sh.react));
    if (show === 'families' || (t >= T.families - 0.1 && t < T.window + 1)) this._paint('families', t - T.families, (c, w, h, s) => paintFamilies(c, w, h, s, T.window - T.families));
    if (show === 'window' || (t >= T.window - 0.1 && t < T.troll + 0.6)) this._paint('window', t - T.window, (c, w, h, s) => paintWindow(c, w, h, s, sh.window));
    // black at the end, then done
    if (t >= T.black && !this._blacked) {
      this._blacked = true;
      this.black.style.opacity = '1';
    }
    if (t >= T.end) this._finish('done');
    this._subtitles(t);
  }

  _paint(name, local, draw) {
    const c = this.canvases[name];
    const w = Math.max(16, Math.round(c.clientWidth * Math.min(1.5, window.devicePixelRatio || 1)));
    const h = Math.max(16, Math.round(c.clientHeight * Math.min(1.5, window.devicePixelRatio || 1)));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    draw(c.getContext('2d'), w, h, Math.max(0, local));
  }

  // The trolling page, from its start; the label it shows for replaying is taken away
  _startTroll() {
    this._trollStarted = true;
    try {
      const win = this.troll.contentWindow;
      win.document.getElementById('replay')?.remove();
      if (typeof win.play === 'function') win.play();
    } catch (e) {
      this.troll.src = TROLL;          // (if it cannot be reached into: loaded again, it plays on load)
    }
  }

  _subtitles(t) {
    const L = this.T.line;
    let line = null;
    for (const l of NARRATION) if (t >= L[l.id][0] && t <= L[l.id][1] + 0.4) line = l;
    if (line) {
      if (this._line !== line) {
        this._line = line;
        this.subText.textContent = line.text;
        this.subText.className = 'text' + (line.who ? '' : ' narrator');
        this.subWho.textContent = line.who === 'aria' ? 'ARIA' : '';
        this.subWho.style.display = line.who ? '' : 'none';
      }
      this.sub.classList.add('on');
    } else {
      this.sub.classList.remove('on');
    }
  }

  // ------------------------------------------------------------------ sound
  _startSound() {
    const ac = this.ac;
    if (!ac) return;
    ac.resume?.().catch(() => {});
    const at = ac.currentTime + 0.1;
    this._t0 = at;
    this._sources = [];
    this._bus = voiceBus(ac, ac.destination, settings.get('voice'));
    for (const l of NARRATION) {
      const b = this.buffers.get(l.id);
      if (!b) continue;
      const src = ac.createBufferSource();
      src.buffer = b;
      const g = ac.createGain();
      g.gain.value = dbGain(VOICE_GAIN_DB[l.id] ?? VOICE_GAIN_DB.a7 ?? 0);
      src.connect(g).connect(this._bus.input);
      src.start(at + this.T.line[l.id][0]);
      this._sources.push(src);
    }
  }

  _stopSound(fade = 0.3) {
    const ac = this.ac;
    if (!ac || !this._bus) return;
    const now = ac.currentTime;
    this._bus.output.gain.setTargetAtTime(0, now, fade / 4);
    for (const s of this._sources || []) {
      try { s.stop(now + fade + 0.05); } catch { /* (already stopped) */ }
    }
    this._sources = [];
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKey, true);
    this._stopSound(0.05);
    if (this.troll) this.troll.src = 'about:blank';
    this.el?.remove();
    this._style?.remove();
    this.el = null;
    this.ac?.close?.().catch(() => {});
    this.ac = null;
    this.buffers = null;
    this._resolve = null;
  }
}

// ------------------------------------------------------------------ the pictures
// Stylised, drawn each frame: dark figures against light, a slow push in, grain and a vignette.

const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { const u = clamp01(v); return u * u * (3 - 2 * u); };
function rnd(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function finish(g, w, h, s, warm = 0) {
  // vignette and grain, as an old film would have
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(${warm ? '20,8,0' : '0,0,0'},0.72)`);
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const r = rnd(1 + Math.floor(s * 24));
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 260; i++) g.fillRect(r() * w, r() * h, 1.5, 1.5);
  g.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < 260; i++) g.fillRect(r() * w, r() * h, 1.5, 1.5);
}

// A rendered picture over the whole canvas, cut to fill it and pushed slowly in (by push over len
// seconds) about focus (0..1 of the picture), so what is there stays where it is; returns where a
// point of the picture lands, for what is drawn over it
function shot(g, w, h, img, s, focus, push, len) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  if (!img) return null;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k0 = Math.max(w / iw, h / ih);
  const fx = (w - iw * k0) / 2 + focus[0] * iw * k0, fy = (h - ih * k0) / 2 + focus[1] * ih * k0;
  const k = k0 * (1 + push * smooth(s / len)), x = fx - focus[0] * iw * k, y = fy - focus[1] * ih * k;
  g.drawImage(img, x, y, iw * k, ih * k);
  return (u, v) => [x + u * iw * k, y + v * ih * k];
}

// What is drawn over part of a picture (a quad, given as SCREEN is): clipped to it, added as light
function over(g, at, quad, draw) {
  const q = quad.map(([u, v]) => at(u, v));
  const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
  g.save();
  g.beginPath();
  g.moveTo(...q[0]);
  for (const p of q.slice(1)) g.lineTo(...p);
  g.closePath();
  g.clip();
  g.globalCompositeOperation = 'lighter';
  draw(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
  g.restore();
}

// 3: the hall, ARIA on the screen. Her face glows with her voice while she speaks (her caption's
// time: a lively flicker, as the hologram's mouth moves), a scan line rolls down the screen, and
// the screen breathes a little all the while
function paintHall(g, w, h, s, img, speak, speakLen) {
  const at = shot(g, w, h, img, s, FOCUS.hall, 0.07, 16);
  if (at) {
    over(g, at, SCREEN, (x0, y0, x1, y1) => {
      const talking = speak > 0 && speak < speakLen ? 0.35 + 0.65 * Math.abs(Math.sin(speak * 11) * Math.sin(speak * 3.7)) : 0;
      const breath = 0.025 + 0.015 * Math.sin(s * 2.1) + 0.01 * Math.sin(s * 23) * Math.sin(s * 7.3);
      const cx = (x0 + x1) / 2, cy = y0 + (y1 - y0) * 0.47, r = (y1 - y0) * 0.55;
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      glow.addColorStop(0, `rgba(110,215,255,${breath + 0.12 * talking})`);
      glow.addColorStop(1, 'rgba(110,215,255,0)');
      g.fillStyle = glow;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      const band = (y1 - y0) * 0.06, sy = y0 - band + (y1 - y0 + 2 * band) * ((s * 0.21) % 1);
      const line = g.createLinearGradient(0, sy - band, 0, sy + band);
      line.addColorStop(0, 'rgba(140,230,255,0)');
      line.addColorStop(0.5, 'rgba(140,230,255,0.08)');
      line.addColorStop(1, 'rgba(140,230,255,0)');
      g.fillStyle = line;
      g.fillRect(x0, sy - band, x1 - x0, band * 2);
    });
  }
  finish(g, w, h, s);
}

// 3, the cut: the hall on its feet; a camera flashes here and there
function paintReact(g, w, h, s, img) {
  const at = shot(g, w, h, img, s, FOCUS.react, 0.05, 10);
  if (at) {
    for (const [when, u, v] of FLASHES) {
      const e = (s - when) / 0.18;
      if (e < 0 || e > 1) continue;
      const [x, y] = at(u, v), r = h * 0.1, a = (1 - e) * (1 - e);
      const f = g.createRadialGradient(x, y, 0, x, y, r);
      f.addColorStop(0, `rgba(255,255,255,${0.9 * a})`);
      f.addColorStop(0.12, `rgba(235,245,255,${0.4 * a})`);
      f.addColorStop(1, 'rgba(235,245,255,0)');
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = f;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.restore();
    }
  }
  finish(g, w, h, s);
}

// 4a: families together again: an old man held by his daughter; three generations in one embrace;
// an old hand and a young one reaching for each other. Warm light behind them, dust in it. Each
// picture in turn over `len` seconds
function paintFamilies(g, w, h, s, len) {
  const n = 3, each = len / n;
  const k = Math.min(n - 1, Math.floor(s / each)), u = (s - k * each) / each;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  for (const [i, a] of [[k, 1], [k - 1, 1 - smooth(u / 0.25)]]) {
    if (i < 0 || a <= 0) continue;
    const local = s - i * each;
    g.save();
    g.globalAlpha = i === k ? smooth(local / 0.5) : a;
    const push = 1 + 0.07 * (local / each);
    g.setTransform(push, 0, 0, push, (w - w * push) / 2, (h - h * push) / 2);
    [embrace, generations, hands][i](g, w, h, local);
    g.restore();
  }
  finish(g, w, h, s, 1);
}

function warmLight(g, w, h, x, y, r) {
  g.fillStyle = '#1a0d05';
  g.fillRect(0, 0, w, h);
  const l = g.createRadialGradient(x, y, 0, x, y, r);
  l.addColorStop(0, 'rgba(255,236,200,1)');
  l.addColorStop(0.25, 'rgba(255,196,120,0.85)');
  l.addColorStop(0.6, 'rgba(170,90,40,0.35)');
  l.addColorStop(1, 'rgba(40,16,6,0)');
  g.fillStyle = l;
  g.fillRect(0, 0, w, h);
}

function dust(g, w, h, s, seed) {
  const r = rnd(seed);
  for (let i = 0; i < 60; i++) {
    const x = (r() * w + s * (8 + r() * 16)) % w, y = (r() * h - s * (4 + r() * 6) + h) % h, z = 1 + r() * 2.5;
    g.fillStyle = `rgba(255,220,170,${0.08 + 0.2 * r()})`;
    g.beginPath();
    g.arc(x, y, z, 0, Math.PI * 2);
    g.fill();
  }
}

// A person from behind, from the waist up (base: the waist's line), against the light: shoulders, a
// neck, the head (tilted toward someone, or bowed), the hair (a bun, short, a ponytail), a warm rim
// of light on the top edges. o: { size, width, tilt, bow, hair, stoop }
function back(g, x, base, o) {
  const sz = o.size, sw = sz * (o.width ?? 0.5), torso = sz * (o.stoop ? 0.62 : 0.7), headR = sz * 0.13;
  const top = base - torso;
  g.beginPath();
  g.moveTo(x - sw * 0.92, base + sz * 0.3);
  g.bezierCurveTo(x - sw, top + sz * 0.25, x - sw * 0.85, top + (o.stoop ? -sz * 0.02 : 0), x - sz * 0.07, top - sz * 0.03);
  g.lineTo(x + sz * 0.07, top - sz * 0.03);
  g.bezierCurveTo(x + sw * 0.85, top + (o.stoop ? -sz * 0.02 : 0), x + sw, top + sz * 0.25, x + sw * 0.92, base + sz * 0.3);
  g.closePath();
  g.fill();
  if (g._rim) g.stroke();
  // the neck and the head
  const tilt = o.tilt ?? 0, hx = x + Math.sin(tilt) * sz * 0.22 + (o.stoop ? 0 : 0), hy = top - sz * 0.05 - headR * 1.15 + (o.bow ?? 0) * sz * 0.06 + (o.stoop ? sz * 0.05 : 0);
  g.fillRect(x - sz * 0.055 + Math.sin(tilt) * sz * 0.08, top - sz * 0.12, sz * 0.11, sz * 0.14);
  // (a bun is on the back of the head: in front of it from behind, behind it once she faces us)
  const bun = () => {
    g.beginPath();
    g.ellipse(hx + Math.sin(tilt) * headR * 0.4, hy - headR * 0.85, headR * 0.45, headR * 0.4, tilt, 0, Math.PI * 2);
    g.fill();
    if (g._rim) g.stroke();
  };
  if (o.hair === 'bun' && o.facing) bun();
  g.beginPath();
  g.ellipse(hx, hy, headR * 0.92, headR * 1.08, tilt, 0, Math.PI * 2);
  g.fill();
  if (g._rim) g.stroke();
  if (o.hair === 'bun' && !o.facing) bun();
  else if (o.hair === 'pony') {
    g.beginPath();
    g.moveTo(hx - headR * 0.2, hy + headR * 0.4);
    g.quadraticCurveTo(hx + headR * 0.1, hy + headR * 1.6, hx - headR * 0.05, hy + headR * 2.2);
    g.lineTo(hx + headR * 0.25, hy + headR * 0.4);
    g.fill();
  }
  return { hx, hy, top, sw };
}

function arm(g, x0, y0, x1, y1, lift, width) {
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - lift, x1, y1);
  g.stroke();
}

function rimmed(g, fill, rim, width) {
  g.fillStyle = fill;
  g.strokeStyle = rim;
  g.lineWidth = width;
  g._rim = true;
}

function embrace(g, w, h, s) {
  // an old man on a bench at a window, his daughter beside him, her head on his shoulder, her arm
  // round his back; seen from behind, against the evening
  warmLight(g, w, h, w * 0.5, h * 0.36, w * 0.62);
  g.fillStyle = 'rgba(40,18,6,0.85)';
  g.fillRect(w * 0.06, h * 0.06, w * 0.88, h * 0.012);
  g.fillRect(w * 0.06, h * 0.06, w * 0.012, h * 0.62);
  g.fillRect(w * 0.928, h * 0.06, w * 0.012, h * 0.62);
  g.fillRect(w * 0.06, h * 0.66, w * 0.88, h * 0.02);
  const sz = h * 0.62, rock = Math.sin(s * 1.2) * 0.015;
  rimmed(g, '#130803', 'rgba(255,214,150,0.55)', Math.max(1.5, sz * 0.008));
  const man = back(g, w * 0.43, h * 0.96, { size: sz, width: 0.52, stoop: true, bow: 0.6, tilt: 0.05 });
  back(g, w * 0.6, h * 0.97, { size: sz * 0.94, width: 0.44, tilt: -0.42 + rock, hair: 'bun' });
  g._rim = false;
  g.strokeStyle = '#130803';
  arm(g, w * 0.6 - sz * 0.25, man.top + sz * 0.22, w * 0.43 - sz * 0.36, man.top + sz * 0.12, sz * 0.05, sz * 0.085);
  // the bench
  g.fillStyle = '#0d0602';
  g.fillRect(w * 0.18, h * 0.93, w * 0.64, h * 0.03);
  dust(g, w, h, s, 3);
}

function generations(g, w, h, s) {
  // a grandmother between her son and her granddaughter, his arm round her shoulders, the girl
  // holding her hand; from behind, in a bright doorway
  warmLight(g, w, h, w * 0.5, h * 0.3, w * 0.58);
  g.fillStyle = 'rgba(34,15,5,0.9)';
  g.fillRect(w * 0.2, 0, w * 0.035, h);
  g.fillRect(w * 0.765, 0, w * 0.035, h);
  const sz = h * 0.6, sway = Math.sin(s * 1.0) * 0.012;
  rimmed(g, '#140904', 'rgba(255,214,150,0.55)', Math.max(1.5, sz * 0.008));
  const son = back(g, w * 0.36, h * 0.9, { size: sz * 1.08, width: 0.5, tilt: 0.12 + sway, hair: 'short' });
  const gran = back(g, w * 0.52, h * 0.98, { size: sz * 0.86, width: 0.46, stoop: true, tilt: -0.1, hair: 'bun' });
  back(g, w * 0.67, h * 1.08, { size: sz * 0.62, width: 0.42, tilt: -0.22 - sway, hair: 'pony' });
  g._rim = false;
  g.strokeStyle = '#140904';
  arm(g, w * 0.36 + sz * 0.3, son.top + sz * 0.12, w * 0.52 + sz * 0.32, gran.top + sz * 0.1, sz * 0.06, sz * 0.08);
  // her hand in the girl's
  arm(g, w * 0.52 + sz * 0.33, gran.top + sz * 0.45, w * 0.6, h * 0.94, -sz * 0.02, sz * 0.06);
  dust(g, w, h, s, 9);
}

function hands(g, w, h, s) {
  warmLight(g, w, h, w * 0.5, h * 0.42, w * 0.5);
  const meet = smooth(s / 1.6);
  const hand = (from, dir, old) => {
    g.save();
    g.translate(from, h * 0.52);
    g.scale(dir, 1);
    g.fillStyle = old ? '#160a05' : '#1b0c05';
    // the forearm, the palm, four fingers and a thumb reaching
    g.beginPath();
    g.moveTo(-w * 0.5, h * 0.06);
    g.quadraticCurveTo(-w * 0.2, h * 0.02, 0, h * 0.012);
    g.lineTo(0, -h * 0.035);
    g.quadraticCurveTo(-w * 0.2, -h * 0.05, -w * 0.5, -h * 0.03);
    g.fill();
    g.beginPath();
    g.ellipse(w * 0.02, -h * 0.01, w * 0.035, h * 0.035, 0, 0, Math.PI * 2);
    g.fill();
    for (let f = 0; f < 4; f++) {
      g.save();
      g.translate(w * 0.045, -h * 0.03 + f * h * 0.017);
      g.rotate(0.25 - f * 0.1 + (old ? 0.08 : 0));
      g.beginPath();
      g.ellipse(w * 0.026, 0, w * 0.03, h * 0.0075, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.ellipse(w * 0.03, h * 0.025, w * 0.022, h * 0.009, 0.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  hand(lerp(w * 0.2, w * 0.405, meet), 1, true);
  hand(lerp(w * 0.8, w * 0.595, meet), -1, false);
  // the light where they touch
  const t = g.createRadialGradient(w / 2, h * 0.51, 0, w / 2, h * 0.51, w * 0.06);
  t.addColorStop(0, `rgba(255,240,210,${0.55 * meet})`);
  t.addColorStop(1, 'rgba(255,200,140,0)');
  g.fillStyle = t;
  g.fillRect(0, 0, w, h);
  dust(g, w, h, s, 21);
}

// 4b: his mother at the window, in the morning, seen from outside; slowly closer to her face, the
// sky's light sliding over the glass
function paintWindow(g, w, h, s, img) {
  const at = shot(g, w, h, img, s, FOCUS.window, 0.12, 7);
  if (at) {
    over(g, at, GLASS, (x0, y0, x1, y1) => {
      const span = x1 - x0 + (y1 - y0), u = -0.25 + s * 0.075;
      const bx = x0 + span * u;
      for (const [off, wid, a] of [[0, 0.05, 0.09], [0.11, 0.02, 0.06]]) {
        const c = bx + span * off, d = span * wid;
        const glare = g.createLinearGradient(c - d, y0, c + d - (y1 - y0) * 0.6, y1);
        glare.addColorStop(0, 'rgba(255,246,228,0)');
        glare.addColorStop(0.5, `rgba(255,246,228,${a})`);
        glare.addColorStop(1, 'rgba(255,246,228,0)');
        g.fillStyle = glare;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    });
  }
  finish(g, w, h, s, 1);
}
