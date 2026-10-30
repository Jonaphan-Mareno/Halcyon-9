// The player's options (pause menu > Options), saved in the browser so they last between visits.
// Anything that depends on one listens with settings.onChange and applies it straight away.

const KEY = 'halcyon9.settings';

const DEFAULTS = {
  music: 0.8,         // 0 to 1: the soundtrack
  voice: 1,           // 0 to 1: ARIA's voice
  effects: 0.8,       // 0 to 1: sound effects (water, ice, the hum)
  sensitivity: 1,     // 0.3 to 2.5: mouse look speed
  difficulty: 'medium', // 'easy' | 'medium' | 'hard' | 'superHard' (see Difficulty.js)
  quality: 'auto',    // 'auto' | 'high' | 'medium' | 'low'
  fps: true           // the frame counter, top right
};

class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.listeners = new Set();
    this.difficultyLocked = false;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const k of Object.keys(DEFAULTS)) if (typeof saved[k] === typeof DEFAULTS[k]) this.values[k] = saved[k];
    } catch (e) { /* private window or blocked storage: the defaults will do */ }
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (key === 'difficulty' && this.difficultyLocked) return;
    if (!(key in DEFAULTS) || this.values[key] === value) return;
    this.values[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch (e) { /* not saved */ }
    for (const fn of this.listeners) fn(key, value);
  }

  reset() {
    for (const [k, v] of Object.entries(DEFAULTS)) this.set(k, v);
  }

  // A permadeath run keeps its rules until the player returns to the title (a page reload).
  lockDifficulty() {
    this.difficultyLocked = true;
  }

  // fn(key, value) is called whenever an option changes
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const settings = new Settings();
export { DEFAULTS };
