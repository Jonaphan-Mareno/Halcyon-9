import { settings } from '../core/Settings.js';

// Sound effects synthesized in the browser with the Web Audio API, so they need
// no audio files (and nothing to license). ARIA's voice is separate: it is
// played from recordings by AriaManager. Background music is one file per
// level from public/assets/audio, on its own bus (the Music slider, M, the
// pause menu, the dip under a voice); Level 3's music goes through that bus too.

//
// The generator hum is two slightly detuned saw waves through a low-pass
// filter. setHum(stress) raises its pitch, brightness and volume as the
// countdown runs down, so the tension can be heard.

// The song files live in public/assets/audio/ (Vite serves that folder at the
// site root). Each level has its own track: name the files to match, or edit
// the paths below.
const MUSIC_TRACKS = {
  l1: './assets/audio/Halcyon1(ver2).wav', // level 1: the control deck
  l2: './assets/audio/Halcyon2(ver2).wav',     // level 2: the habitat deck
};

// Loop shape: the song eases out over its last MUSIC_END_FADE seconds, the
// volume stays off for MUSIC_GAP seconds of silence, and the next loop eases
// back in over MUSIC_FADE_IN seconds (the same fade as the very first start).
// Switching to another track eases the old one out over MUSIC_CROSSFADE.
const MUSIC_END_FADE = 3;
const MUSIC_GAP = 30; // half a minute between loops: the room's own noise (its lights buzzing) carries the silence
const MUSIC_FADE_IN = 1.2;
const MUSIC_CROSSFADE = 3;
const MUSIC_BUS = 0.9;     // the same headroom as the effects' master
const MUSIC_DUCKED = 0.4;  // share of the volume left while someone speaks

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.hum = null;
    this.volume = 1;           // the player's effects volume (Options)
    this.musicVolume = settings.get('music');   // the player's music volume (Options)
    this.musicMuted = false;   // M, or a video with its own sound
    this.musicPaused = false;  // the pause menu is open: the music stops and picks up where it was
    this.musicDucked = false;
    window.addEventListener('aria-speaking', (e) => {
      this.musicDucked = !!e.detail;
      this._applyMusicBus();
    });
  }

  // The AudioContext may only start after a user gesture; every call here
  // happens in response to the player, so it is safe to create lazily.
  _ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9 * this.volume;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this._musicBusLevel();
      this.musicBus.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = 0.9 * v;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    this._applyMusicBus();
  }

  setMusicMuted(on) {
    this.musicMuted = on;
    this._applyMusicBus();
  }

  toggleMusicMute() {
    this.setMusicMuted(!this.musicMuted);
    return this.musicMuted;
  }

  setMusicPaused(on) {
    this.musicPaused = on;
    this._applyMusicBus();
    // (in the silence between loops there is nothing to hold: its timer starts the next one)
    const m = this.music;
    if (!m || m.gapTimer) return;
    if (on) m.el.pause();
    else m.el.play().catch(() => {});
  }

  _musicBusLevel() {
    if (this.musicMuted || this.musicPaused) return 0;
    return MUSIC_BUS * this.musicVolume * (this.musicDucked ? MUSIC_DUCKED : 1);
  }

  _applyMusicBus() {
    if (!this.musicBus) return;
    this.musicBus.gain.setTargetAtTime(this._musicBusLevel(), this.ctx.currentTime, this.musicPaused ? 0.02 : 0.15);
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
  // Background music (one file per level, looped with an end fade and a pause)
  // ---------------------------------------------------------

  // Starts the asked-for track: asking for the one already playing is a
  // no-op (so every pointer-lock click can call this), while asking for a
  // different track crossfades to it — the lift out of level 1 swaps songs
  // that way. `track` is a MUSIC_TRACKS key ('l1', 'l2') or a raw file path.
  // Browsers refuse to play audio until a user gesture, which is why the
  // game calls this from lockControls.
  startMusic(track = 'l1', volume = 0.1) {
    const ctx = this._ensure();
    if (!ctx) return;
    const path = MUSIC_TRACKS[track] || track;
    if (this.music) {
      if (this.music.path === path) return; // already playing this track
      this.stopMusic(MUSIC_CROSSFADE); // ease the old track out under the new
    }

    const el = new Audio(path);
    el.preload = 'auto';

    // Route the element through the graph so the fades below work and the
    // music obeys the music bus.
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(this.musicBus);

    const music = { el, gain, path, gapTimer: null, fading: false };
    this.music = music;

    const fadeIn = () => {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(gain.gain.value, t);
      gain.gain.setTargetAtTime(volume, t, MUSIC_FADE_IN);
    };

    // The element does not loop by itself: over the song's last seconds the
    // volume eases to zero, and once it ends a gap of silence is waited out
    // before the next loop fades back in. `left` is re-measured on every
    // tick, so the fade stays anchored to the song's real end.
    el.addEventListener('timeupdate', () => {
      if (music !== this.music || music.fading) return;
      const left = (el.duration || Infinity) - el.currentTime;
      if (left <= MUSIC_END_FADE) {
        music.fading = true;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, Math.max(left, 0.1) / 3);
      }
    });

    el.addEventListener('ended', () => {
      if (music !== this.music) return; // stopped meanwhile
      music.gapTimer = setTimeout(() => {
        music.gapTimer = null;
        if (music !== this.music) return;
        music.fading = false;
        el.currentTime = 0;
        if (!this.musicPaused) el.play().catch(() => {}); // already gesture-unlocked; keep looping
        fadeIn();
      }, MUSIC_GAP * 1000);
    });

    const begin = () => {
      el.play().catch(() => {
        // Autoplay refused: park it and let the next click try again.
        el.pause();
        this.music = null;
      });
      fadeIn();
    };

    // The context may still be resuming right after the gesture; wait for it.
    if (ctx.state === 'suspended') ctx.resume().then(begin);
    else begin();
  }

  // Fades the music out and pauses it; a later startMusic starts fresh.
  stopMusic(fade = 5) {
    if (!this.music) return;
    const { el, gain, gapTimer } = this.music;
    if (gapTimer) clearTimeout(gapTimer); // no loop restart after a stop
    this.music = null;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    setTimeout(() => el.pause(), fade * 1000 + 100);
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

  // A light switch-like click: a circuit tile turning
  tick() {
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.05);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  // A heavy mechanical clunk: a relay ring locking into its next position
  clunk() {
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(130, t);
    thud.frequency.exponentialRampToValueAtTime(45, t + 0.2);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.55, t);
    thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    thud.connect(thudGain);
    thudGain.connect(this.master);
    thud.start(t);
    thud.stop(t + 0.3);

    // A short metallic ring on top
    const ping = ctx.createOscillator();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(740, t);
    const pingGain = ctx.createGain();
    pingGain.gain.setValueAtTime(0.0001, t);
    pingGain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    ping.connect(pingGain);
    pingGain.connect(this.master);
    ping.start(t);
    ping.stop(t + 0.4);
  }

  // A rising sweep with a thump: the relay engaging and the power surging back
  surge() {
    const ctx = this._ensure();
    if (!ctx) return;
    const t = ctx.currentTime;

    const sweep = ctx.createOscillator();
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(60, t);
    sweep.frequency.exponentialRampToValueAtTime(900, t + 2.6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + 2.6);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
    sweep.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    sweep.start(t);
    sweep.stop(t + 3.1);

    this.clunk();
    setTimeout(() => this.success(), 2400);
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
