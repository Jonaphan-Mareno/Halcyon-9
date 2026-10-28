// One flag for "the game is paused" that timed things can respect. sleep(ms) is like a timeout
// but the time only counts while the game is running, so a line of dialogue that was waiting to
// move on does not move on behind the pause menu.

export const pauseClock = { paused: false };

export function sleep(ms) {
  return new Promise((resolve) => {
    let left = ms;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      if (!pauseClock.paused) left -= now - last;
      last = now;
      if (left <= 0) resolve();
      else setTimeout(tick, Math.min(100, Math.max(16, left)));
    };
    setTimeout(tick, Math.min(100, Math.max(16, left)));
  });
}
