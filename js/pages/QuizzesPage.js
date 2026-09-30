import { api } from '../api.js';
import { app } from '../app.js';
import { ErrorState } from '../components/ErrorState.js';
import { catalog, pad2 } from '../components/ln.js';
import { confirmDialog } from '../components/Modal.js';
import { quizCover } from '../components/QuizCover.js';
import { toast } from '../components/Toast.js';
import { TopBar } from '../components/TopBar.js';
import { playQuizSolo, playQuizWithFriends, shareQuizFlow } from '../quizActions.js';
import { navigate } from '../router.js';
import { deleteLocalQuiz, getLocalQuiz, listQuizzes, saveLocalQuiz } from '../storage/storage.js';
import { esc, html } from '../utils.js';

export function mount(root) {
  root.append(TopBar());
  const main = html(`
    <main class="gts-page">
      <header class="gts-head">
        <span class="ln-label-caps ln-muted">GTS-Q · Custom pressings</span>
        <h1 class="ln-headline-lg">Your quizzes.</h1>
        <p class="ln-body-md ln-italic ln-muted ln-measure">Turn a playlist into a record. Import a Deezer or Spotify link, paste a list of songs, or pick them one by one. Then play it solo, in a room, or send the link.</p>
        <div><button type="button" class="ln-btn ln-btn--primary" data-new>New quiz</button></div>
      </header>
      <section data-shared-slot></section>
      <section aria-label="Your quizzes">
        <p class="ln-section-label">On this device</p>
        <div data-grid></div>
      </section>
    </main>`);
  root.append(main);
  main.querySelector('[data-new]').addEventListener('click', () => {
    app.editingQuizLocalId = null;
    navigate('quiz-editor');
  });

  const grid = main.querySelector('[data-grid]');

  function renderList() {
    const quizzes = listQuizzes();
    if (quizzes.length === 0) {
      grid.innerHTML = `
        <div class="gts-empty">
          <p class="ln-title-md">No quizzes pressed yet.</p>
          <p class="ln-body-md ln-muted">Your first one takes about a minute.</p>
        </div>`;
      return;
    }
    grid.replaceChildren(...quizzes.map(quizCard));
  }

  function quizCard(quiz, i) {
    const card = html(`
      <article class="gts-quiz-card">
        ${quizCover(quiz)}
        <div class="gts-stack-sm">
          <span class="ln-label-caps ln-muted">${pad2(i + 1)} · ${catalog('GTS-Q', `${quiz.tracks.length} tracks`)}${quiz.remoteId ? ' · Shared' : ''}</span>
          <h2 class="ln-title-md">${esc(quiz.title)}</h2>
          <div class="ln-btn-row">
            <button type="button" class="ln-btn ln-btn--primary ln-btn--small" data-act="play">Play</button>
            <button type="button" class="ln-btn ln-btn--secondary ln-btn--small" data-act="friends">In a room</button>
            <button type="button" class="ln-btn ln-btn--secondary ln-btn--small" data-act="share">Copy link</button>
            <button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-act="edit">Edit</button>
            <button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-act="delete" aria-label="Delete ${esc(quiz.title)}">Delete</button>
          </div>
        </div>
      </article>`);
    card.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-act]');
      if (!button) return;
      const current = getLocalQuiz(quiz.localId);
      if (!current) return renderList();
      switch (button.dataset.act) {
        case 'play':
          return playQuizSolo(current);
        case 'friends':
          return playQuizWithFriends(current);
        case 'share':
          await shareQuizFlow(current, button);
          return renderList();
        case 'edit':
          app.editingQuizLocalId = current.localId;
          return navigate('quiz-editor');
        case 'delete': {
          const ok = await confirmDialog({
            title: 'Delete this quiz?',
            message: `“${current.title}” will be removed from this device. Anyone with its share link can still play it.`,
            confirmLabel: 'Delete quiz',
            danger: true,
          });
          if (ok) {
            deleteLocalQuiz(current.localId);
            toast('Quiz deleted.');
            renderList();
          }
        }
      }
    });
    return card;
  }

  async function renderShared(id) {
    const slot = main.querySelector('[data-shared-slot]');
    slot.innerHTML = '<p class="ln-label-caps ln-muted" style="padding-bottom:24px">Fetching the shared quiz…</p>';
    try {
      const quiz = await api(`quizzes/${encodeURIComponent(id)}`);
      const alreadySaved = listQuizzes().find((q) => q.remoteId === id || q.sharedFrom === id);
      const card = html(`
        <div class="ln-sleeve gts-quiz-card" style="margin-bottom:48px;border:0">
          ${quizCover(quiz)}
          <div class="gts-stack-sm">
            <span class="ln-label-caps ln-muted">Sent to you · ${catalog('GTS-Q', `${quiz.tracks.length} tracks`)} · played ${quiz.plays ?? 0} times</span>
            <h2 class="ln-headline-md">${esc(quiz.title)}</h2>
            <div class="ln-btn-row">
              <button type="button" class="ln-btn ln-btn--primary" data-shared="play">Play solo</button>
              <button type="button" class="ln-btn ln-btn--secondary" data-shared="friends">Play in a room</button>
            </div>
          </div>
        </div>`);
      slot.replaceChildren(card);
      // Save a copy locally so it shows up everywhere (setup screen, multiplayer).
      const local = alreadySaved ?? saveLocalQuiz({ title: quiz.title, tracks: quiz.tracks, sharedFrom: id });
      renderList();
      card.addEventListener('click', (e) => {
        const act = e.target.closest('[data-shared]')?.dataset.shared;
        if (!act) return;
        api(`quizzes/${encodeURIComponent(id)}/play`, { method: 'POST' }).catch(() => {});
        if (act === 'play') playQuizSolo(local);
        else playQuizWithFriends(local);
      });
    } catch (err) {
      slot.replaceChildren(
        ErrorState({
          title: err.status === 404 ? 'That quiz link doesn’t work.' : 'Something went wrong loading the quiz.',
          message: err.status === 404 ? 'It may have been removed, or the link was copied incompletely.' : err.message,
          actions: [{ label: 'Retry', primary: true, onClick: () => renderShared(id) }],
        }),
      );
    }
  }

  renderList();
  if (app.pendingQuizId) {
    const id = app.pendingQuizId;
    app.pendingQuizId = null;
    renderShared(id);
  }
}
