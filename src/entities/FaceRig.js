// A talking face for any character whose head has these morph targets (as ARIA's face does):
//   jaw_open, mouth_wide, mouth_pucker, mouth_smile, blink, brow_up, brow_down
// and, on the humans (Voss, Kessler), eyes_tired and mouth_frown too.
//
// Three ways to drive the mouth, best first:
//   1. audio: a playing <audio>/<video> element, read by a Web Audio analyser (loudness opens the
//      jaw, bright tones stretch the mouth, dark ones round it), as AriaHead does
//   2. text: the words as they are revealed on screen, a letter at a time (say()); each letter
//      picks a mouth shape (vowels open it, o/u/w round it, m/b/p shut it, spaces and stops close
//      it), so the mouth moves exactly while the subtitles do, and stops when they stop
//   3. babble: rhythmic, wordless talking (the flashback's muffled argument)
// With none of these the face rests: mouth shut, breathing, blinking.
//
// Expression presets set the resting face, how wide the jaw goes, how the eyes blink and how the
// head moves. update(dt) eases everything and writes the morph influences; head motion is given
// out as `head` ({ yaw, pitch, roll } in radians) for the owner to apply to its neck or head bone.
//
// A head may carry a lip seal (material M_LipSeal): the faces closing the lips, shown only while
// the mouth is shut, so a closed mouth looks exactly as modelled.

const PRESETS = {
  //            resting face                              jaw range  blinks: gap (s), length, lids      head: bow, sway, sag
  neutral:  { smile: 0,    frown: 0,   brow: 0,    tired: 0,    jaw: 1.0,  blink: [2, 6],   blinkLen: 0.16, lids: 0,    bow: 0,    sway: 1,   sag: 0 },
  // log-0: the living Voss, pleased with himself
  smug:     { smile: 0.45, frown: 0,   brow: 0.25, tired: 0,    jaw: 0.9,  blink: [2, 5],   blinkLen: 0.14, lids: 0.08, bow: -0.04, sway: 1.2, sag: 0 },
  // log-1: the same man, under strain he will not admit
  tense:    { smile: 0.05, frown: 0.2, brow: -0.3, tired: 0.08, jaw: 0.8,  blink: [1.5, 4], blinkLen: 0.14, lids: 0,    bow: 0.02, sway: 0.8, sag: 0 },
  // log-2: whispering, awake all night: a small mouth, head down toward the camera
  whisper:  { smile: 0,    frown: 0.2, brow: 0.35, tired: 0.2,  jaw: 0.45, blink: [1.2, 3], blinkLen: 0.2,  lids: 0,    bow: 0.12, sway: 0.6, sag: 0.02 },
  // log-5: strained, bargaining
  strained: { smile: 0,    frown: 0.4, brow: 0.5,  tired: 0.5,  jaw: 0.75, blink: [1.5, 4], blinkLen: 0.24, lids: 0,    bow: 0.06, sway: 1.1, sag: 0.05 },
  // log-8: calm, tired, resigned: low energy, long slow blinks, the gaze drifting
  resigned: { smile: 0,    frown: 0.3, brow: 0.1,  tired: 0.8,  jaw: 0.6,  blink: [3, 6],   blinkLen: 0.42, lids: 0,    bow: 0.1,  sway: 0.5, sag: 0.1 },
  // Kessler, calm and resolved; and anyone arguing hard (the flashback)
  calm:     { smile: 0,    frown: 0.1, brow: -0.1, tired: 0.1,  jaw: 0.7,  blink: [2.5, 6], blinkLen: 0.17, lids: 0,    bow: 0,    sway: 0.6, sag: 0 },
  // Kessler: composed and stern, her lids resting a little heavy
  composed: { smile: 0,    frown: 0.15, brow: -0.15, tired: 0.3, jaw: 0.7,  blink: [2.5, 6], blinkLen: 0.18, lids: 0,    bow: 0,    sway: 0.5, sag: 0 },
  arguing:  { smile: 0,    frown: 0.3, brow: -0.55, tired: 0,   jaw: 1.0,  blink: [1.5, 4], blinkLen: 0.13, lids: 0,    bow: -0.03, sway: 1.6, sag: 0 }
};

// letter -> [jaw, wide, pucker]: a rough viseme for each letter as it is revealed (jaw_open at 1 is
// a wide-open mouth; talking uses up to about three quarters of it, so the teeth and tongue show)
const VISEME = {};
const set = (letters, shape) => { for (const c of letters) VISEME[c] = shape; };
set('a', [0.72, 0.15, 0]);
set('e', [0.48, 0.55, 0]);
set('i', [0.34, 0.75, 0]);
set('y', [0.3, 0.6, 0]);
set('o', [0.55, 0, 0.75]);
set('u', [0.3, 0, 0.9]);
set('w', [0.16, 0, 0.85]);
set('mbp', [0, 0, 0.1]);
set('fv', [0.1, 0.3, 0]);
set('lnrdtsz', [0.27, 0.25, 0]);
set('cgkhjqx', [0.34, 0.1, 0]);
const CLOSED = [0, 0, 0];

// Audio lip-sync: the loudness is measured against the recording's own recent peaks (an automatic
// gain), so a whisper and a full voice both use the face's range (the preset's jaw range still
// makes a whisper smaller). The peak follower starts at AUDIO_PEAK, decays over AUDIO_PEAK_DECAY
// seconds and never drops below AUDIO_PEAK_MIN; under AUDIO_GATE of the peak counts as silence.
const AUDIO_PEAK = 0.08;
const AUDIO_PEAK_MIN = 0.03;
const AUDIO_PEAK_DECAY = 4;
const AUDIO_GATE = 0.1;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// One shared AudioContext for every face; an element can only be wired to Web Audio once, so
// its source node is kept
let audioCtx = null;
const sources = new WeakMap();

export class FaceRig {
  // root: the head (or the whole character); every mesh under it with morph targets is driven
  constructor(root, preset = 'neutral') {
    this.meshes = [];
    this.seals = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (o.morphTargetDictionary && o.morphTargetInfluences) this.meshes.push(o);
      if (o.material?.name === 'M_LipSeal') this.seals.push(o);
    });
    this.ok = this.meshes.length > 0;
    // name -> [[influences, index], ...] for every mesh that has that target
    this.slots = {};
    for (const m of this.meshes) {
      for (const [name, i] of Object.entries(m.morphTargetDictionary)) (this.slots[name] ||= []).push([m.morphTargetInfluences, i]);
    }

    this.time = 0;
    this.preset = PRESETS.neutral;
    this.expr = { smile: 0, frown: 0, brow: 0, tired: 0, bow: 0 };
    this.setPreset(preset, true);
    this.head = { yaw: 0, pitch: 0, roll: 0 };
    this.gaze = 0;
    this._gazeTarget = 0;
    this._gazeT = 1;

    // the mouth
    this.mode = 'idle';            // 'idle' | 'text' | 'audio' | 'babble'
    this.jaw = 0;
    this.wide = 0;
    this.pucker = 0;
    this._shape = CLOSED;          // the current letter's target shape
    this._amp = 1;
    this._shapeT = 0;
    this.analyser = null;
    this._timeData = null;
    this._freqData = null;
    this.babble = 1;               // babble speed
    this.muted = false;            // someone else is talking: the mouth stays shut
    this._peak = AUDIO_PEAK;

    // the eyes
    this.blink = 0;
    this._nextBlink = 1 + Math.random() * 2;
    this._blinkT = -1;
  }

  setPreset(name, snap = false) {
    this.preset = PRESETS[name] || PRESETS.neutral;
    if (snap) for (const k of Object.keys(this.expr)) this.expr[k] = this.preset[k] ?? 0;
  }

  // ------------------------------------------------------------------ text-driven
  // Start lip-syncing to revealed text; then say() each letter as it appears
  speakText() {
    this.mode = 'text';
    this._shape = CLOSED;
    this._shapeT = 0;
  }

  // A newly revealed letter: its mouth shape, with a little random size so it is not mechanical.
  // Spaces close the mouth a little; stops ('.', '?', '!', '-', ...) close it.
  say(ch) {
    if (this.mode !== 'text') this.speakText();
    const c = ch.toLowerCase();
    this._shapeT = 0;
    if (VISEME[c]) {
      this._shape = VISEME[c];
      this._amp = 0.75 + Math.random() * 0.4;
    } else if (c === ' ' || c === ',' || c === '\'' || c === '"') {
      this._shape = [Math.min(0.15, this._shape[0]), this._shape[1] * 0.5, this._shape[2] * 0.5];
    } else {
      this._shape = CLOSED;
    }
  }

  // ------------------------------------------------------------------ audio-driven
  // Lip-sync to a playing media element (falls back to resting if Web Audio is unavailable)
  attachAudio(el) {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      let src = sources.get(el);
      if (!src) {
        src = audioCtx.createMediaElementSource(el);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.3;
        src.connect(analyser);
        analyser.connect(audioCtx.destination);       // keep it audible
        src.analyser = analyser;
        sources.set(el, src);
      }
      this.analyser = src.analyser;
      this._timeData ||= new Uint8Array(this.analyser.fftSize);
      this._freqData ||= new Uint8Array(this.analyser.frequencyBinCount);
      this.mode = 'audio';
      this._peak = AUDIO_PEAK;
    } catch (e) {
      this.analyser = null;
    }
  }

  // Wordless talking (speed 1 = normal; faster when frantic)
  startBabble(speed = 1) {
    this.mode = 'babble';
    this.babble = speed;
  }

  // Back to resting: the mouth closes
  stopSpeaking() {
    this.mode = 'idle';
    this.analyser = null;
    this._shape = CLOSED;
  }

  // Look a little aside now and then (a tired, drifting gaze), radians of head turn
  drift(amount) {
    this._drift = amount;
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    if (!this.ok) return;
    this.time += dt;
    const p = this.preset;
    const k = 1 - Math.exp(-4 * dt);
    for (const key of Object.keys(this.expr)) this.expr[key] += ((p[key] ?? 0) - this.expr[key]) * k;

    this._mouth(dt);
    this._blink(dt);

    const e = this.expr;
    const jaw = Math.min(1, this.jaw * p.jaw);
    this._set('jaw_open', jaw);
    this._set('mouth_wide', this.wide * p.jaw);
    this._set('mouth_pucker', this.pucker * Math.min(1, p.jaw + 0.2));
    this._set('mouth_smile', e.smile * (1 - jaw * 0.6));
    this._set('mouth_frown', e.frown * (1 - jaw * 0.5));
    this._set('brow_up', Math.max(0, e.brow));
    this._set('brow_down', Math.max(0, -e.brow));
    // the lids: a blink closes them from wherever they rest (heavy, tired lids rest lower)
    const rest = Math.max(e.tired, p.lids);
    this._set('eyes_tired', rest * (1 - this.blink));
    this._set('blink', this.blink);
    const shut = jaw < 0.03 && this.pucker < 0.5;
    for (const s of this.seals) s.visible = shut;

    // head: breathing, a slow sway, the preset's bow and sag, a drifting gaze for the tired
    const t = this.time;
    this._gazeT += dt;
    if (this._drift && this._gazeT > 2.5 + Math.random() * 3) {
      this._gazeT = 0;
      this._gazeTarget = (Math.random() * 2 - 1) * this._drift;
    }
    this.gaze += (this._gazeTarget - this.gaze) * (1 - Math.exp(-1.5 * dt));
    const talk = this.mode === 'idle' ? 0 : 1;
    this.head.yaw = Math.sin(t * 0.37) * 0.035 * p.sway + this.gaze;
    this.head.pitch = e.bow + Math.sin(t * 0.9) * 0.012 + p.sag * (0.6 + 0.4 * Math.sin(t * 0.21))
      + talk * this.jaw * 0.04 * p.sway;
    this.head.roll = Math.sin(t * 0.29 + 1) * 0.02 * p.sway;
  }

  _set(name, value) {
    const s = this.slots[name];
    if (!s) return;
    for (const [inf, i] of s) inf[i] = value;
  }

  _mouth(dt) {
    let jaw = 0, wide = 0, pucker = 0;
    if (this.mode === 'audio' && this.analyser) {
      this.analyser.getByteTimeDomainData(this._timeData);
      let sum = 0;
      for (let i = 0; i < this._timeData.length; i++) {
        const v = (this._timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / this._timeData.length);
      this._peak = Math.max(AUDIO_PEAK_MIN, rms, this._peak * Math.exp(-dt / AUDIO_PEAK_DECAY));
      jaw = rms < this._peak * AUDIO_GATE ? 0 : Math.pow(clamp01(rms / (this._peak * 0.8)), 0.8);
      this.analyser.getByteFrequencyData(this._freqData);
      let low = 0, high = 0;
      for (let i = 2; i <= 12; i++) low += this._freqData[i];
      for (let i = 46; i <= 116; i++) high += this._freqData[i];
      const ratio = high / (low + high + 1);
      wide = jaw * smoothstep(0.35, 0.65, ratio) * 0.8;
      pucker = jaw * (1 - smoothstep(0.12, 0.35, ratio)) * 0.45;
    } else if (this.mode === 'text') {
      // a letter's shape holds briefly then relaxes toward closed, so a held stop shuts the mouth
      this._shapeT += dt;
      const fade = 1 - smoothstep(0.09, 0.22, this._shapeT);
      jaw = this._shape[0] * this._amp * fade;
      wide = this._shape[1] * fade;
      pucker = this._shape[2] * fade;
    } else if (this.mode === 'babble') {
      const t = this.time * this.babble;
      jaw = clamp01(0.3 + 0.4 * Math.sin(t * 11) * Math.sin(t * 3.1) + 0.2 * Math.sin(t * 17));
      wide = clamp01(0.5 * Math.sin(t * 5.3)) * jaw;
      pucker = clamp01(0.5 * Math.sin(t * 4.1 + 2)) * jaw * 0.6;
    }
    if (this.muted) jaw = wide = pucker = 0;
    // about 60-80 ms to settle: quick to open, a little slower to close
    const rate = jaw > this.jaw ? 26 : 15;
    const k = 1 - Math.exp(-rate * dt);
    this.jaw += (jaw - this.jaw) * k;
    this.wide += (wide - this.wide) * k;
    this.pucker += (pucker - this.pucker) * k;
  }

  _blink(dt) {
    const p = this.preset;
    this._nextBlink -= dt;
    if (this._nextBlink <= 0 && this._blinkT < 0) {
      this._blinkT = 0;
      this._nextBlink = p.blink[0] + Math.random() * (p.blink[1] - p.blink[0]);
    }
    if (this._blinkT >= 0) {
      this._blinkT += dt;
      // shut quickly, open more slowly (slower still when tired)
      const close = p.blinkLen * 0.35;
      this.blink = this._blinkT < close ? this._blinkT / close : 1 - smoothstep(close, p.blinkLen, this._blinkT);
      if (this._blinkT > p.blinkLen) {
        this._blinkT = -1;
        this.blink = 0;
      }
    }
  }
}
