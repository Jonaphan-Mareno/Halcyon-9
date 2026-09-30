// Sound effects synthesized in the browser with the Web Audio API, so they need
// no audio files (and nothing to license). ARIA's voice is separate: it is
// played from recordings by AriaManager.
//
// The generator hum is two slightly detuned saw waves through a low-pass
// filter. setHum(stress) raises its pitch, brightness and volume as the
// countdown runs down, so the tension can be heard.

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.hum = null;
  }

  // The AudioContext may only start after a user gesture; every call here
  // happens in response to the player, so it is safe to create lazily.
  _ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  // ---------------------------------------------------------
  // Generator hum (continuous while the puzzle is open)
  // ---------------------------------------------------------
  startHum() {
    const ctx = this._ensure();
    if (!ctx || this.hum) return;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 4;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'sawtooth';
    a.frequency.value = 55;
    b.frequency.value = 55.8; // slight detune: a beating, electrical buzz

    // A slow wobble on the volume, like mains ripple
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 6;
    lfoDepth.gain.value = 0.02;
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);

    a.connect(filter);
    b.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    a.start();
    b.start();
    lfo.start();

    gain.gain.setTargetAtTime(0.08, ctx.currentTime, 0.4);
    this.hum = { a, b, lfo, filter, gain };
  }

  // stress: 0 = calm, 1 = about to overload
  setHum(stress) {
    if (!this.hum) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0, stress));
    const freq = 55 + 70 * s * s;
    this.hum.a.frequency.setTargetAtTime(freq, t, 0.08);
    this.hum.b.frequency.setTargetAtTime(freq * 1.015, t, 0.08);
    this.hum.filter.frequency.setTargetAtTime(320 + 1400 * s, t, 0.08);
    this.hum.gain.gain.setTargetAtTime(0.08 + 0.07 * s, t, 0.1);
    this.hum.lfo.frequency.setTargetAtTime(6 + 14 * s, t, 0.1);
  }

  stopHum(fade = 0.25) {
    if (!this.hum) return;
    const { a, b, lfo, gain } = this.hum;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    const stopAt = t + fade * 2;
    a.stop(stopAt);
    b.stop(stopAt);
    lfo.stop(stopAt);
    this.hum = null;
  }

  // ---------------------------------------------------------
  // One-shot effects
  // ---------------------------------------------------------

  // A crackle of noise plus a falling buzz: a wrong plug, sparking
  zap() {
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;

    const length = Math.floor(ctx.sampleRate * 0.28);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2400;
    band.Q.value = 0.8;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.35, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    noise.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(this.master);
    noise.start(t);

    const buzz = ctx.createOscillator();
    buzz.type = 'square';
    buzz.frequency.setValueAtTime(420, t);
    buzz.frequency.exponentialRampToValueAtTime(70, t + 0.25);
    const buzzGain = ctx.createGain();
    buzzGain.gain.setValueAtTime(0.12, t);
    buzzGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    buzz.connect(buzzGain);
    buzzGain.connect(this.master);
    buzz.start(t);
    buzz.stop(t + 0.3);
  }

  // A heavy drop: the generator tripping and the lights dying
  blackout() {
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.1);
    this.zap();
  }

  // A short rising chime: a plug seated correctly
  connect() {
    this._tone([660, 880], 0.09, 0.12);
  }

  // A brighter rising arpeggio: the generator is back
  success() {
    this._tone([392, 523, 659, 784, 1047], 0.12, 0.2);
  }

  _tone(freqs, step, level) {
    const ctx = this._ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      const t = t0 + i * step;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(level, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + step * 3);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + step * 3 + 0.05);
    });
  }
}
