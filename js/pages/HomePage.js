import { app } from '../app.js';
import { DIFFICULTIES, MODES } from '../config.js';
import { GameSetupError } from '../core/gameEngine.js';
import { availableCategories } from '../core/questions.js';
import { catalog, coverTile, pad2, statLine, waveform, wordmark } from '../components/ln.js';
import { openHowToPlay } from '../components/HowToPlay.js';
import { openSettings } from '../components/Settings.js';
import { toast } from '../components/Toast.js';
import { TopBar } from '../components/TopBar.js';
import { startGame } from '../gameSession.js';
import { navigate } from '../router.js';
import { listQuizzes, loadLastSetup, loadStats } from '../storage/storage.js';
import { esc, html } from '../utils.js';

// Floating record sleeves around the hero — the stage layer's one decorative gesture.
const TILES = [
  { motif: 'disc', tint: 'navy', size: 180, rotate: -9, position: 'left:5%;top:40px', delay: 0 },
  { motif: 'bars', tint: 'rust', size: 170, rotate: 8, position: 'right:6%;top:30px', delay: 2 },
  { motif: 'disc', tint: 'plum', size: 170, rotate: 8, position: 'left:2%;top:400px', delay: 4 },
  { motif: 'bars', tint: 'teal', size: 170, rotate: -10, position: 'right:4%;top:400px', delay: 1 },
  { motif: 'square', tint: 'moss', size: 120, rotate: -4, position: 'left:22%;top:590px', delay: 3 },
  { motif: 'square', tint: 'wine', size: 120, rotate: 6, position: 'right:22%;top:590px', delay: 5 },
];

export function mount(root) {
  const stats = loadStats();
  const best = Math.max(0, ...Object.values(stats.bestScores ?? {}));
  const categories = availableCategories(app.songs);
  const quizzes = listQuizzes();
  const last = loadLastSetup();
  const modeId = MODES[last.modeId] ? last.modeId : 'classic';
  const difficultyId = DIFFICULTIES[last.difficultyId] ? last.difficultyId : 'medium';
  const small = window.innerWidth < 640;

  root.append(TopBar());
  root.append(html(`
    <main>
      <section class="gts-hero">
        ${TILES.map(coverTile).join('')}
        <div class="gts-hero__inner">
          <span class="ln-eyebrow">♪ The music guessing game</span>
          ${wordmark({ size: small ? 64 : 128 })}
          ${waveform({ bars: small ? 28 : 48, height: 30, playing: true })}
          <p class="ln-body-lg ln-muted">You have 10 seconds. Do you know the song?</p>
          <div class="ln-btn-row" style="justify-content:center">
            <button type="button" class="ln-btn ln-btn--brand" data-quick><span class="ln-btn__glyph" aria-hidden="true">▶</span> Play now</button>
            <a class="ln-btn ln-btn--outline" href="#/multiplayer">Play with friends</a>
          </div>
          <div class="ln-btn-row" style="justify-content:center">
            <a class="ln-chip" href="#/quizzes">Make a quiz</a>
            <button type="button" class="ln-chip" data-howto>How to play</button>
            <a class="ln-chip" href="#/leaderboard">Leaderboard</a>
            <button type="button" class="ln-chip" data-settings>Settings</button>
          </div>
          ${statLine([
            { value: app.songs.length, label: 'songs' },
            { value: categories.length, label: 'categories' },
            { value: Object.keys(MODES).length, label: 'modes' },
            ...(best > 0 ? [{ value: best, label: 'your best' }] : []),
          ])}
        </div>
      </section>

      <div class="gts-page">
        <div class="gts-title">
          <section class="gts-title__cover">
            <span class="ln-label-caps ln-muted">Side A · Solo</span>
            <h2 class="ln-headline-lg">Pick a record.</h2>
            <p class="ln-body-md ln-italic ln-muted" style="max-width:34ch">Ten tracks per round. Four titles each. Faster answers score more.</p>
            <p class="gts-play-as ln-label-caps">
              <span>Playing as</span>
              ${catalog(MODES[modeId].format, `${MODES[modeId].name} · ${DIFFICULTIES[difficultyId].name}`)}
              <a href="#/play">Change mode</a>
            </p>
          </section>
          <section class="gts-title__list">
            <div class="ln-list" data-cats>
              ${categories.map((c, i) => `
                <button type="button" class="ln-track ln-track--flush" data-cat="${c.id}">
                  <span class="ln-track__num">${pad2(i + 1)}</span>
                  <span class="ln-track__text">
                    <span class="ln-track__title">${esc(c.name)}</span>
                    <span class="ln-body-sm ln-muted">${esc(c.note)} · ${c.count} songs</span>
                  </span>
                  <span class="ln-track__side">${catalog(c.code)}</span>
                </button>`).join('')}
              ${quizzes.map((q, i) => `
                <button type="button" class="ln-track ln-track--flush" data-quiz="${esc(q.localId)}">
                  <span class="ln-track__num">${pad2(categories.length + i + 1)}</span>
                  <span class="ln-track__text">
                    <span class="ln-track__title">${esc(q.title)}</span>
                    <span class="ln-body-sm ln-muted">Custom quiz · ${q.tracks.length} tracks</span>
                  </span>
                  <span class="ln-track__side">${catalog('GTS-Q')}</span>
                </button>`).join('')}
            </div>
            <p class="gts-side-label ln-label-caps">Side B · With friends</p>
            <hr class="ln-rule">
            <div class="ln-btn-row" style="padding-top:24px">
              <a class="ln-btn ln-btn--primary" href="#/multiplayer">Start a room</a>
              <button type="button" class="ln-btn ln-btn--secondary" data-join>Join with a code</button>
              <a class="ln-btn ln-btn--quiet" href="#/quizzes">Make a quiz from a playlist</a>
            </div>
          </section>
        </div>
      </div>
    </main>`));

  const start = (setup) => {
    try {
      startGame({ modeId, difficultyId, ...setup });
    } catch (err) {
      if (!(err instanceof GameSetupError)) throw err;
      toast(err.message);
    }
  };

  root.querySelector('[data-quick]').addEventListener('click', () => {
    const quizOk = last.quizLocalId && quizzes.some((q) => q.localId === last.quizLocalId);
    start(quizOk ? { quizLocalId: last.quizLocalId } : { categoryId: categories.some((c) => c.id === last.categoryId) ? last.categoryId : 'all' });
  });
  root.querySelector('[data-cats]').addEventListener('click', (e) => {
    const cat = e.target.closest('[data-cat]');
    const quiz = e.target.closest('[data-quiz]');
    if (cat) start({ categoryId: cat.dataset.cat });
    if (quiz) start({ quizLocalId: quiz.dataset.quiz });
  });
  root.querySelector('[data-join]').addEventListener('click', () => {
    app.focusJoin = true;
    navigate('multiplayer');
  });
  root.querySelector('[data-howto]').addEventListener('click', openHowToPlay);
  root.querySelector('[data-settings]').addEventListener('click', openSettings);
}
