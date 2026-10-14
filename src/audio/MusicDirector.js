// The game's score, made in the browser with the Web Audio API (like AudioManager's sound
// effects: no audio files to download or license, and a few kilobytes of code instead of
// megabytes of music on the school server).
//
// It is one slow, dark bed of sound that the game steers by MOOD:
//
//   calm      the normal background: a low drone, a breath of air through the vents, water
//             dripping somewhere, now and then the hull groaning deep down. Ominous, unhurried.
//   uneasy    the same with a half-step clash in the drone: something is wrong
//   pressure  adds a heartbeat and a rising string cluster; setIntensity(0..1) speeds it up
//             and brightens it (the generator countdown, the drones)
//   angry     ARIA has dropped the mask: harsh distorted cluster and a fast pulse
//   dread     the flooded levels: deeper, muffled, a rumble underneath
//   silence   nearly everything fades out. Silence is a tool, used on purpose.
//
// and by SCENE, where Voss is (setScene): 'open' (a big space: air and drips), 'upstairs' (quieter,
// fewer drips), 'lab' (the organism's electrical hum), 'room' (a small closed room: near silence).
//
// stinger(name) plays one-shot hits on top ('snap', 'reveal', 'relief', 'falseVictory').
// While ARIA speaks, the music ducks so her voice is clear (see the 'aria-speaking' event
// dispatched by AriaManager).

const MOODS = {
  //            drone  clash  air    drip [min,max] s  groan [min,max] s  pulse  tension  grit  muffle
  calm:     { drone: 0.10, clash: 0.00, air: 0.030, drip: [2.5, 7],  creak: [30, 60], pulse: 0, tension: 0.00, grit: 0, muffle: 3200 },
  uneasy:   { drone: 0.11, clash: 0.05, air: 0.040, drip: [3, 8],    creak: [20, 40], pulse: 0, tension: 0.00, grit: 0, muffle: 2800 },
  pressure: { drone: 0.12, clash: 0.06, air: 0.050, drip: [0, 0],    creak: [16, 30], pulse: 1, tension: 0.04, grit: 0, muffle: 3600 },
  angry:    { drone: 0.15, clash: 0.11, air: 0.060, drip: [0, 0],    creak: [10, 20], pulse: 2, tension: 0.13, grit: 1, muffle: 5000 },
  dread:    { drone: 0.14, clash: 0.04, air: 0.075, drip: [1.5, 4],  creak: [10, 20], pulse: 0, tension: 0.02, grit: 0, muffle: 1000 },
  silence:  { drone: 0.004, clash: 0.00, air: 0.004, drip: [0, 0],   creak: [0, 0],   pulse: 0, tension: 0.00, grit: 0, muffle: 1500 }
};

// where Voss is: how much of each layer the place has (multiplies the mood's levels)
const SCENES = {
  open:     { drone: 1.0, air: 1.0, drip: 1.0, hum: 0 },
  upstairs: { drone: 0.9, air: 0.7, drip: 0.4, hum: 0 },
  lab:      { drone: 0.8, air: 0.6, drip: 0.2, hum: 1 },
  room:     { drone: 0.6, air: 0.4, drip: 0, hum: 0 }
};

// root note of the drone (Hz) per level: each level sits a little lower and colder
const ROOTS = { 1: 55, 2: 49, 3: 41.2 };

const VOLUME = 0.5;
const DUCKED = 0.28;
const rand = (a, b) => a + Math.random() * (b - a);

export class MusicDirector {
  constructor() {
    this.ctx = null;
    this.mood = 'calm';
    this.scene = 'open';
    this.level = 1;
    this.intensity = 0;
    this.muted = false;
    this._ducked = false;
    this._timer = null;
    this._nextDrip = 0;
    this._nextCreak = 0;
    this._nextBeat = 0;
    this._onSpeaking = (e) => this.duck(!!e.detail);
  }

  // Browsers only start sound after a click or key press: call this from one
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    const t = ctx.currentTime;

    // output: music bus -> gentle compressor -> speakers
    this.bus = ctx.createGain();
    this.bus.gain.value = this.muted ? 0 : VOLUME;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    this.muffle = ctx.createBiquadFilter();       // everything passes through one low-pass
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = MOODS.calm.muffle;
    this.muffle.connect(this.bus);
    this.bus.connect(comp);
    comp.connect(ctx.destination);

    // a shared reverb (a decaying noise tail) so drips and groans sit in a big empty space
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.9;
    this.reverb.connect(wet);
    wet.connect(this.muffle);

    // one second of noise, looped by the air layer and cut up for creaks and breaths
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // --- the drone: a sine and a triangle a fifth apart, a sub an octave down, and a half-step
    // "clash" that fades in when things get uneasy. A slow low-pass sweep keeps it breathing.
    const root = ROOTS[this.level];
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 2;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.muffle);
    this.droneGain.connect(this.reverb);
    this.voices = {
      root: this._osc('sine', root, this.droneFilter, 1.0),
      fifth: this._osc('triangle', root * 1.498, this.droneFilter, 0.55),
      sub: this._osc('sine', root / 2, this.droneFilter, 0.9),
      shimmer: this._osc('triangle', root * 2.003, this.droneFilter, 0.18)
    };
    this.clashGain = ctx.createGain();
    this.clashGain.gain.value = 0;
    this.clashGain.connect(this.muffle);
    this.clashGain.connect(this.reverb);
    this.voices.clashA = this._osc('sine', root * 2 * 1.0595, this.clashGain, 1);
    this.voices.clashB = this._osc('sine', root * 2 * 1.0595 * 1.5, this.clashGain, 0.5);
    const sweep = ctx.createOscillator();
    const sweepDepth = ctx.createGain();
    sweep.frequency.value = 0.045;
    sweepDepth.gain.value = 90;
    sweep.connect(sweepDepth);
    sweepDepth.connect(this.droneFilter.frequency);
    sweep.start(t);
    this._sweep = sweep;

    // --- air: a soft band of noise, like ventilation, that slowly rises and falls
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 520;
    airFilter.Q.value = 0.6;
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    air.connect(airFilter);
    airFilter.connect(this.airGain);
    this.airGain.connect(this.muffle);
    air.start(t);
    const airLfo = ctx.createOscillator();
    const airDepth = ctx.createGain();
    airLfo.frequency.value = 0.07;
    airDepth.gain.value = 260;
    airLfo.connect(airDepth);
    airDepth.connect(airFilter.frequency);
    airLfo.start(t);
    this._airFilter = airFilter;

    // --- tension: a cluster of detuned saws that swells under pressure (a string-like rising
    // wall), with a fast tremolo; for 'angry' it is also pushed through a waveshaper
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tensionFilter = ctx.createBiquadFilter();
    this.tensionFilter.type = 'lowpass';
    this.tensionFilter.frequency.value = 500;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = this._distortion(0.0);
    this.gritMix = ctx.createGain();
    this.gritMix.gain.value = 0;
    // the tremolo scales the layer (gain 0.75 +/- 0.25), so it is silent whenever the layer is
    this.tremGain = ctx.createGain();
    this.tremGain.gain.value = 0.75;
    this.tensionFilter.connect(this.tremGain);
    this.tremGain.connect(this.tensionGain);
    this.tensionGain.connect(this.muffle);
    this.tensionGain.connect(this.shaper);
    this.shaper.connect(this.gritMix);
    this.gritMix.connect(this.muffle);
    for (const [ratio, detune] of [[2, -9], [2.12, 7], [3.0, -4], [4.24, 12]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = root * ratio;
      o.detune.value = detune;
      o.connect(this.tensionFilter);
      o.start(t);
      this.voices['tension' + ratio] = o;
    }
    const trem = ctx.createOscillator();
    const tremDepth = ctx.createGain();
    trem.frequency.value = 5.5;
    tremDepth.gain.value = 0.25;
    trem.connect(tremDepth);
    tremDepth.connect(this.tremGain.gain);
    trem.start(t);

    // --- hum: the lab's electrical organism, a mains-like 120 Hz with a faint buzz on top that
    // swells and fades slowly
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.muffle);
    // (the swell scales the hum, 0.8 +- 0.2, so it is silent wherever the hum is off)
    const humSwell = ctx.createGain();
    humSwell.gain.value = 0.8;
    humSwell.connect(this.humGain);
    this._osc('sine', 120, humSwell, 1);
    this._osc('sine', 240, humSwell, 0.35);
    const buzzFilter = ctx.createBiquadFilter();
    buzzFilter.type = 'bandpass';
    buzzFilter.frequency.value = 900;
    buzzFilter.Q.value = 3;
    buzzFilter.connect(humSwell);
    this._osc('sawtooth', 60, buzzFilter, 0.12);
    const humLfo = ctx.createOscillator();
    const humDepth = ctx.createGain();
    humLfo.frequency.value = 0.2;
    humDepth.gain.value = 0.2;
    humLfo.connect(humDepth);
    humDepth.connect(humSwell.gain);
    humLfo.start(t);

    window.addEventListener('aria-speaking', this._onSpeaking);
    // if the page started it without a click, the first click or key press wakes it
    if (ctx.state !== 'running') {
      const wake = () => ctx.resume();
      window.addEventListener('pointerdown', wake, { once: true });
      window.addEventListener('keydown', wake, { once: true });
    }
    this._timer = setInterval(() => this._tick(), 200);
    this._apply(0.1);
  }

  _osc(type, freq, dest, level) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = level;
    o.connect(g);
    g.connect(dest);
    o.start();
    return { o, g };
  }

  _impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  _distortion(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    const k = 1 + amount * 40;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * k);
    }
    return curve;
  }

  // ---------------------------------------------------------
  // Steering
  // ---------------------------------------------------------

  setMood(mood) {
    if (!MOODS[mood] || mood === this.mood) return;
    this.mood = mood;
    if (this.ctx) {
      this._apply(1.6);
      const now = this.ctx.currentTime;
      this._nextDrip = now + 1;
      this._nextCreak = now + 6;
      if (mood === 'angry') this.shaper.curve = this._distortion(1);
    }
  }

  // Where Voss is ('open', 'upstairs', 'lab', 'room'): the background changes with the place
  setScene(scene) {
    if (!SCENES[scene] || scene === this.scene) return;
    this.scene = scene;
    if (this.ctx) this._apply(2.5);
  }

  // 0..1: how hard the pressure is pushing (the heartbeat speeds up, the strings brighten)
  setIntensity(value) {
    this.intensity = Math.min(1, Math.max(0, value));
    if (this.ctx) this._applyIntensity();
  }

  // Each level sits on its own root note (they glide there, so a lift ride changes the key)
  setLevel(level) {
    if (!ROOTS[level] || level === this.level) return;
    this.level = level;
    if (!this.ctx) return;
    const root = ROOTS[level];
    const now = this.ctx.currentTime;
    const ratios = { root: 1, fifth: 1.498, sub: 0.5, shimmer: 2.003, clashA: 2 * 1.0595, clashB: 2 * 1.0595 * 1.5 };
    for (const [name, ratio] of Object.entries(ratios)) this.voices[name].o.frequency.setTargetAtTime(root * ratio, now, 3);
    for (const ratio of [2, 2.12, 3.0, 4.24]) this.voices['tension' + ratio].frequency.setTargetAtTime(root * ratio, now, 3);
  }

  duck(on) {
    this._ducked = on;
    if (!this.ctx || this.muted) return;
    this.bus.gain.setTargetAtTime(on ? DUCKED : VOLUME, this.ctx.currentTime, 0.25);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.bus.gain.setTargetAtTime(this.muted ? 0 : (this._ducked ? DUCKED : VOLUME), this.ctx.currentTime, 0.15);
    return this.muted;
  }

  _apply(seconds) {
    const m = MOODS[this.mood];
    const sc = SCENES[this.scene];
    const now = this.ctx.currentTime;
    const tau = seconds / 3;
    this.droneGain.gain.setTargetAtTime(m.drone * sc.drone, now, tau);
    this.clashGain.gain.setTargetAtTime(m.clash, now, tau);
    this.airGain.gain.setTargetAtTime(m.air * sc.air, now, tau);
    this.humGain.gain.setTargetAtTime(this.mood === 'silence' ? 0 : 0.018 * sc.hum, now, tau);
    this.gritMix.gain.setTargetAtTime(m.grit * 0.07, now, tau);
    this.muffle.frequency.setTargetAtTime(m.muffle, now, tau);
    // deeper levels' drone filter is darker still
    this.droneFilter.frequency.setTargetAtTime(this.mood === 'dread' ? 150 : 260, now, tau);
    this._applyIntensity();
  }

  _applyIntensity() {
    const m = MOODS[this.mood];
    const now = this.ctx.currentTime;
    this.tensionGain.gain.setTargetAtTime(m.tension * (0.55 + 0.9 * this.intensity), now, 0.4);
    this.tensionFilter.frequency.setTargetAtTime(420 + 1900 * this.intensity + (m.grit ? 700 : 0), now, 0.4);
  }

  // ---------------------------------------------------------
  // The slow scheduler (every 200 ms): drips, groans and the heartbeat
  // ---------------------------------------------------------

  _tick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const m = MOODS[this.mood];

    const dripRate = SCENES[this.scene].drip;
    if (m.drip[1] > 0 && dripRate > 0 && now >= this._nextDrip) {
      this._drip();
      this._nextDrip = now + rand(m.drip[0], m.drip[1]) / dripRate;
    }
    if (m.creak[1] > 0 && now >= this._nextCreak) {
      this._creak();
      this._nextCreak = now + rand(m.creak[0], m.creak[1]);
    }
    if (m.pulse > 0 && now >= this._nextBeat) {
      this._heartbeat(m.pulse === 2 ? 0.34 : 0.2 + 0.14 * this.intensity);
      // calm pressure: ~66 beats a minute, up to ~120 at full intensity; angry is a fast 132
      const bpm = m.pulse === 2 ? 132 : 66 + 54 * this.intensity;
      this._nextBeat = now + 60 / bpm;
    }
  }

  // a drop of water falling into a puddle somewhere: a quick falling "plop", mostly echo
  _drip() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f0 = rand(900, 1600);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.05);
    const g = ctx.createGain();
    const level = rand(0.02, 0.045);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    g.connect(this.reverb);
    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    g.connect(dry);
    dry.connect(this.muffle);
    o.start(t);
    o.stop(t + 0.12);
  }

  // the hull groaning deep under the sea: low noise through a band that slides down in pitch
  _creak() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = rand(2.8, 5);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 6;
    const start = rand(55, 120);
    f.frequency.setValueAtTime(start, t);
    f.frequency.exponentialRampToValueAtTime(start * rand(0.45, 0.7), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.muffle);
    g.connect(this.reverb);
    src.start(t, Math.random());
    src.stop(t + dur + 0.1);
  }

  // "lub-dub": two soft low thumps
  _heartbeat(level) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [delay, gain] of [[0, 1], [0.17, 0.7]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(78, t + delay);
      o.frequency.exponentialRampToValueAtTime(38, t + delay + 0.16);
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(level * gain, t + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.22);
      o.connect(g);
      g.connect(this.muffle);
      o.start(t + delay);
      o.stop(t + delay + 0.25);
    }
  }

  // ---------------------------------------------------------
  // One-shot hits on top of the bed
  // ---------------------------------------------------------

  stinger(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const root = ROOTS[this.level];
    const note = (type, freq, start, length, level, dest = this.muffle) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(0.0001, t + start);
      g.gain.exponentialRampToValueAtTime(level, t + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + start + length);
      o.connect(g);
      g.connect(dest);
      g.connect(this.reverb);
      o.start(t + start);
      o.stop(t + start + length + 0.05);
      return o;
    };
    switch (name) {
      case 'snap': {      // ARIA drops the mask: a clash of half-steps and a falling boom
        for (const r of [4, 4.2378, 6, 8.5]) note('sawtooth', root * r, 0, 1.6, 0.05);
        const boom = note('sine', root * 3, 0, 1.4, 0.4);
        boom.frequency.exponentialRampToValueAtTime(root * 0.6, t + 1.2);
        break;
      }
      case 'reveal': {    // a clue lands: a low hit and a held, unresolved chord
        const hit = note('sine', root * 2, 0, 1.2, 0.3);
        hit.frequency.exponentialRampToValueAtTime(root * 0.8, t + 0.9);
        for (const r of [4, 4.8, 5.34]) note('triangle', root * r, 0.1, 4, 0.045);
        break;
      }
      case 'relief': {    // two quiet rising notes: a puzzle done
        note('triangle', root * 8, 0, 2.4, 0.05);
        note('triangle', root * 12, 0.35, 3, 0.05);
        break;
      }
      case 'falseVictory': {   // a bright major chord swells, then sags flat: too cheerful to trust
        const notes = [8, 10, 12, 16].map((r, i) => note('triangle', root * 2 * r / 2, i * 0.12, 5, 0.06));
        for (const o of notes) o.frequency.exponentialRampToValueAtTime(o.frequency.value * 0.93, t + 5);
        break;
      }
    }
  }

  dispose() {
    window.removeEventListener('aria-speaking', this._onSpeaking);
    clearInterval(this._timer);
    this._timer = null;
    this.ctx?.close();
    this.ctx = null;
  }
}
