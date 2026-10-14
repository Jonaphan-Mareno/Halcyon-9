// The background music: your own audio files, looped, cross-fading as the game changes.
//
// Drop mp3 files into public/assets/audio/music/ with these names (any that are missing are
// simply silent, so the game runs with none of them):
//
//   level1.mp3          Level 1, all the way through
//   level1-tense.mp3    Level 1's generator puzzle (falls back to level1.mp3 if missing)
//   level2.mp3          Level 2, exploring
//   level2-fight.mp3    Level 2's garden drone fight (falls back to level2.mp3 if missing)
//
// The music dips while ARIA speaks, goes quiet on death, and M mutes it.

const DIR = './assets/audio/music/';
const VOLUME = 0.45;          // overall music volume (0 to 1)
const DUCKED = 0.4;           // share of the volume left while ARIA speaks
const FADE_SECONDS = 2.5;     // cross-fade between tracks
const TICK = 0.1;             // seconds between volume steps

export class Soundtrack {
  constructor() {
    this.level = 1;
    this.mood = 'calm';
    this.muted = false;
    this.ducked = false;
    this.tracks = {};          // name -> { el, vol, missing }
    window.addEventListener('aria-speaking', (e) => { this.ducked = !!e.detail; });
    setInterval(() => this._tick(), TICK * 1000);
  }

  setLevel(level) {
    this.level = level;
  }

  // The game's mood (see Game._steerMusic): 'pressure' plays the tense or fight track, 'silence'
  // fades everything out, anything else plays the level's own track
  setMood(mood) {
    this.mood = mood;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _track(name) {
    let t = this.tracks[name];
    if (!t) {
      const el = new Audio(DIR + name + '.mp3');
      el.loop = true;
      el.volume = 0;
      t = this.tracks[name] = { el, vol: 0, missing: false };
      el.addEventListener('error', () => { t.missing = true; });
    }
    return t;
  }

  // Which track should be playing now (null for none)
  _wanted() {
    if (this.mood === 'silence') return null;
    const base = 'level' + this.level;
    if (this.mood === 'pressure') {
      const tense = base + (this.level === 2 ? '-fight' : '-tense');
      if (!this._track(tense).missing) return tense;
    }
    return this._track(base).missing ? null : base;
  }

  _tick() {
    const wanted = this._wanted();
    const loud = this.muted ? 0 : VOLUME * (this.ducked ? DUCKED : 1);
    const step = VOLUME * TICK / FADE_SECONDS;
    for (const [name, t] of Object.entries(this.tracks)) {
      if (t.missing) continue;
      const goal = name === wanted ? loud : 0;
      t.vol = goal > t.vol ? Math.min(goal, t.vol + step) : Math.max(goal, t.vol - step);
      t.el.volume = t.vol;
      if (t.vol > 0 && t.el.paused) t.el.play().catch(() => {});
      else if (t.vol === 0 && !t.el.paused) t.el.pause();
    }
  }
}
