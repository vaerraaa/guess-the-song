import { html } from '../utils.js';
import { openModal } from './Modal.js';

const STEPS = [
  ['🎧', 'Listen', 'A short song preview starts playing.'],
  ['👆', 'Choose', 'Pick the right song from four options.'],
  ['⚡', 'Be quick', 'Faster answers earn up to +100 bonus points.'],
  ['🔥', 'Build a streak', 'Consecutive correct answers multiply your points (up to 1.5×).'],
  ['🏆', 'Finish strong', 'Complete all 10 songs and see your final score.'],
];

export function openHowToPlay() {
  const content = html(`
    <div class="howto">
      <ol class="howto-steps">
        ${STEPS.map(([icon, title, text], i) => `
          <li style="--i:${i}">
            <span class="howto-icon" aria-hidden="true">${icon}</span>
            <div><strong>${title}</strong><p>${text}</p></div>
          </li>`).join('')}
      </ol>
      <p class="howto-keys"><span class="kbd">1</span>–<span class="kbd">4</span> or <span class="kbd">A</span>–<span class="kbd">D</span> to answer · <span class="kbd">Enter</span> next · <span class="kbd">M</span> mute</p>
      <button type="button" class="btn btn-primary btn-block" data-close>Got it</button>
    </div>`);
  return openModal({ title: 'How to Play', content });
}
