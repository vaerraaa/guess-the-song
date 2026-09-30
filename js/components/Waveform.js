import { html } from '../utils.js';

/**
 * Animated equalizer bars. Purely visual (CSS-driven), so it works with any audio source —
 * cross-origin previews can't be analysed without CORS headers anyway.
 * States: 'idle' | 'loading' | 'playing' | 'ended'
 */
export function Waveform({ bars = 28, className = '' } = {}) {
  const element = html(`
    <div class="waveform ${className}" data-state="idle" aria-hidden="true">
      ${Array.from({ length: bars }, (_, i) => {
        // Pseudo-random but stable heights/speeds give an organic look.
        const height = 30 + ((i * 37) % 70);
        const speed = 0.55 + ((i * 13) % 9) / 14;
        const delay = -((i * 7) % 10) / 10;
        return `<span style="--h:${height}%;--speed:${speed.toFixed(2)}s;--delay:${delay}s"></span>`;
      }).join('')}
    </div>`);
  return {
    element,
    setState(state) {
      element.dataset.state = state;
    },
  };
}
