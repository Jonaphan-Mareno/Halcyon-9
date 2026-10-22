import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager.js';

// Level 3's sound: real recordings (CC0, see CREDITS.md) in public/assets/audio/sfx/l3/, played
// through Web Audio so they can sit in the world and be shaped by where Voss is.
//
//   - the drowned deck: a low rumble with water dripping (a loop), and round him, now and then, the
//     rusted hull creaking and groaning, pipes knocking and drips falling (one-shots placed in 3D
//     at random spots, at random pitches, so it never repeats the same way)
//   - the EVA prep room: the same, quieter, under the hum of its machines
//   - the water lock: water pouring in and bubbling up
//   - out in the sea: everything heard through water (a low-pass filter over the whole world), a
//     deep rumble, bubbles from his helmet as he breathes and from the thrusters as he swims
//   - the kraken: its roar, screams, growls and snapping jaws (pitched down: it is huge), its
//     tentacles' whoosh and the slam; loud and close when it lunges into his face. Its lair
//     echoes
//   - things he does: the suit going on (cloth, latches, the seal, air), grabbing kit (a game-like
//     pickup chime with a handle sound), doors and hatches (creaking, hydraulics), plugging in,
//     the harpoon (a pneumatic shot, the spear striking), being hit, the low-air beeps
//   - the fight's music: a sinister track (level3-kraken.ogg) creeping in muffled as he follows
//     the line into the cave, opening up when the kraken attacks, and a drum-driven layer
//     (level3-kraken-intense.ogg) rising on top as the fight gets worse. Both are in
//     public/assets/audio/music/ and can be swapped for her own files with the same names
//
// The effects follow the effects volume (Options), the music the music volume and M (mute); the
// music dips while ARIA speaks and under the kraken's roars.

const DIR = './assets/audio/sfx/l3/';
const MUSIC = { base: './assets/audio/music/level3-kraken.ogg', intense: './assets/audio/music/level3-kraken-intense.ogg' };
const FILES = [
  'deck-ambience', 'bubbles-loop', 'bubbles-soft', 'bubble-1', 'bubble-2', 'creak-1', 'creak-2', 'creak-3', 'creak-4',
  'groan-1', 'groan-2', 'drip-1', 'drip-2', 'drip-3', 'clank-1', 'clank-2', 'door-creak-1', 'door-creak-2', 'door-shut',
  'hatch-open', 'hatch-shut', 'latch', 'click', 'belt', 'cloth-1', 'cloth-2', 'cloth-3', 'seal', 'air-hiss', 'pickup',
  'confirm', 'error', 'tick', 'select', 'machine-hum', 'console', 'thruster', 'water-pour', 'whoosh', 'whoosh-2', 'slam',
  'hit-flesh', 'punch', 'rock-hit', 'harpoon', 'kraken-roar', 'kraken-scream-1', 'kraken-scream-2', 'kraken-growl-1',
  'kraken-growl-2', 'kraken-growl-3', 'kraken-roar-short', 'kraken-chomp', 'kraken-hiss'
];

// What each moment sounds like: layers of [file, options]. Options: vol, rate (pitch), delay (s),
// ui (heard in the helmet: not through the water), wet (echo send), rand (pitch wobble)
const CUES = {
  grab: [['pickup', { ui: true, vol: 0.55 }], ['belt', { vol: 0.9, delay: 0.05 }]],
  suitUp: [['cloth-1', { ui: true, vol: 0.9 }], ['cloth-2', { ui: true, vol: 0.9, delay: 0.35 }], ['cloth-3', { ui: true, delay: 0.7 }],
    ['latch', { ui: true, delay: 0.95, vol: 0.9 }], ['click', { ui: true, delay: 1.15 }], ['seal', { ui: true, delay: 1.3, vol: 0.55, rate: 0.8 }],
    ['air-hiss', { ui: true, delay: 1.6, vol: 0.45, rate: 0.8 }], ['confirm', { ui: true, delay: 2.2, vol: 0.5 }]],
  gateOpen: [['click', { vol: 0.8 }], ['door-creak-1', { rate: 0.55, vol: 1, delay: 0.2, wet: 0.4 }], ['groan-1', { rate: 0.45, vol: 0.7, delay: 1.0, wet: 0.5 }],
    ['clank-1', { rate: 0.75, vol: 0.9, delay: 3.4, wet: 0.5 }]],
  hatchOpen: [['latch', { vol: 0.8 }], ['hatch-open', { vol: 0.9, rate: 0.85, delay: 0.1, wet: 0.3 }]],
  hatchShut: [['hatch-shut', { vol: 0.9, rate: 0.85, wet: 0.3 }], ['clank-2', { delay: 1.2, rate: 0.85, vol: 0.8, wet: 0.4 }]],
  // the relay's door, held shut by the kraken: it shifts, the hull groans, something hisses
  doorStuck: [['latch', { vol: 0.8 }], ['clank-1', { rate: 0.7, delay: 0.1 }], ['groan-1', { rate: 0.4, vol: 0.8, delay: 0.2, wet: 0.5 }],
    ['kraken-hiss', { rate: 0.45, vol: 0.5, delay: 0.7, wet: 0.6 }]],
  hullStrain: [['groan-2', { rate: 0.35, vol: 0.6, wet: 0.6 }], ['creak-3', { rate: 0.5, vol: 0.5, delay: 0.4, wet: 0.5 }]],
  relayDoor: [['latch', { vol: 0.8 }], ['door-creak-2', { rate: 0.6, vol: 1, delay: 0.15, wet: 0.3 }], ['groan-2', { rate: 0.5, vol: 0.6, delay: 0.5, wet: 0.3 }],
    ['clank-2', { rate: 0.7, vol: 0.6, delay: 1.5 }]],
  plug: [['latch', { vol: 1 }], ['click', { delay: 0.12 }], ['console', { delay: 0.3, vol: 0.45, ui: true }]],
  signalBad: [['error', { ui: true, vol: 0.6 }], ['console', { ui: true, vol: 0.35, rate: 0.7, delay: 0.2 }]],
  signalGood: [['confirm', { ui: true, vol: 0.7 }], ['console', { ui: true, vol: 0.5, delay: 0.15 }], ['seal', { vol: 0.5, rate: 0.6, delay: 0.3 }]],
  uplink: [['console', { ui: true, vol: 0.5 }], ['select', { ui: true, vol: 0.5, delay: 0.6 }], ['select', { ui: true, vol: 0.5, delay: 1.3 }],
    ['confirm', { ui: true, vol: 0.7, delay: 2.4 }]],
  refill: [['air-hiss', { ui: true, vol: 0.7 }], ['confirm', { ui: true, vol: 0.5, delay: 1.0 }]],
  harpoon: [['harpoon', { vol: 1, rate: 0.85, ui: true, rand: 0.05 }], ['click', { ui: true, vol: 0.6 }]],
  reload: [['latch', { ui: true, vol: 0.35, rate: 1.3 }]],
  spearFlesh: [['hit-flesh', { vol: 1.2, rate: 0.8, rand: 0.1 }]],
  spearRock: [['rock-hit', { vol: 0.8, rand: 0.1 }]],
  hurt: [['punch', { ui: true, vol: 1, rand: 0.08 }], ['hit-flesh', { ui: true, vol: 0.7, rate: 0.6 }]],
  lowAir: [['tick', { ui: true, vol: 0.5, rate: 0.8 }]],
  // the kraken
  krakenRoar: [['kraken-roar', { rate: 0.82, vol: 1.6, wet: 0.6 }], ['kraken-growl-1', { rate: 0.45, vol: 1.1, delay: 0.1, wet: 0.5 }]],
  krakenGrowl: [['kraken-growl-2', { rate: 0.5, vol: 1.1, wet: 0.5, rand: 0.06 }]],
  krakenHiss: [['kraken-hiss', { rate: 0.5, vol: 0.9, wet: 0.6, rand: 0.08 }]],
  windup: [['kraken-growl-3', { rate: 0.55, vol: 1, wet: 0.4, rand: 0.08 }]],
  whoosh: [['whoosh', { rate: 0.45, vol: 1.1, rand: 0.1 }], ['whoosh-2', { rate: 0.4, vol: 0.6 }]],
  slam: [['slam', { vol: 1.4, wet: 0.5 }], ['clank-1', { rate: 0.5, vol: 0.6, delay: 0.05 }]],
  scream: [['kraken-scream-1', { rate: 0.55, vol: 1.4, wet: 0.6, rand: 0.06 }], ['kraken-growl-1', { rate: 0.4, vol: 0.9, delay: 0.15, wet: 0.5 }]],
  lungeRoar: [['kraken-roar', { rate: 0.95, vol: 2.2, wet: 0.3 }], ['kraken-roar-short', { rate: 0.5, vol: 1.8, wet: 0.3 }], ['whoosh', { rate: 0.35, vol: 1.2 }]],
  chomp: [['kraken-chomp', { rate: 0.5, vol: 1.6, rand: 0.1 }], ['clank-2', { rate: 0.45, vol: 0.4 }]],
  wounded: [['kraken-scream-2', { rate: 0.7, vol: 1.8, wet: 0.6 }], ['hit-flesh', { rate: 0.6, vol: 1.2 }]],
  beaten: [['kraken-roar', { rate: 0.6, vol: 1.8, wet: 0.8 }], ['kraken-scream-1', { rate: 0.4, vol: 1.2, delay: 1.2, wet: 0.8 }]]
};

// the deck's random sounds: which, how often (seconds between, min and max), how far off (metres)
const SCATTER = {
  deck: [
    { files: ['creak-1', 'creak-2', 'creak-3', 'creak-4'], every: [3, 8], dist: [3, 12], vol: 0.55, rate: [0.55, 0.9], wet: 0.5 },
    { files: ['groan-1', 'groan-2'], every: [9, 18], dist: [6, 16], vol: 0.35, rate: [0.3, 0.45], wet: 0.6 },
    { files: ['drip-1', 'drip-2', 'drip-3'], every: [0.8, 2.6], dist: [1.5, 8], vol: 0.45, rate: [0.8, 1.2], wet: 0.4 },
    { files: ['clank-1', 'clank-2'], every: [12, 24], dist: [8, 20], vol: 0.25, rate: [0.5, 0.7], wet: 0.7 }
  ],
  prep: [
    { files: ['creak-1', 'creak-2', 'creak-3'], every: [6, 13], dist: [3, 8], vol: 0.35, rate: [0.55, 0.85], wet: 0.4 },
    { files: ['drip-1', 'drip-2', 'drip-3'], every: [2, 5], dist: [2, 6], vol: 0.3, rate: [0.8, 1.2], wet: 0.3 }
  ],
  sea: [
    { files: ['groan-1', 'groan-2'], every: [10, 22], dist: [15, 35], vol: 0.3, rate: [0.25, 0.35], wet: 0.8 },
    { files: ['bubble-1', 'bubble-2'], every: [2, 6], dist: [3, 10], vol: 0.25, rate: [0.6, 1.0], wet: 0.3 }
  ]
};

const MUSIC_VOLUME = 0.55;

export class Level3Audio {
  constructor(session) {
    this.s = session;
    this.game = session.game;
    // (starting straight in Level 3, the game has no sound manager yet: it gets one here)
    session.game.audio ||= new AudioManager();
    this.ctx = session.game.audio._ensure();
    this.buffers = {};
    this.loops = {};
    this.time = 0;
    this.zone = null;
    this._next = {};
    this._paused = false;
    this.fight = { mode: 'off', intensity: 0, duck: 0 };
    this._v = new THREE.Vector3();
    this._f = new THREE.Vector3();
    if (!this.ctx) return;
    const ctx = this.ctx;
    // the buses: the world (through the water when he is outside), the helmet (never muffled),
    // the music; all through a compressor, so the kraken's roar in his face does not crack
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.comp.connect(session.game.audio.master);
    this.bus = ctx.createGain();
    this.bus.connect(this.comp);
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 20000;
    this.waterFilter.connect(this.bus);
    this.world = ctx.createGain();
    this.world.connect(this.waterFilter);
    this.helmet = ctx.createGain();
    this.helmet.connect(this.bus);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.world);
    // an echo for the hull and the cave: a convolver on a made-up decaying impulse
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.2, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.reverb.connect(this.wet);
    this.wet.connect(this.world);
    // the music: its own gain (the music volume), the base track through a filter that opens
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.comp);
    this.ready = this._load();
  }

  async _load() {
    const ctx = this.ctx;
    const get = async (url) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch {
        return null;
      }
    };
    await Promise.all(FILES.map(async (name) => { this.buffers[name] = await get(DIR + name + '.ogg'); }));
    [this.musicBase, this.musicIntense] = await Promise.all([get(MUSIC.base), get(MUSIC.intense)]);
  }

  // ------------------------------------------------------------------ playing
  // play a file once: at (world position, or null: in his head); returns its source
  play(name, { vol = 1, rate = 1, delay = 0, ui = false, wet = 0, rand = 0, at = null, loop = false, out = null } = {}) {
    const buf = this.buffers[name];
    if (!this.ctx || !buf) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * rand);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    src.__g = g;                         // (so a loop can be faded)
    let node = g;
    if (at) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = 3;
      p.rolloffFactor = 1.1;
      p.maxDistance = 80;
      p.positionX.value = at.x;
      p.positionY.value = at.y;
      p.positionZ.value = at.z;
      g.connect(p);
      node = p;
    }
    node.connect(out || (ui ? this.helmet : this.world));
    if (wet > 0 && !ui) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w);
      w.connect(this.reverb);
    }
    src.start(ctx.currentTime + delay);
    return src;
  }

  // a moment's sound (CUES), at a world position or in his head
  cue(name, at = null) {
    for (const [file, opts] of CUES[name] || []) this.play(file, { ...opts, at: opts.ui ? null : at });
    // (the music dips under its roars)
    if (/roar|scream|beaten|wounded/i.test(name)) this.fight.duck = 1.6;
  }

  // a sound that keeps going until it is stopped (by its name)
  startLoop(key, file, opts = {}) {
    if (this.loops[key] || !this.ctx) return;
    const src = this.play(file, { ...opts, loop: true, vol: 0 });
    if (!src) return;
    this.loops[key] = { src };
    this._fadeLoop(key, opts.vol ?? 1, 0.6);
  }

  stopLoop(key, fade = 0.8) {
    const l = this.loops[key];
    if (!l) return;
    this._fadeLoop(key, 0, fade);
    const src = l.src;
    setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, fade * 1000 + 100);
    delete this.loops[key];
  }

  _fadeLoop(key, to, seconds) {
    const g = this.loops[key]?.src.__g;
    if (!g) return;
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.setTargetAtTime(to, this.ctx.currentTime, seconds / 3);
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    if (!this.ctx || !this.buffers['deck-ambience']) return;
    this.time += dt;
    const ctx = this.ctx, t = ctx.currentTime;
    const cam = this.game.camera.instance;
    // the listener is his head
    const L = ctx.listener;
    cam.getWorldDirection(this._f);
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      L.forwardX.value = this._f.x; L.forwardY.value = this._f.y; L.forwardZ.value = this._f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    const prep = this.s.prep;
    const zone = prep?.zone || 'deck';
    const p = this.s.controls.position;
    const outside = zone === 'sea';
    const playing = this.game.state === 'PLAYING' && !this._paused;
    // everything quiet while paused
    this.bus.gain.setTargetAtTime(this._paused ? 0.15 : 1, t, 0.15);
    // through the water outside (and in the flooded lock)
    const inLock = prep && (prep.lock === 'flooding' || prep.lock === 'full' || prep.lock === 'outer') && zone === 'prep' && prep._inLock?.(p);
    this.waterFilter.frequency.setTargetAtTime(outside ? 900 : inLock ? 1600 : 20000, t, 0.3);
    this._ambience(zone, outside, p);
    if (playing) this._scatter(dt, zone, p);
    this._swimSounds(outside);
    this._lowAir(dt, prep);
    this._music(dt);
  }

  // the zone's own loops: the rumble and drips, the machines' hum, the deep sea
  _ambience(zone, outside, p) {
    if (zone !== this.zone) {
      this.zone = zone;
      if (!this.loops.amb) this.startLoop('amb', 'deck-ambience', { vol: 1, out: this.amb });
      if (zone === 'prep') this.startLoop('hum', 'machine-hum', { vol: 0.12, rate: 0.6 });
      else this.stopLoop('hum', 1.5);
      if (outside) this.startLoop('seaBubbles', 'bubbles-soft', { vol: 0.12, rate: 0.7 });
      else this.stopLoop('seaBubbles', 1.5);
    }
    // (outside, the rumble is slower and deeper: the same loop, pitched down)
    const amb = this.loops.amb?.src;
    if (amb) amb.playbackRate.setTargetAtTime(outside ? 0.55 : 1, this.ctx.currentTime, 1.0);
    this.amb.gain.setTargetAtTime(zone === 'deck' ? 0.85 : zone === 'prep' ? 0.45 : 0.9, this.ctx.currentTime, 1.2);
  }

  _scatter(dt, zone, p) {
    const list = SCATTER[zone] || [];
    list.forEach((sc, i) => {
      const key = zone + i;
      this._next[key] ??= rnd(sc.every[0], sc.every[1]) * 0.5;
      this._next[key] -= dt;
      if (this._next[key] > 0) return;
      this._next[key] = rnd(sc.every[0], sc.every[1]);
      const a = Math.random() * Math.PI * 2, d = rnd(sc.dist[0], sc.dist[1]);
      const at = this._v.set(p.x + Math.cos(a) * d, p.y + rnd(0.5, 3), p.z + Math.sin(a) * d);
      this.play(sc.files[Math.floor(Math.random() * sc.files.length)], { vol: sc.vol, rate: rnd(sc.rate[0], sc.rate[1]), at, wet: sc.wet });
    });
  }

  // the thrusters while he pushes through the water; a breath of bubbles is played by Swim
  _swimSounds(outside) {
    const c = this.s.controls;
    const on = outside && c.swimming && c.thrusting;
    if (on && !this.loops.thrust) this.startLoop('thrust', 'thruster', { vol: 0.28, rate: 0.55, ui: true });
    else if (!on && this.loops.thrust) this.stopLoop('thrust', 0.5);
  }

  breath() {
    this.play(Math.random() < 0.5 ? 'bubble-1' : 'bubble-2', { ui: true, vol: 0.5, rate: rnd(0.7, 1.0) });
    this.play('bubbles-loop', { ui: true, vol: 0.18, rate: rnd(0.8, 1.1) });
  }

  // low air: a beep every second under a quarter
  _lowAir(dt, prep) {
    if (!prep?.breathing || prep.oxygen > 60 || prep.oxygen <= 0) return;
    this._airT = (this._airT || 0) - dt;
    if (this._airT <= 0) {
      this._airT = prep.oxygen < 25 ? 0.5 : 1.0;
      this.cue('lowAir');
    }
  }

  // ------------------------------------------------------------------ the fight's music
  // mode: 'off', 'dread' (following the line in: muffled, creeping), 'fight', 'over' (fading out)
  setFight(mode) {
    if (!this.ctx || this.fight.mode === mode) return;
    this.fight.mode = mode;
    if (mode !== 'off' && !this._musicOn && this.musicBase) this._startMusic();
  }

  // 0..1: how bad the fight is (wounds, his health, a lunge)
  setIntensity(v) {
    this.fight.intensity = Math.max(0, Math.min(1, v));
  }

  _startMusic() {
    const ctx = this.ctx;
    this._musicOn = true;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 300;
    this.musicFilter.connect(this.music);
    this.baseGain = ctx.createGain();
    this.baseGain.gain.value = 0;
    this.baseGain.connect(this.musicFilter);
    const base = ctx.createBufferSource();
    base.buffer = this.musicBase;
    base.loop = true;
    base.connect(this.baseGain);
    base.start();
    this.intenseGain = ctx.createGain();
    this.intenseGain.gain.value = 0;
    this.intenseGain.connect(this.music);
    if (this.musicIntense) {
      const top = ctx.createBufferSource();
      top.buffer = this.musicIntense;
      top.loop = true;
      top.connect(this.intenseGain);
      top.start();
      this._musicSrc = [base, top];
    } else this._musicSrc = [base];
  }

  _music(dt) {
    const m = this.game.music;
    const t = this.ctx.currentTime;
    this.fight.duck = Math.max(0, this.fight.duck - dt);
    const user = m ? (m.muted ? 0 : m.volume) * (m.ducked ? 0.5 : 1) * (m.paused ? 0.3 : 1) : 1;
    const duck = this.fight.duck > 0 ? 0.45 : 1;
    this.music.gain.setTargetAtTime(MUSIC_VOLUME * user * duck, t, this.fight.duck > 0 ? 0.08 : 0.5);
    if (!this._musicOn) return;
    const f = this.fight;
    let base = 0, cut = 300, top = 0;
    if (f.mode === 'dread') {
      // creeping in as he nears the lair (the session sets intensity by how near he is)
      base = 0.35 + 0.45 * f.intensity;
      cut = 250 + 900 * f.intensity;
    } else if (f.mode === 'fight') {
      base = 0.85;
      cut = 16000;
      top = 0.15 + 0.85 * f.intensity;
    }
    this.baseGain.gain.setTargetAtTime(base, t, f.mode === 'over' ? 2.5 : 1.0);
    this.intenseGain.gain.setTargetAtTime(top, t, f.mode === 'over' ? 2.0 : 1.5);
    this.musicFilter.frequency.setTargetAtTime(cut, t, f.mode === 'fight' ? 0.8 : 2.0);
    if (f.mode === 'over' && !this._musicStopping) {
      this._musicStopping = true;
      setTimeout(() => {
        for (const s of this._musicSrc || []) { try { s.stop(); } catch { /* stopped */ } }
        this._musicOn = false;
        this._musicStopping = false;
      }, 9000);
    }
  }

  // the kraken and the line: is the session's music (the Soundtrack) to keep quiet
  get musicBusy() {
    return this.fight.mode === 'dread' || this.fight.mode === 'fight';
  }

  setPaused(on) {
    this._paused = on;
  }

  dispose() {
    for (const key of Object.keys(this.loops)) this.stopLoop(key, 0.2);
    for (const s of this._musicSrc || []) { try { s.stop(); } catch { /* stopped */ } }
    try { this.comp?.disconnect(); } catch { /* gone */ }
  }
}

function rnd(a, b) {
  return a + Math.random() * (b - a);
}

// a reverb's impulse: noise dying away over `seconds` (decay: how fast), slightly different each side
function impulse(ctx, seconds, decay) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return buf;
}
