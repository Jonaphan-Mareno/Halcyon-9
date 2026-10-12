// Frame rate display and automatic quality for level 1 (level 2 has its own, in HabitatSession).
//
// A small counter in the top right (F3 hides it). While playing, every two seconds the average
// frame time is checked against a ladder of quality steps (index 0 = best): too slow (under ~45
// fps) and it steps down (two steps if it is very slow); comfortably at the screen's 60 fps for a
// few checks in a row and it steps back up. Each step is a set of settings the game applies
// (resolution, lights, effects), so a school PC and a slow laptop both find a smooth balance.

const STEP_DOWN = 1 / 45;      // average frame time above this: one step down
const JUMP_DOWN = 1 / 25;      // above this: two steps
const STEP_UP = 1 / 57;        // below this (vsync-limited at 60): room to go back up
const WINDOW = 2;              // seconds per check

export class PerfMonitor {
  constructor({ steps, onStep }) {
    this.steps = steps;
    this.onStep = onStep;
    this.index = 0;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;top:8px;right:10px;z-index:50;font:12px monospace;color:#cfefff;' +
      'background:rgba(4,18,27,0.7);padding:3px 7px;border-radius:4px;pointer-events:none';
    document.body.appendChild(this.el);
    this._onKey = (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.el.style.display = this.el.style.display === 'none' ? '' : 'none'; }
    };
    window.addEventListener('keydown', this._onKey);
    this.frames = 0;
    this.time = 0;
    this.judgeTime = 0;
    this.judgeFrames = 0;
    this.fastChecks = 0;
  }

  get current() { return this.steps[this.index]; }

  update(delta, active) {
    this.frames++;
    this.time += delta;
    if (this.time >= 0.5) {
      const fps = this.frames / this.time;
      this.el.textContent = Math.round(fps) + ' fps  ' + (1000 / fps).toFixed(1) + ' ms' +
        (this.index ? '  (quality ' + (this.steps.length - this.index) + '/' + this.steps.length + ')' : '');
      this.frames = 0;
      this.time = 0;
    }
    // (not while paused or the tab is hidden, and ignoring one-off stalls such as loading)
    if (!active || document.hidden || delta > 0.25) return;
    this.judgeTime += delta;
    this.judgeFrames++;
    if (this.judgeTime < WINDOW) return;
    const avg = this.judgeTime / this.judgeFrames;
    this.judgeTime = 0;
    this.judgeFrames = 0;
    let next = this.index;
    if (avg > STEP_DOWN) {
      next = Math.min(this.steps.length - 1, this.index + (avg > JUMP_DOWN ? 2 : 1));
      this.fastChecks = 0;
    } else if (avg < STEP_UP && this.index > 0) {
      // only after a few fast checks in a row, so it does not see-saw
      if (++this.fastChecks >= 3) {
        next = this.index - 1;
        this.fastChecks = 0;
      }
    } else {
      this.fastChecks = 0;
    }
    if (next !== this.index) {
      this.index = next;
      this.onStep(this.current);
    }
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.el.remove();
  }
}
