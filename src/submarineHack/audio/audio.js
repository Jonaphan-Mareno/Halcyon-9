let audioContext = null;
let masterGain = null;

function getAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0.24;
  masterGain.connect(audioContext.destination);
  return audioContext;
}

function tone({ frequency, endFrequency = frequency, duration, wave = "sine", volume = 0.3, delay = 0 }) {
  const context = getAudioContext();
  if (!context || !masterGain) return;
  if (context.state === "suspended") context.resume().catch(() => {});

  const startAt = context.currentTime + delay;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), startAt + duration);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.linearRampToValueAtTime(volume, startAt + Math.min(0.018, duration * 0.2));
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(envelope);
  envelope.connect(masterGain);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.015);
}

export const sfx = {
  unlock() {
    const context = getAudioContext();
    if (context?.state === "suspended") context.resume().catch(() => {});
  },
  ping() {
    tone({ frequency: 930, endFrequency: 560, duration: 0.22, wave: "sine", volume: 0.24 });
    tone({ frequency: 1395, endFrequency: 980, duration: 0.14, wave: "triangle", volume: 0.12, delay: 0.035 });
  },
  capture() {
    tone({ frequency: 392, endFrequency: 523, duration: 0.14, wave: "triangle", volume: 0.2 });
    tone({ frequency: 587, endFrequency: 784, duration: 0.2, wave: "sine", volume: 0.18, delay: 0.09 });
  },
  sever() {
    tone({ frequency: 150, endFrequency: 42, duration: 0.38, wave: "sawtooth", volume: 0.34 });
    tone({ frequency: 520, endFrequency: 95, duration: 0.24, wave: "square", volume: 0.1, delay: 0.025 });
  },
  victory() {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      tone({ frequency, endFrequency: frequency * 1.015, duration: 0.38, wave: "triangle", volume: 0.17, delay: index * 0.095 });
    });
  },
  defeat() {
    tone({ frequency: 220, endFrequency: 82, duration: 0.65, wave: "sawtooth", volume: 0.22 });
  },
};
