import { app } from '../app.js';
import { DIFFICULTIES, MODES } from '../config.js';
import { GameSetupError } from '../core/gameEngine.js';
import { availableCategories } from '../core/questions.js';
import { CategorySelector, OptionGroup } from '../components/CategorySelector.js';
import { ErrorState } from '../components/ErrorState.js';
import { TopBar } from '../components/TopBar.js';
import { startGame } from '../gameSession.js';
import { listQuizzes, loadLastSetup } from '../storage/storage.js';
import { esc, html } from '../utils.js';

export function mount(root) {
  const categories = availableCategories(app.songs);
  const quizzes = listQuizzes();
  const last = { ...loadLastSetup(), ...(app.pendingSetup ?? {}) };
  app.pendingSetup = null;
  const setup = {
    modeId: MODES[last.modeId] ? last.modeId : 'classic',
    categoryId: categories.some((c) => c.id === last.categoryId) ? last.categoryId : 'all',
    difficultyId: DIFFICULTIES[last.difficultyId] ? last.difficultyId : 'medium',
    quizLocalId: quizzes.some((q) => q.localId === last.quizLocalId) ? last.quizLocalId : null,
  };
  const sourceId = () => (setup.quizLocalId ? `quiz:${setup.quizLocalId}` : setup.categoryId);
  const setSource = (id) => {
    if (id.startsWith('quiz:')) setup.quizLocalId = id.slice(5);
    else {
      setup.quizLocalId = null;
      setup.categoryId = id;
    }
    renderSummary();
  };

  root.append(TopBar());
  const main = html(`
    <main class="container setup">
      <header class="page-head">
        <h1>Set up your game</h1>
        <p class="muted">Choose how you want to play.</p>
      </header>
      <div class="setup-steps"></div>
      <div class="setup-footer">
        <p class="setup-summary" aria-live="polite"></p>
        <button type="button" class="btn btn-primary btn-xl start-btn">Start game <span aria-hidden="true">→</span></button>
      </div>
    </main>`);
  root.append(main);
  const steps = main.querySelector('.setup-steps');

  if (categories.length === 0) {
    steps.append(ErrorState({ icon: '📭', title: 'No songs match these filters.', message: 'Add songs to js/data/songs.js to start playing.', actions: [] }));
    main.querySelector('.setup-footer').hidden = true;
    return;
  }

  const summary = main.querySelector('.setup-summary');
  const renderSummary = () => {
    const mode = MODES[setup.modeId];
    const quiz = setup.quizLocalId && quizzes.find((q) => q.localId === setup.quizLocalId);
    const cat = categories.find((c) => c.id === setup.categoryId);
    const sourceText = quiz ? `🎼 ${esc(quiz.title)}` : `${cat.icon} ${cat.name}`;
    const diff = DIFFICULTIES[setup.difficultyId];
    const preview = Math.min(diff.previewSec, mode.timeLimitSec);
    summary.innerHTML = `<strong>${mode.name}</strong> · ${sourceText} · ${diff.name} <span class="muted">(${preview}s preview, ${mode.timeLimitSec}s to answer)</span>`;
  };

  steps.append(
    OptionGroup({
      name: 'mode',
      legend: '1 · Choose a mode',
      className: 'modes',
      selectedId: setup.modeId,
      options: Object.values(MODES).map((m) => ({ id: m.id, name: m.name, icon: m.icon, detail: m.tagline })),
      onChange: (id) => {
        setup.modeId = id;
        renderSummary();
      },
    }),
    CategorySelector({ categories, selectedId: sourceId(), onChange: setSource }),
    quizzes.length
      ? OptionGroup({
          name: 'category',
          legend: '…or one of your quizzes',
          className: 'categories your-quizzes',
          selectedId: sourceId(),
          onChange: setSource,
          options: quizzes.map((q) => ({ id: `quiz:${q.localId}`, name: q.title, icon: '🎼', detail: `${q.tracks.length} songs` })),
        })
      : html('<p class="muted small make-quiz-hint">Want your own songs? <a href="#/quizzes">Make a quiz from a playlist</a>.</p>'),
    OptionGroup({
      name: 'difficulty',
      legend: '3 · Difficulty',
      className: 'difficulty',
      selectedId: setup.difficultyId,
      options: Object.values(DIFFICULTIES).map((d) => ({
        id: d.id,
        name: d.name,
        detail: `${d.previewSec}s preview${d.distractorSimilarity >= 1 ? ' · tricky choices' : d.distractorSimilarity === 0 ? ' · big hits' : ''}`,
      })),
      onChange: (id) => {
        setup.difficultyId = id;
        renderSummary();
      },
    }),
  );
  renderSummary();

  main.querySelector('.start-btn').addEventListener('click', () => {
    try {
      startGame(setup.quizLocalId ? { modeId: setup.modeId, difficultyId: setup.difficultyId, quizLocalId: setup.quizLocalId } : { modeId: setup.modeId, difficultyId: setup.difficultyId, categoryId: setup.categoryId });
    } catch (err) {
      if (!(err instanceof GameSetupError)) throw err;
      steps.prepend(
        ErrorState({
          icon: '📭',
          title: 'No songs match these filters.',
          message: 'Try a different category or difficulty.',
          actions: [{ label: 'Change category', primary: true, onClick: (e) => { e.target.closest('.error-state').remove(); main.querySelector('.categories input:checked')?.focus(); } }],
        }),
      );
    }
  });
}
