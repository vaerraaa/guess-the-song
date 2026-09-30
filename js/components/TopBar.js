import { html } from '../utils.js';
import { openHowToPlay } from './HowToPlay.js';
import { openSettings } from './Settings.js';

/** Slim navigation bar used on every screen except the home hero and active gameplay. */
export function TopBar() {
  const element = html(`
    <nav class="topbar" aria-label="Main">
      <a class="brand" href="#/" aria-label="Guess the Song — home">
        <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span class="brand-name">Guess the Song</span>
      </a>
      <div class="topbar-links">
        <a href="#/multiplayer" class="topbar-link">Multiplayer</a>
        <a href="#/quizzes" class="topbar-link">My quizzes</a>
      </div>
      <div class="topbar-actions">
        <button type="button" class="icon-btn" data-howto aria-label="How to play">?</button>
        <a class="icon-btn" href="#/leaderboard" aria-label="Leaderboard">🏆</a>
        <button type="button" class="icon-btn" data-settings aria-label="Settings">⚙</button>
      </div>
    </nav>`);
  element.querySelector('[data-howto]').addEventListener('click', openHowToPlay);
  element.querySelector('[data-settings]').addEventListener('click', openSettings);
  return element;
}
