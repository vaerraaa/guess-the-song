import { app } from '../app.js';
import { MODES } from '../config.js';
import { availableCategories } from '../core/questions.js';
import { openHowToPlay } from '../components/HowToPlay.js';
import { openSettings } from '../components/Settings.js';
import { Waveform } from '../components/Waveform.js';
import { loadStats } from '../storage/storage.js';
import { formatNumber, generatedArtwork, html } from '../utils.js';

// Decorative floating "album covers" — generated art, no text, so nothing is given away.
const COVER_SEEDS = [3, 11, 27, 42, 58, 71];

export function mount(root) {
  const stats = loadStats();
  const best = Math.max(0, ...Object.values(stats.bestScores ?? {}));
  const categoryCount = availableCategories(app.songs).length;

  root.append(html(`
    <section class="home">
      <div class="home-covers" aria-hidden="true">
        ${COVER_SEEDS.map((seed, i) => `<img class="cover cover-${i}" src="${generatedArtwork(seed)}" alt="">`).join('')}
      </div>
      <div class="hero">
        <p class="eyebrow"><span aria-hidden="true">♪</span> The music guessing game</p>
        <h1 class="title"><span>Guess</span> <span>the Song</span></h1>
        <div class="hero-wave"></div>
        <p class="tagline">You have 10 seconds. Do you know the song?</p>
        <div class="home-cta">
          <a class="btn btn-primary btn-xl play-now" href="#/play">
            <span aria-hidden="true">▶</span> Play now
          </a>
          <a class="btn btn-outline btn-xl" href="#/multiplayer">
            <span aria-hidden="true">👥</span> Play with friends
          </a>
        </div>
        <div class="home-secondary">
          <a class="btn btn-ghost" href="#/quizzes">Make a quiz</a>
          <button type="button" class="btn btn-ghost" data-howto>How to Play</button>
          <a class="btn btn-ghost" href="#/leaderboard">Leaderboard</a>
          <button type="button" class="btn btn-ghost" data-settings>Settings</button>
        </div>
        <ul class="home-facts">
          <li><strong>${app.songs.length}</strong> songs</li>
          <li><strong>${categoryCount}</strong> categories</li>
          <li><strong>${Object.keys(MODES).length}</strong> modes</li>
          ${best > 0 ? `<li><strong>${formatNumber(best)}</strong> your best</li>` : ''}
        </ul>
      </div>
    </section>`));

  const wave = Waveform({ bars: 40, className: 'waveform-hero' });
  wave.setState('playing');
  root.querySelector('.hero-wave').append(wave.element);
  root.querySelector('[data-howto]').addEventListener('click', openHowToPlay);
  root.querySelector('[data-settings]').addEventListener('click', openSettings);
}
