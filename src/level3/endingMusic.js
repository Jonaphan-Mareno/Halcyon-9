// The music under the narration of the Save-ARIA ending (EndingNarration.js): a small waltz for a
// felt piano, written for this and drawn here, with no file. It starts alone, with only the left
// hand, under the Polaroid; the tune comes in, as a lullaby would; strings rise behind it under the
// families and his mother; for ARIA's trolling it goes up an octave and turns light on its feet; and
// it comes to rest on one rolled chord, on the crew photo.
//
// renderEndingMusic() draws it ahead of time, off the main thread (an OfflineAudioContext), fitted
// to the narration: the bars are stretched a little so its last chord lands on `rest`.
//   start, warm, light, rest, end: s on the narration's clock (see EndingNarration._timeline)
// Returns one AudioBuffer, from `start` to `end`, at a known loudness (MUSIC_RMS_DB).

const MUSIC_RMS_DB = -25;       // how loud it is drawn; the narrator is about -19 LUFS over it
const BAR = 2.6;                // s, about: 69 beats a minute, three to the bar
const FADE_OUT = 1.6;

// midi: F2 41, C3 48, F3 53, A3 57, C4 60, F4 65, A4 69, C5 72, F5 77
// One chord a bar: [the left hand's low note, then the two it rocks between]
const CHORDS = [
  [41, 60, 65], [40, 60, 67], [38, 62, 65], [45, 60, 64], [46, 62, 65], [45, 60, 65], [43, 62, 65], [48, 60, 64],
  [38, 62, 65], [46, 62, 65], [45, 60, 65], [40, 60, 67], [38, 62, 65], [46, 62, 65], [43, 62, 65], [48, 58, 64]
];
// The tune, bar by bar: [note, beat it starts on, beats it lasts]
const TUNE = [
  [[69, 0, 2], [72, 2, 1]], [[67, 0, 2], [69, 2, 0.5], [67, 2.5, 0.5]], [[65, 0, 2], [69, 2, 1]], [[64, 0, 3]],
  [[65, 0, 2], [67, 2, 1]], [[69, 0, 2], [72, 2, 1]], [[70, 0, 1.5], [69, 1.5, 0.5], [67, 2, 1]], [[67, 0, 3]],
  [[69, 0, 1], [74, 1, 2]], [[74, 0, 1], [72, 1, 1], [70, 2, 1]], [[72, 0, 2], [69, 2, 1]], [[67, 0, 3]],
  [[69, 0, 1], [74, 1, 1.5], [76, 2.5, 0.5]], [[77, 0, 2], [74, 2, 1]], [[72, 0, 1], [70, 1, 1], [67, 2, 1]], [[67, 0, 2], [70, 2, 1]]
];
const INTRO_BARS = 2;           // the left hand alone
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// A rolled F major, and the tune's last notes settling over it
const LAST_CHORD = [29, 41, 48, 53, 57, 60, 65, 69];

export async function renderEndingMusic(sampleRate, { start, warm, light, rest, end }) {
  const length = Math.ceil((end - start) * sampleRate);
  const ac = new OfflineAudioContext(2, length, sampleRate);
  const bars = Math.max(4, Math.round((rest - start) / BAR));
  const bar = (rest - start) / bars, beat = bar / 3;

  // the room: a long, soft tail of noise, the top of it darkening
  const hall = ac.createConvolver();
  hall.buffer = roomTail(ac, 2.8);
  const dry = ac.createGain();
  dry.gain.value = 0.78;
  const wet = ac.createGain();
  wet.gain.value = 0.42;
  dry.connect(ac.destination);
  hall.connect(wet).connect(ac.destination);
  const sends = [dry, hall];

  // felt on the strings: a warm tone, its highest partials quiet
  const real = new Float32Array(9), imag = new Float32Array([0, 1, 0.42, 0.2, 0.09, 0.05, 0.022, 0.012, 0.006]);
  const felt = ac.createPeriodicWave(real, imag);
  const piano = (midi, at, lasts, vel) => {
    const f = hz(midi);
    const pan = ac.createStereoPanner();
    pan.pan.value = Math.max(-0.45, Math.min(0.45, (midi - 60) / 40));
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.Q.value = 0.3;
    const bright = Math.min(7000, f * (2.5 + 5 * vel));
    low.frequency.setValueAtTime(bright, at);
    low.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.4), at + 1.8);
    const g = ac.createGain();
    // (low notes ring longer; a key lifted dies away quickly, but never at once: the pedal)
    const ring = 1.4 + 3.2 * Math.max(0, (84 - midi) / 50);
    const peak = vel * 0.34;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    g.gain.exponentialRampToValueAtTime(peak * 0.55, at + 0.28);
    g.gain.setTargetAtTime(0.0001, at + 0.28, ring / 3);
    const stop = at + lasts + 0.5;
    g.gain.setTargetAtTime(0.0001, stop, 0.5);
    for (const cents of [-2.2, 2.4]) {
      const o = ac.createOscillator();
      o.setPeriodicWave(felt);
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(low);
      o.start(at);
      o.stop(stop + 2.6);
    }
    low.connect(g).connect(pan);
    for (const s of sends) pan.connect(s);
  };

  // the strings behind the tune: slow, dark, swelling with a bar's chord
  const strings = (notes, at, lasts, level) => {
    if (level < 0.005) return;
    const low = ac.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 820;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + lasts * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, at + lasts + 0.7);
    for (const midi of notes) {
      for (const cents of [-7, 6]) {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = hz(midi);
        o.detune.value = cents;
        o.connect(low);
        o.start(at);
        o.stop(at + lasts + 0.8);
      }
    }
    low.connect(g);
    for (const s of sends) g.connect(s);
  };

  // The piece: the last `bars` bars of its sixteen, over and over, so its own cadence leads into the rest
  for (let i = 0; i < bars; i++) {
    const n = ((16 * 8 - bars + i) % 16 + 16) % 16;
    const at = i * bar;                         // (from the music's own start)
    const now = start + at;
    const warmth = smoothstep(warm - bar, warm + bar * 2, now);
    const playful = now >= light - 0.01 ? 1 : 0;
    const [root, a, b] = CHORDS[n];
    // the left hand: its low note, then rocking between the two (in the playful part, lifted off short)
    const hand = 0.42 + 0.12 * warmth - 0.1 * playful;
    piano(root, at, playful ? beat * 1.2 : bar * 1.3, hand);
    piano(a + (playful ? 12 : 0), at + beat, playful ? beat * 0.5 : beat * 1.6, hand * 0.62);
    piano(b + (playful ? 12 : 0), at + beat * 2, playful ? beat * 0.5 : beat * 1.3, hand * 0.62);
    // the tune
    if (i >= INTRO_BARS) {
      const entry = smoothstep(INTRO_BARS - 1, INTRO_BARS + 3, i);
      for (const [note, on, beats] of TUNE[n]) {
        const vel = (0.32 + 0.3 * entry + 0.14 * warmth) * (on === 0 ? 1 : 0.86);
        piano(note + (playful ? 12 : 0), at + on * beat, playful ? beats * beat * 0.7 : beats * beat, vel);
        // (with warmth, its octave below it, quietly: it fills the tune out)
        if (warmth > 0.4 && !playful) piano(note - 12, at + on * beat, beats * beat, vel * 0.32 * warmth);
      }
    }
    if (!playful) strings([root + 12, a, b], at, bar, 0.019 * warmth);
  }
  // the rest: the chord rolled up from the bottom, and two last notes settling
  const home = bars * bar;
  LAST_CHORD.forEach((m, i) => piano(m, home + i * 0.085, 8, 0.42 + 0.02 * i));
  piano(77, home + 1.6, 4, 0.34);
  piano(81, home + 3.0, 5, 0.26);
  strings([41 + 12, 60, 65, 69], home, 3.6, 0.012);

  const out = await ac.startRendering();
  level(out, sampleRate);
  return out;
}

function smoothstep(a, b, x) {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
}

function roomTail(ac, seconds) {
  const n = Math.ceil(ac.sampleRate * seconds), b = ac.createBuffer(2, n, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      // (a one-pole filter that closes as the tail goes on: the top dies first)
      const k = 0.5 - 0.42 * t;
      last += k * ((Math.random() * 2 - 1) - last);
      d[i] = last * Math.pow(1 - t, 3.2) * Math.min(1, i / (ac.sampleRate * 0.012));
    }
  }
  return b;
}

// To its loudness (over where it plays, the tail's silence left out), with a fade at the very end,
// and never over a safe peak
function level(buffer, rate) {
  const a = buffer.getChannelData(0), b = buffer.getChannelData(1), n = a.length;
  let sum = 0, peak = 0, on = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(Math.abs(a[i]), Math.abs(b[i]));
    peak = Math.max(peak, v);
    if (v > 1e-3) {
      sum += (a[i] * a[i] + b[i] * b[i]) / 2;
      on++;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, on));
  const gain = Math.min(Math.pow(10, MUSIC_RMS_DB / 20) / Math.max(1e-5, rms), 0.8 / Math.max(1e-5, peak));
  const fade = Math.floor(FADE_OUT * rate);
  for (let i = 0; i < n; i++) {
    const f = i > n - fade ? (n - i) / fade : 1;
    a[i] *= gain * f;
    b[i] *= gain * f;
  }
}
