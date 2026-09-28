import { app } from '../app.js';
import { DIFFICULTIES, MODES } from '../config.js';
import { getCategory } from '../core/questions.js';
import { performanceMessage } from '../core/scoring.js';
import { TopBar } from '../components/TopBar.js';
import { startGame } from '../gameSession.js';
import { navigate } from '../router.js';
import { leaderboardRepository, loadUsername, saveUsername } from '../storage/storage.js';
import { animateNumber, esc, formatSeconds, generatedArtwork, html } from '../utils.js';

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

  root.append(TopBar());
  root.append(html(`
    <main class="container results">
      <section class="results-hero">
        <p class="eyebrow">${mode.icon} ${esc(mode.name)} · ${summary.quizTitle ? `🎼 ${esc(summary.quizTitle)}` : `${category.icon} ${esc(category.name)}`} · ${esc(difficulty?.name ?? '')}</p>
        <h1>${endless ? 'Game over' : 'Game complete'}</h1>
        <p class="results-label">Final score</p>
        <p class="results-score" data-value="0">0</p>
        <p class="results-message"><span aria-hidden="true">${message.emoji}</span> ${esc(message.title)}</p>
      </section>

      <dl class="stat-grid">
        <div class="stat"><dt>Correct</dt><dd>${summary.correct} <span class="muted">/ ${summary.answered}</span></dd></div>
        <div class="stat"><dt>Accuracy</dt><dd>${summary.accuracy}%</dd></div>
        <div class="stat"><dt>Best streak</dt><dd><span aria-hidden="true">🔥</span> ${summary.bestStreak}</dd></div>
        <div class="stat"><dt>Avg. response</dt><dd>${summary.avgResponseMs == null ? '—' : `${formatSeconds(summary.avgResponseMs)} sec`}</dd></div>
      </dl>

      <form class="save-score card" novalidate>
        <label for="player-name"><strong>Save to leaderboard</strong></label>
        <div class="save-row">
          <input id="player-name" name="name" type="text" maxlength="20" autocomplete="nickname" placeholder="Your name" required>
          <button type="submit" class="btn btn-primary">Save score</button>
        </div>
        <p class="form-msg" aria-live="polite"></p>
      </form>

      <div class="results-actions">
        <button type="button" class="btn btn-primary btn-lg" data-again>Play again</button>
        <a class="btn btn-ghost btn-lg" href="#/play">Change mode</a>
        <a class="btn btn-ghost btn-lg" href="#/leaderboard">Leaderboard</a>
        <a class="btn btn-ghost btn-lg" href="#/">Home</a>
      </div>

      <section class="recap" aria-labelledby="recap-title">
        <h2 id="recap-title">Your songs</h2>
        <ol class="recap-list">
          ${recap.map((r, i) => `
            <li class="recap-item ${r.correct ? 'is-correct' : 'is-wrong'}" style="--i:${i}">
              <img src="${esc(r.artwork || generatedArtwork(r.id))}" alt="" loading="lazy">
              <span class="recap-text"><strong>${esc(r.title)}</strong><span>${esc(r.artist)}</span></span>
              <span class="recap-result">
                <span class="sr-only">${r.correct ? 'Correct' : r.timedOut ? 'Timed out' : 'Wrong'}</span>
                <span aria-hidden="true">${r.correct ? '✓' : '✗'}</span>
                ${r.correct ? `+${r.points}` : r.timedOut ? 'time' : ''}
              </span>
            </li>`).join('')}
        </ol>
      </section>
    </main>`));

  animateNumber(root.querySelector('.results-score'), summary.score, 1200);

  // ── Save score ────────────────────────────────────────────────────
  const form = root.querySelector('.save-score');
  const input = form.querySelector('input');
  const msg = form.querySelector('.form-msg');
  input.value = loadUsername();

  const markSaved = (rank, globalRank) => {
    form.classList.add('is-saved');
    input.disabled = true;
    form.querySelector('button').disabled = true;
    const where = globalRank ? `<strong>#${globalRank}</strong> worldwide in ${esc(mode.name)}` : `<strong>#${rank}</strong> on this device in ${esc(mode.name)}`;
    msg.innerHTML = rank ? `Saved! You're ${where}. <a href="#/leaderboard">View leaderboard</a>` : 'Score saved.';
  };
  if (result.saved) markSaved(result.rank, result.globalRank);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      msg.textContent = 'Enter a name to save your score.';
      input.focus();
      return;
    }
    if (result.saved) return;
    saveUsername(name);
    form.querySelector('button').disabled = true;
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
