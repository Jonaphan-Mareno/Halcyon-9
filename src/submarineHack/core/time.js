// Cap per-frame delta so a backgrounded tab can't trigger a burst of AI ticks
// or a sudden timer jump when it resumes.
export const MAX_FRAME_DELTA = 0.1;

export function clampDelta(deltaSeconds, max = MAX_FRAME_DELTA) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return 0;
  return Math.min(deltaSeconds, max);
}
