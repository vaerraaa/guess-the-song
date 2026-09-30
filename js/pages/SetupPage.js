import { app } from '../app.js';
import { DIFFICULTIES, MODES } from '../config.js';
import { GameSetupError } from '../core/gameEngine.js';
import { availableCategories } from '../core/questions.js';
import { ErrorState } from '../components/ErrorState.js';
import { catalog, pad2 } from '../components/ln.js';
import { TopBar } from '../components/TopBar.js';
import { startGame } from '../gameSession.js';
import { listQuizzes, loadLastSetup } from '../storage/storage.js';
import { esc, html } from '../utils.js';

/** A tracklist of radio rows. options: [{ id, title, sub, code }] */
function radioList({ name, options, selectedId }) {
  return `<div class="ln-list" role="radiogroup">${options
    .map((o, i) => `
      <label class="ln-track ln-track--flush">
        <input type="radio" name="${name}" value="${esc(o.id)}" ${o.id === selectedId ? 'checked' : ''}>
        <span class="ln-track__num">${pad2(i + 1)}</span>
        <span class="ln-track__text">
          <span class="ln-track__title">${esc(o.title)}</span>
          <span class="ln-body-sm ln-muted">${esc(o.sub)}</span>
        </span>
        <span class="ln-track__side">${catalog(o.code)}</span>
      </label>`)
    .join('')}</div>`;
}

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

  root.append(TopBar());
  const main = html(`
    <main class="gts-page">
      <header class="gts-head">
        <span class="ln-label-caps ln-muted">Side A · Solo</span>
        <h1 class="ln-headline-lg">Set up the record.</h1>
      </header>
      <div class="gts-error-slot"></div>
      <div class="gts-grid">
        <section class="gts-col-5 gts-stack">
          <div>
            <p class="ln-section-label">01 · Format</p>
            ${radioList({
              name: 'mode',
              selectedId: setup.modeId,
              options: Object.values(MODES).map((m) => ({ id: m.id, title: m.name, sub: m.description, code: m.format })),
            })}
          </div>
          <div>
            <p class="ln-section-label">03 · Difficulty</p>
            ${radioList({
              name: 'difficulty',
              selectedId: setup.difficultyId,
              options: Object.values(DIFFICULTIES).map((d) => ({
                id: d.id,
                title: d.name,
                sub: `${d.previewSec}-second clip${d.distractorSimilarity >= 1 ? ' · look-alike answers' : d.distractorSimilarity === 0 ? ' · the big hits' : ''}`,
                code: `${d.previewSec}s`,
              })),
            })}
          </div>
          <div class="ln-sleeve gts-stack-sm">
            <p class="ln-label-caps ln-muted">Now playing</p>
            <p class="ln-body-md" data-summary aria-live="polite"></p>
            <button type="button" class="ln-btn ln-btn--primary ln-btn--full" data-start>Start the record</button>
          </div>
        </section>
        <section class="gts-col-right-7">
          <p class="ln-section-label">02 · Record</p>
          ${radioList({
            name: 'source',
            selectedId: sourceId(),
            options: [
              ...categories.map((c) => ({ id: c.id, title: c.name, sub: `${c.note} · ${c.count} songs`, code: c.code })),
              ...quizzes.map((q) => ({ id: `quiz:${q.localId}`, title: q.title, sub: `Custom quiz · ${q.tracks.length} tracks`, code: 'GTS-Q' })),
            ],
          })}
          ${quizzes.length ? '' : '<p class="ln-body-sm ln-muted" style="padding-top:16px">Want your own songs? <a href="#/quizzes">Make a quiz from a playlist</a>.</p>'}
        </section>
      </div>
    </main>`);
  root.append(main);

  const summary = main.querySelector('[data-summary]');
  const renderSummary = () => {
    const mode = MODES[setup.modeId];
    const quiz = setup.quizLocalId && quizzes.find((q) => q.localId === setup.quizLocalId);
    const cat = categories.find((c) => c.id === setup.categoryId);
    const diff = DIFFICULTIES[setup.difficultyId];
    const preview = Math.min(diff.previewSec, mode.timeLimitSec);
    summary.innerHTML = `<strong>${esc(quiz ? quiz.title : cat.name)}</strong>, ${esc(mode.name.toLowerCase())}, ${esc(diff.name.toLowerCase())}. <span class="ln-muted">${preview}-second clips, ${mode.timeLimitSec} seconds to answer.</span>`;
  };
  renderSummary();

  main.addEventListener('change', (e) => {
    const { name, value } = e.target;
    if (name === 'mode') setup.modeId = value;
    if (name === 'difficulty') setup.difficultyId = value;
    if (name === 'source') {
      if (value.startsWith('quiz:')) setup.quizLocalId = value.slice(5);
      else {
        setup.quizLocalId = null;
        setup.categoryId = value;
      }
    }
    renderSummary();
  });

  main.querySelector('[data-start]').addEventListener('click', () => {
    try {
      startGame(
        setup.quizLocalId
          ? { modeId: setup.modeId, difficultyId: setup.difficultyId, quizLocalId: setup.quizLocalId }
          : { modeId: setup.modeId, difficultyId: setup.difficultyId, categoryId: setup.categoryId },
      );
    } catch (err) {
      if (!(err instanceof GameSetupError)) throw err;
      main.querySelector('.gts-error-slot').replaceChildren(
        ErrorState({ title: 'No songs match this setup.', message: 'Try a different record or difficulty.', actions: [] }),
      );
    }
  });
}
