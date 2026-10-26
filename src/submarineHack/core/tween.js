const easeOut = (t) => 1 - (1 - t) ** 2;
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;

// Small RAF tween helper for the handful of visual effects used by the embedded minigame.
export const gsap = {
  to(target, options) {
    const keys = Object.keys(options).filter((key) => ![
      'duration', 'delay', 'ease', 'repeat', 'onUpdate', 'onComplete', 'onRepeat'
    ].includes(key));
    const from = Object.fromEntries(keys.map((key) => [key, target[key]]));
    const started = performance.now() + (options.delay || 0) * 1000;
    const duration = Math.max(1, (options.duration || 0) * 1000);
    let stopped = false;
    let cycle = 0;
    let frame;
    const handle = {
      progress: () => Math.min(1, Math.max(0, (performance.now() - started - cycle * duration) / duration)),
      kill() { stopped = true; cancelAnimationFrame(frame); }
    };
    const tick = (now) => {
      if (stopped) return;
      if (now < started + cycle * duration) { frame = requestAnimationFrame(tick); return; }
      const raw = Math.min(1, (now - started - cycle * duration) / duration);
      const eased = options.ease === 'none' ? raw : options.ease === 'power1.out' ? easeOut(raw) : easeInOut(raw);
      for (const key of keys) target[key] = from[key] + (options[key] - from[key]) * eased;
      options.onUpdate?.();
      if (raw >= 1) {
        if (options.repeat === -1 || cycle < (options.repeat || 0)) {
          cycle++;
          options.onRepeat?.();
          if (options.repeat === -1) for (const key of keys) target[key] = from[key];
        } else {
          stopped = true;
          options.onComplete?.();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return handle;
  }
};
