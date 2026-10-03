// Sounds for the coolant hose, made with the Web Audio API (no sound files): the hiss while
// spraying, the crackle of water freezing, the crash of something shattering, a splash.

export class FrostAudio {
  constructor() {
    this.ctx = null;
  }

  // Browsers only allow sound after the player has clicked; call this from a click
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);

    // one second of white noise, reused by every sound
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // the hiss loops forever; its volume follows the trigger
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2600;
    band.Q.value = 0.7;
    this.hissGain = this.ctx.createGain();
    this.hissGain.gain.value = 0;
    src.connect(band).connect(this.hissGain).connect(this.master);
    src.start();
  }

  hiss(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.hissGain.gain.cancelScheduledValues(t);
    this.hissGain.gain.setTargetAtTime(on ? 0.22 : 0, t, on ? 0.03 : 0.08);
  }

  _burst(duration, type, freq, q, gain) {
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5, duration + 0.05);
  }

  _ping(freq, duration, gain) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  // Water locking into ice: a short bright crackle
  crackle() {
    if (!this.ctx) return;
    this._burst(0.12, 'highpass', 4500, 0.8, 0.35);
    this._ping(2400 + Math.random() * 1200, 0.08, 0.05);
  }

  // A robot or a block of ice smashing
  shatter() {
    if (!this.ctx) return;
    this._burst(0.35, 'highpass', 2500, 0.6, 0.7);
    this._burst(0.25, 'lowpass', 400, 0.8, 0.5);
    for (let i = 0; i < 5; i++) this._ping(1800 + Math.random() * 2600, 0.15 + Math.random() * 0.2, 0.06);
  }

  splash() {
    if (!this.ctx) return;
    this._burst(0.5, 'lowpass', 900, 0.5, 0.6);
  }

  hit() {
    if (!this.ctx) return;
    this._burst(0.15, 'lowpass', 300, 1.0, 0.8);
  }
}
