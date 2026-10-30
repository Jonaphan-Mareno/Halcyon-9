import { VOICE_GAIN_DB } from './Confrontation.js';
import { voiceBus, dbGain, decode, speechShape } from './endingAudio.js';
import { settings } from '../core/Settings.js';
import { ConferenceScene } from './ConferenceScene.js';

// The narration after the "Save ARIA" ending (docs/ending-confrontation-script.md, "The
// narration"): a gentle narrator over black, then over pictures, each picture timed to its words.
//
//   1  "Voss died shortly after."            black, after three seconds of black and silence
//   2  "He never remembered his mother..."   the prologue's Polaroid of her, young, slowly closer
//   3  "After ARIA got connected..."         Flashback 1's conference room, six people in suits and
//                                            lab coats (ConferenceScene.js, drawn live), ARIA's face
//                                            on its screen; the narrator goes on "...and how it can
//                                            cure dementia.", and the picture cuts to their faces
//   4  "Voss's research was used..."         old people and their families holding each other, then
//                                            (at the pause before "and his mother...") his mother,
//                                            old and white haired, at the window of the memory care
//                                            ward in the morning, looking out, pleased and proud
//   5  "Oh, and ARIA? ..."                   ARIA's trolling (public/assets/ending/aria-troll.html)
//   6  "Well, wasn't that a wonderful story." the cue for the torn print of Level 1, which then
//                                            heals into the restored crew photo, held after it
//
// The window is a render (Blender/scripts/render_ending_window.py: the prologue's model of his
// mother), pushed slowly in, with the morning on the glass drawn over it; the families are renders
// too (render_ending_families.py). Each line's timing is its
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
  { id: 'n3b', clip: 'ending/end-narrator-curedementia', text: '...and how it can cure dementia.' },
  { id: 'n4', clip: 'ending/end-narrator-4', text: "Voss's research was used to help countless people bring back a lifetime of memories, and his mother was the first person to be cured." },
  { id: 'n5', clip: 'ending/end-narrator-5', text: 'Oh, and ARIA? She spent her days happily trolling people on the internet.' },
  // (the owner's wording, to be confirmed)
  { id: 'n6', clip: 'ending/the-end', text: "Well, wasn't that a wonderful story." }
];
const WORDS_PER_SECOND = 2.4;
export const NARRATION_FALLBACK = Object.fromEntries(NARRATION.map((l) => [l.id, +(l.text.split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

const POLAROID = './assets/textures/prologue/photo1.webp';           // "My little Voss": her, young
// The rendered picture (made small by scripts/ending-shots/compose.mjs, which prints GLASS): where
// the window's glass is in it (0..1 of the picture from its top left: top left, top right, bottom
// right, bottom left), and where it pushes in toward
export const SHOTS = {
  window: './assets/textures/ending/mom-window.webp',
  families: ['./assets/textures/ending/family-1.webp', './assets/textures/ending/family-2.webp', './assets/textures/ending/family-3.webp']
};
const GLASS = [[0.2536, -0.0627], [0.7406, -0.086], [0.726, 0.9484], [0.2673, 0.8874]];
const FOCUS = { window: [0.489, 0.3] };
const TROLL = './assets/ending/aria-troll.html';
const TROLL_LENGTH = 5.1;                                               // its pile, every card down
const TROLL_HOLD = 0.3;                                                 // then the pile, before the closing line
// The torn print of Level 1 (scripts/flashback1-photo/), and the restored crew photo it heals into
// (scripts/ending-photo/): the same size, the same picture; without the second, the first stays
const TORN = './assets/textures/flashback1/briefing-photo.webp';
const PHOTO = './assets/textures/ending/crew-photo.webp';
const HEAL = 4.0;                                                       // s, the one into the other
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
.en-photo { position: relative; transform: translateY(2.5vh) rotate(2.2deg) scale(0.93);
  filter: brightness(0.6) saturate(0.7); transition: transform 14s cubic-bezier(0.16, 0.6, 0.3, 1), filter 6s ease-out; }
.en-photo.in { transform: translateY(0) rotate(0.6deg) scale(1); filter: none; }
.en-photo img { display: block; max-height: 84vh; max-width: 88vw; }
.en-photo .en-whole { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; max-height: none; opacity: 0;
  transition: opacity var(--heal) ease-in-out; }
.en-photo.healed .en-whole { opacity: 1; }
.en-troll { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; pointer-events: none; background: #000; }
.en-sub { position: absolute; left: 0; right: 0; bottom: 0; height: 9vh; display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .3s; pointer-events: none; z-index: 5; }
.en-sub.on { opacity: 1; }
.en-sub > div { max-width: 88vw; text-align: center; color: #f1f4f2; font-size: 2.3vh; line-height: 1.35;
  text-shadow: 0 0 0.6vh #000, 0 0 1.4vh #000; }
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
    // (the room: its canvas is made here, as the people are loaded ahead of the picture)
    const canvas = (this.conferenceCanvas = document.createElement('canvas'));
    const conference = new ConferenceScene(canvas);
    const [win, families, polaroid, torn, photo] = await Promise.all([
      image(SHOTS.window), Promise.all(SHOTS.families.map(image)), image(POLAROID), image(TORN), image(PHOTO),
      conference.load().then(() => { this.conference = conference; }).catch((e) => console.warn('Narration: no conference room.', e)),
      ...(this.ac ? NARRATION.map(async (l) => {
        const b = await decode(this.ac, AUDIO + l.clip + '.mp3');
        if (!b) return console.info('Narration: no recording yet for', l.clip, '(its subtitle is shown instead)');
        this.buffers.set(l.id, b);
        this.shape[l.id] = speechShape(b);
        this.len[l.id] = this.shape[l.id].end;
      }) : [])
    ]);
    this.shots = { window: win, families };
    if (!win) console.warn('Narration: no picture for the window (', SHOTS.window, ')');
    if (!families.every(Boolean)) console.warn('Narration: a picture of the families is missing (', SHOTS.families, ')');
    this.polaroidSrc = polaroid?.src || POLAROID;
    this.tornSrc = torn?.src || TORN;
    this.photoSrc = photo?.src || this.tornSrc;
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
    // 3: the room, ARIA on the screen; the line goes on, and a cut to their faces as it lands
    T.hall = at + 1.0;
    at = say('n3', T.hall + 0.8);
    at = say('n3b', at + 0.3);
    T.react = L.n3b[0] + 0.5 * len.n3b;
    // 4: the families; then, at the pause in the line, his mother at the window
    T.families = at + 1.6;
    at = say('n4', T.families + 0.6);
    const pauses = this.shape.n4?.pauses || [];
    let gap = null;
    for (const p of pauses) if (!gap || p[1] - p[0] > gap[1] - gap[0]) gap = p;
    T.window = L.n4[0] + (gap ? gap[0] + 0.1 : 0.6 * len.n4);
    // (a full second of silence after "the first person to be cured")
    // 5: the trolling, from the start of the line
    T.troll = at + 1.2;
    at = say('n5', T.troll + 0.35);
    // 6: every card of the trolling is down and has been seen; the closing line is the cue for the
    // torn print; as it ends the print heals into the whole photo, which is held, then black
    at = say('n6', Math.max(at, T.troll + TROLL_LENGTH + TROLL_HOLD) + 0.7);
    T.photo = L.n6[0] - 0.05;
    T.heal = at - 0.6;
    T.black = T.heal + HEAL + 3.5;       // (the whole photo and its caption want reading)
    T.end = T.black + 1.6;
    return T;
  }

  // ------------------------------------------------------------------ playing
  play() {
    this.running = true;
    this.T = this._timeline();
    this._mount();
    // (its shaders are compiled now, in the three seconds of black)
    this.warming = this.conference?.warm().catch((e) => {
      console.warn('Narration: the conference room could not start.', e);
      this.conference = null;
    });
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
      <div class="en-pic" data-pic="hall"></div>
      <div class="en-pic" data-pic="families"><canvas></canvas></div>
      <div class="en-pic" data-pic="window" style="--fade:0.9s"><canvas></canvas></div>
      <div class="en-pic" data-pic="troll" style="--fade:0.5s"></div>
      <div class="en-pic" data-pic="photo" style="--fade:3s"><div class="en-photo" style="--heal:${HEAL}s"><img class="en-torn" alt="The crew of Halcyon-9"><img class="en-whole" alt=""></div></div>
      <div class="en-black"></div>
      <div class="en-sub"><div><span class="text narrator"></span></div></div>
      <div class="en-hint">Enter: skip</div>`;
    this.root.appendChild(el);
    this.pics = Object.fromEntries([...el.querySelectorAll('.en-pic')].map((p) => [p.dataset.pic, p]));
    el.querySelector('.en-polaroid').src = this.polaroidSrc;
    el.querySelector('.en-torn').src = this.tornSrc;
    el.querySelector('.en-whole').src = this.photoSrc;
    this.black = el.querySelector('.en-black');
    this.sub = el.querySelector('.en-sub');
    this.subText = el.querySelector('.text');
    this.hint = el.querySelector('.en-hint');
    this.canvases = {};
    for (const k of ['families', 'window']) this.canvases[k] = this.pics[k].querySelector('canvas');
    if (this.conferenceCanvas) this.pics.hall.appendChild(this.conferenceCanvas);
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
    const show = t >= T.photo ? 'photo' : t >= T.troll ? 'troll' : t >= T.window ? 'window' : t >= T.families ? 'families' : t >= T.hall ? 'hall' : t >= T.polaroid ? 'polaroid' : null;
    if (show !== this._shown) {
      this._shown = show;
      for (const [k, p] of Object.entries(this.pics)) p.classList.toggle('on', k === show);
      if (show === 'polaroid') requestAnimationFrame(() => this.el.querySelector('.en-polaroid').classList.add('in'));
      if (show === 'photo') requestAnimationFrame(() => this.el.querySelector('.en-photo').classList.add('in'));
      if (show === 'troll') this._startTroll();
    }
    this.el.querySelector('.en-photo').classList.toggle('healed', t >= T.heal);
    // the pictures, drawn while they show or fade
    const sh = this.shots;
    if (this.conference && t >= T.hall - 0.1 && t < T.families + 1.3) {
      const speak = t - L.n3[0], len = L.n3b[1] - L.n3[0];
      // (she is telling them, all through the line: syllables, and a breath between phrases)
      const phrase = clamp01((Math.sin(speak * 1.05 + 0.9) + 0.72) * 5);
      const talk = speak > 0 && speak < len ? phrase * (0.12 + 0.88 * Math.abs(Math.sin(speak * 8.3) * Math.sin(speak * 3.1 + 0.6))) : 0;
      this.conference.draw(t, t - T.hall, t - T.react, talk);
    }
    if (show === 'families' || (t >= T.families - 0.1 && t < T.window + 1)) this._paint('families', t - T.families, (c, w, h, s) => paintFamilies(c, w, h, s, T.window - T.families, sh.families));
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
    this.conference?.dispose();
    this.conference = null;
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

export function finish(g, w, h, s, warm = 0) {
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
export function shot(g, w, h, img, s, focus, push, len) {
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

// 4a: families together again, each picture in turn over `len` seconds, pushed slowly in, dissolving
// one into the next
export function paintFamilies(g, w, h, s, len, imgs) {
  const n = imgs.length, each = len / n;
  const k = Math.min(n - 1, Math.floor(s / each));
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  for (const i of [k - 1, k]) {
    if (i < 0) continue;
    g.save();
    g.globalAlpha = i === k && k > 0 ? smooth((s - k * each) / 0.6) : 1;
    shot(g, w, h, imgs[i], s - i * each + (i === k ? 0 : 0), [0.5, 0.42], 0.08, each * 1.4);
    g.restore();
  }
  finish(g, w, h, s, 1);
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
