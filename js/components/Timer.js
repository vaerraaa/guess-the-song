// Countdown used by solo and multiplayer rounds. Display lives in the disc and the credits strip.

/**
 * Countdown driven by wall-clock time (performance.now), so interval drift or throttling never
 * skews the result. onTick(remainingMs, elapsedMs) ~20×/s; onWholeSecond(seconds) on each second change; onExpire() once.
 */
export function createCountdown({ durationMs, onTick, onWholeSecond, onExpire }) {
  let startedAt = null;
  let interval = null;
  let stoppedElapsed = null;
  let lastWhole = null;
  let pausedElapsed = null;

  const loop = () => {
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, durationMs - elapsed);
    onTick?.(remaining, elapsed);
    const whole = Math.ceil(remaining / 1000);
    if (whole !== lastWhole) {
      lastWhole = whole;
      onWholeSecond?.(whole);
    }
    if (remaining <= 0) {
      clearInterval(interval);
      interval = null;
      stoppedElapsed = durationMs;
      onExpire?.();
      return;
    }
  };
  const TICK_MS = 50;

  return {
    start() {
      startedAt = performance.now();
      stoppedElapsed = null;
      interval = setInterval(loop, TICK_MS);
      loop();
    },
    /** Stops and returns elapsed ms. Safe to call repeatedly. */
    stop() {
      if (interval) clearInterval(interval);
      interval = null;
      if (stoppedElapsed == null && pausedElapsed != null) stoppedElapsed = pausedElapsed;
      if (stoppedElapsed == null && startedAt != null) stoppedElapsed = performance.now() - startedAt;
      pausedElapsed = null;
      return stoppedElapsed ?? 0;
    },
    pause() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
      pausedElapsed = performance.now() - startedAt;
    },
    resume() {
      if (pausedElapsed == null) return;
      startedAt = performance.now() - pausedElapsed;
      pausedElapsed = null;
      interval = setInterval(loop, TICK_MS);
      loop();
    },
    get running() {
      return interval != null;
    },
  };
}
