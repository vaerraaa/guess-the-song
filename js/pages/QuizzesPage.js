import { api } from '../api.js';
import { app } from '../app.js';
import { ErrorState } from '../components/ErrorState.js';
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
    <main class="container quizzes">
      <header class="page-head page-head-row">
        <div>
          <h1>Custom quizzes</h1>
          <p class="muted">Turn your own playlists into a guessing game, then play solo or with friends.</p>
        </div>
        <button type="button" class="btn btn-primary btn-lg" data-new>+ New quiz</button>
      </header>
      <section class="shared-slot"></section>
      <section class="quiz-grid" aria-label="Your quizzes"></section>
    </main>`);
  root.append(main);
  main.querySelector('[data-new]').addEventListener('click', () => {
    app.editingQuizLocalId = null;
    navigate('quiz-editor');
  });

  const grid = main.querySelector('.quiz-grid');

  function renderList() {
    const quizzes = listQuizzes();
    if (quizzes.length === 0) {
      grid.innerHTML = `
        <div class="empty card empty-wide">
          <div class="empty-icon" aria-hidden="true">🎼</div>
          <p><strong>No quizzes yet.</strong></p>
          <p class="muted">Import a Deezer or Spotify playlist, paste a list of songs, or search and pick them one by one.</p>
          <button type="button" class="btn btn-primary" data-new-empty>Make your first quiz</button>
        </div>`;
      grid.querySelector('[data-new-empty]').addEventListener('click', () => {
        app.editingQuizLocalId = null;
        navigate('quiz-editor');
      });
      return;
    }
    grid.replaceChildren(...quizzes.map(quizCard));
  }

  function quizCard(quiz) {
    const card = html(`
      <article class="quiz-card card">
        ${quizCover(quiz)}
        <div class="quiz-card-body">
          <h2 class="quiz-title">${esc(quiz.title)}</h2>
          <p class="muted">${quiz.tracks.length} songs${quiz.remoteId ? ' · <span class="chip">Shared</span>' : ''}</p>
          <div class="quiz-actions">
            <button type="button" class="btn btn-primary btn-small" data-act="play">Play</button>
            <button type="button" class="btn btn-ghost btn-small" data-act="friends">With friends</button>
            <button type="button" class="btn btn-ghost btn-small" data-act="share">Share link</button>
            <button type="button" class="btn btn-ghost btn-small" data-act="edit">Edit</button>
            <button type="button" class="icon-btn icon-btn-small" data-act="delete" aria-label="Delete ${esc(quiz.title)}">🗑</button>
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
    const slot = main.querySelector('.shared-slot');
    slot.innerHTML = '<div class="card shared-card loading-card">Loading shared quiz…</div>';
    try {
      const quiz = await api(`quizzes/${encodeURIComponent(id)}`);
      const alreadySaved = listQuizzes().find((q) => q.remoteId === id || q.sharedFrom === id);
      const card = html(`
        <div class="card shared-card">
          ${quizCover(quiz, 'quiz-cover-lg')}
          <div class="shared-body">
            <p class="eyebrow">Shared with you</p>
            <h2>${esc(quiz.title)}</h2>
            <p class="muted">${quiz.tracks.length} songs · played ${quiz.plays ?? 0} times</p>
            <div class="quiz-actions">
              <button type="button" class="btn btn-primary" data-shared="play">Play solo</button>
              <button type="button" class="btn btn-ghost" data-shared="friends">Play with friends</button>
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
          icon: '🔗',
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
