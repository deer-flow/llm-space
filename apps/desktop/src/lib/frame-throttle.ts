/**
 * Run `flush` at most once per `minIntervalMs`, aligned to an animation frame.
 * `schedule()` coalesces bursts: one flush per interval, on the first frame
 * after the interval elapses. The frame alignment matters beyond pacing — a
 * fast stream drains a burst of events synchronously, and flushing state per
 * event inside one microtask chain never crosses the task boundary React uses
 * to reset its nested-update counter, tripping "Maximum update depth
 * exceeded".
 */
export function createFrameThrottle(
  flush: () => void,
  minIntervalMs: number
): { schedule: () => void; cancel: () => void } {
  let frame: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFlushAt = 0;

  const runFlush = () => {
    frame = null;
    lastFlushAt = performance.now();
    flush();
  };

  const schedule = () => {
    if (frame !== null || timer !== null) {
      return;
    }
    const wait = minIntervalMs - (performance.now() - lastFlushAt);
    if (wait <= 0) {
      frame = requestAnimationFrame(runFlush);
    } else {
      timer = setTimeout(() => {
        timer = null;
        frame = requestAnimationFrame(runFlush);
      }, wait);
    }
  };

  const cancel = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return { schedule, cancel };
}
