import { app } from '../app.js';
import { DIFFICULTIES, MODES } from '../config.js';
import { getCategory } from '../core/questions.js';
import { performanceMessage } from '../core/scoring.js';
import { catalog, creditLine, mark, pad2, statLine, waveform } from '../components/ln.js';
import { TopBar } from '../components/TopBar.js';
import { startGame } from '../gameSession.js';
import { navigate } from '../router.js';
import { leaderboardRepository, loadUsername, saveUsername } from '../storage/storage.js';
import { esc, formatNumber, formatSeconds, generatedArtwork, html } from '../utils.js';

export function mount(root) {
  const result = app.getLastResult();
  if (!result) {
    navigate('home', { replace: true });
    return {};
  }
  const { summary, recap } = result;
  const mode = MODES[summary.modeId] ?? MODES.classic;
  const category = getCategory(summary.categoryId);
  const difficulty = DIFFICULTIES[summary.difficultyId];
  const message = performanceMessage(summary.accuracy);
  const endless = mode.lives != null;
  const record = summary.quizTitle ? catalog('GTS-Q', summary.quizTitle) : catalog(category.code, category.name);

  root.append(TopBar());
  root.append(html(`
    <main class="gts-page">
      <div class="gts-split">
        <section class="gts-stack">
          <div class="gts-stack-sm">
            <p class="ln-label-caps ln-muted">${endless ? 'Game over' : 'Round complete'} · ${record}</p>
            <h1 class="ln-headline-lg">${summary.correct} of ${summary.answered} named.</h1>
            <p class="ln-body-lg ln-italic ln-muted">${esc(message.title)}</p>
          </div>
          <div class="gts-stack-sm">
            <p class="ln-label-caps ln-muted">Final score</p>
            <span class="ln-readout">${formatNumber(summary.score)}</span>
            ${waveform({ bars: 36, height: 22, playing: false, seed: (summary.score % 11) + 3 })}
          </div>
          ${statLine([
            { value: `${summary.accuracy}%`, label: 'accuracy' },
            { value: summary.bestStreak, label: 'best streak' },
            { value: summary.avgResponseMs == null ? '—' : `${formatSeconds(summary.avgResponseMs)}s`, label: 'average answer' },
          ])}
          <p class="ln-label-caps ln-muted">${esc(mode.format)} · ${esc(mode.name)} · ${esc(difficulty?.name ?? '')}</p>

          <form class="gts-stack-sm" data-save novalidate>
            <div class="ln-inline-form">
              <div class="ln-field">
                <label class="ln-field__label" for="player-name">Sign the leaderboard</label>
                <input id="player-name" class="ln-input" name="name" maxlength="20" autocomplete="nickname" placeholder="Your name" required>
              </div>
              <button type="submit" class="ln-btn ln-btn--secondary">Save score</button>
            </div>
            <p class="ln-form-msg" aria-live="polite"></p>
          </form>

          <div class="ln-btn-row">
            <button type="button" class="ln-btn ln-btn--primary" data-again>Play again</button>
            <a class="ln-btn ln-btn--secondary" href="#/play">Change mode</a>
            <a class="ln-btn ln-btn--quiet" href="#/leaderboard">Leaderboard</a>
            <a class="ln-btn ln-btn--quiet" href="#/">Back to the booklet</a>
          </div>
        </section>

        <section aria-labelledby="recap-title">
          <h2 class="ln-section-label" id="recap-title">Tracklist</h2>
          ${recap.map((r, i) => `
            <div class="gts-recap">
              <span class="ln-data-md ln-muted">${pad2(i + 1)}</span>
              <img class="gts-recap__art" src="${esc(r.artwork || generatedArtwork(typeof r.id === 'number' ? r.id : i + 1))}" alt="" loading="lazy">
              ${creditLine({ title: r.title, artist: r.artist, album: r.album, year: r.year, size: 'sm' })}
              ${r.correct ? mark('correct', `+${r.points}`) : mark('wrong', r.timedOut ? 'Out of time' : 'Missed')}
            </div>`).join('')}
        </section>
      </div>
    </main>`));

  // ── Save score ────────────────────────────────────────────────────
  const form = root.querySelector('[data-save]');
  const input = form.querySelector('input');
  const button = form.querySelector('button');
  const msg = form.querySelector('.ln-form-msg');
  input.value = loadUsername();

  const markSaved = (rank, globalRank) => {
    input.disabled = true;
    button.disabled = true;
    const where = globalRank ? `number ${globalRank} worldwide` : `number ${rank} on this device`;
    msg.innerHTML = `${mark('correct', 'Signed')} <span class="ln-body-sm">You're ${esc(where)} in ${esc(mode.name)}. <a href="#/leaderboard">See the leaderboard</a></span>`;
  };
  if (result.saved) markSaved(result.rank, result.globalRank);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      msg.innerHTML = '<span class="ln-error-text">Enter a name to save your score.</span>';
      input.focus();
      return;
    }
    if (result.saved) return;
    saveUsername(name);
    button.disabled = true;
    const { record, rank, globalRank, globalId } = await leaderboardRepository.add({
      name,
      score: summary.score,
      accuracy: summary.accuracy,
      correct: summary.correct,
      answered: summary.answered,
      modeId: summary.modeId,
      categoryId: summary.categoryId,
      difficultyId: summary.difficultyId,
      quizTitle: summary.quizTitle,
    });
    Object.assign(result, { saved: true, rank, globalRank, entryId: record.id, globalEntryId: globalId });
    app.setLastResult(result); // so a refresh can't save the same game twice
    markSaved(rank, globalRank);
  });

  root.querySelector('[data-again]').addEventListener('click', () => {
    const setup = result.setup ?? { modeId: summary.modeId, categoryId: summary.categoryId, difficultyId: summary.difficultyId };
    try {
      startGame({ modeId: setup.modeId, difficultyId: setup.difficultyId, categoryId: setup.categoryId, quizLocalId: setup.quizLocalId });
    } catch {
      navigate('play');
    }
  });

  return {};
}
