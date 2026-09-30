import { html } from '../utils.js';
import { openModal } from './Modal.js';

const STEPS = [
  ['Listen', 'A short clip starts playing. The record spins while it plays.'],
  ['Choose', 'Pick the right song from four tracks.'],
  ['Be quick', 'Faster answers earn up to +100 bonus points.'],
  ['Build a streak', 'Consecutive right answers multiply your points, up to 1.5×.'],
  ['Finish the side', 'Get through all ten tracks and see your final score.'],
];

export function openHowToPlay() {
  const content = html(`
    <div class="gts-stack">
      <div class="ln-list">
        ${STEPS.map(([title, text], i) => `
          <div class="ln-track ln-track--flush" style="cursor:default">
            <span class="ln-track__num">0${i + 1}</span>
            <span class="ln-track__text"><span class="ln-track__title">${title}</span><span class="ln-track__artist">${text}</span></span>
            <span></span>
          </div>`).join('')}
      </div>
      <p class="ln-data-sm ln-muted">KEYS 1–4 ANSWER · ENTER NEXT · M MUTE · ESC CLOSES</p>
      <button type="button" class="ln-btn ln-btn--primary" data-close>Got it</button>
    </div>`);
  return openModal({ title: 'How to play', content });
}
