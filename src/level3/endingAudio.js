// Sound helpers for the ending after the confrontation: Scene B (SceneB.js) and the narration
// (EndingNarration.js). The voices go through the same chain as the confrontation's (Confrontation
// _startSound): each line through its own gain (VOICE_GAIN_DB), then one bus with a gentle
// compressor (-20 dB, 3:1), 1.5 dB of makeup and a limiter (-3 dB, 20:1), so every voice of the
// ending comes out at the same balance.

export const dbGain = (db) => Math.pow(10, db / 20);

// The dialogue bus into `out` (the destination, or a gain): returns { input, output }; the
// output's gain is the player's voice volume
export function voiceBus(ac, out, volume = 1) {
  const output = ac.createGain();
  output.gain.value = volume;
  output.connect(out);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 8;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const limit = ac.createDynamicsCompressor();
  limit.threshold.value = -3;
  limit.knee.value = 0;
  limit.ratio.value = 20;
  limit.attack.value = 0.001;
  limit.release.value = 0.08;
  const makeup = ac.createGain();
  makeup.gain.value = dbGain(1.5);
  comp.connect(makeup).connect(limit).connect(output);
  return { input: comp, output };
}

// Fetch and decode a recording (null if it is missing or will not decode: the dev server answers
// a missing file with its page)
export async function decode(ac, url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await ac.decodeAudioData(await r.arrayBuffer());
  } catch (e) {
    return null;
  }
}

// Where the speech is in a recording: its first and last 20 ms windows within 30 dB of the peak,
// and the pauses inside it (no such window for 0.25 s or more), all in seconds
export function speechShape(buffer) {
  const d = buffer.getChannelData(0), rate = buffer.sampleRate, win = Math.max(1, Math.round(rate * 0.02));
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const floor = peak * 0.0316;
  const on = [];
  for (let s = 0; s + win <= d.length; s += win) {
    let sum = 0;
    for (let i = s; i < s + win; i += 2) sum += d[i] * d[i];
    on.push(Math.sqrt(sum / (win / 2)) * Math.SQRT2 > floor);
  }
  const first = Math.max(0, on.indexOf(true)), last = on.lastIndexOf(true);
  const step = win / rate, pauses = [];
  for (let i = first, start = -1; i <= last; i++) {
    if (!on[i] && start < 0) start = i;
    if (on[i] && start >= 0) {
      if ((i - start) * step >= 0.25) pauses.push([start * step, i * step]);
      start = -1;
    }
  }
  return { start: first * step, end: Math.min(buffer.duration, (last + 1) * step + 0.05), pauses };
}
