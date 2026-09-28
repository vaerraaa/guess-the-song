import { html } from '../utils.js';

const RADIUS = 20;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Circular countdown display. Pure view — the countdown itself lives in createCountdown(). */
export function Timer() {
  const element = html(`
    <div class="timer" role="timer" aria-label="Time remaining">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle class="timer-track" cx="24" cy="24" r="${RADIUS}"/>
        <circle class="timer-fill" cx="24" cy="24" r="${RADIUS}" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0"/>
      </svg>
      <span class="timer-value">--</span>
    </div>`);
  const fill = element.querySelector('.timer-fill');
  const value = element.querySelector('.timer-value');
  let lastWhole = null;

  return {
    element,
    update(remainingMs, totalMs) {
      const fraction = Math.max(0, remainingMs / totalMs);
      fill.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - fraction));
      const whole = Math.ceil(remainingMs / 1000);
      if (whole !== lastWhole) {
        lastWhole = whole;
        value.textContent = String(whole).padStart(2, '0');
        element.classList.toggle('timer-low', whole <= 3 && remainingMs > 0);
        element.setAttribute('aria-label', `${whole} seconds remaining`);
        if (whole <= 3) {
          value.classList.remove('tick');
          void value.offsetWidth; // restart the CSS animation
          value.classList.add('tick');
        }
      }
    },
    reset(totalMs) {
      lastWhole = null;
      element.classList.remove('timer-low');
      this.update(totalMs, totalMs);
    },
    setPaused(paused) {
      element.classList.toggle('timer-paused', paused);
    },
  };
}

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
