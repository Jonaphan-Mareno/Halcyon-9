import { settings } from '../core/Settings.js';
import { sleep } from '../core/PauseClock.js';
import { audioSrc } from './AudioCache.js';

// Voss's recorded lines (public/assets/audio/voss/<clip>.mp3), for Levels 1 and 2. A line with no
// recording yet is shown as text only, as before. The text on screen is always shown too (as a
// subtitle) and the line moves on when the voice ends; clicking or pressing the skip key still
// cuts it short. The music ducks while he speaks, like it does for ARIA.

const PATH = './assets/audio/voss/';

class VossVoice {
  constructor() {
    this._cur = null;
  }

  // Start a clip. Resolves true when it has played to its end, false at once if there is no
  // recording (or it cannot play), and false if it was cut short by stop().
  play(clip) {
    this.stop();
    if (!clip) return Promise.resolve(false);
    return new Promise((resolve) => {
      const audio = new Audio(audioSrc(PATH + clip + '.mp3'));   // (fetched ahead: AudioCache)
      audio.volume = settings.get('voice');
      const cur = this._cur = { audio, resolve, settled: false };
      const settle = (played) => {
        if (cur.settled) return;
        cur.settled = true;
        if (this._cur === cur) {
          this._cur = null;
          window.dispatchEvent(new CustomEvent('aria-speaking', { detail: false }));
        }
        resolve(played);
      };
      cur.settle = settle;
      audio.addEventListener('ended', () => settle(true));
      audio.addEventListener('error', () => settle(false));
      audio.play().then(
        () => window.dispatchEvent(new CustomEvent('aria-speaking', { detail: true })),
        () => settle(false)
      );
    });
  }

  stop() {
    const c = this._cur;
    if (!c) return;
    c.audio.pause();
    c.settle(false);
  }

  pause() {
    const c = this._cur;
    if (!c) return;
    c.wasPlaying = !c.audio.paused;
    c.audio.pause();
  }

  resume() {
    const c = this._cur;
    if (c?.wasPlaying) c.audio.play().catch(() => {});
  }

  applyVolume() {
    if (this._cur) this._cur.audio.volume = settings.get('voice');
  }
}

export const vossVoice = new VossVoice();

// Show a Voss line (text) and play its recording, if there is one. With a recording the line moves on
// a beat after the voice ends; without one a timed line moves on after a reading time, and an
// untimed one waits for a click. Either way a click or the skip key moves it on at once.
// thought: shown as a thought bubble (what he reads or thinks, not says aloud).
export async function vossSays(ui, text, clip, { timed = true, readMs = Math.max(2200, text.length * 60), thought = false } = {}) {
  const shown = ui.showVossLine(text, { timed, thought });
  const played = vossVoice.play(clip);
  const wait = played.then(async (ok) => {
    if (ok) return sleep(350);
    if (timed) return sleep(readMs);
    return new Promise(() => {});          // (no recording: the click moves it on)
  });
  await Promise.race([shown, wait]);
  vossVoice.stop();
}
