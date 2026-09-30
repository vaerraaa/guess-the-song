import { DIFFICULTIES, MODES } from '../config.js';
import { availableCategories } from '../core/questions.js';
import { SONGS } from '../data/songs.js';
import { getLocalQuiz, listQuizzes } from '../storage/storage.js';
import { esc, html } from '../utils.js';

const MULTIPLAYER_MODES = ['classic', 'speed'];
const QUESTION_COUNTS = [5, 10, 15, 20];

/**
 * Host settings for a multiplayer game. value() returns the settings object the server expects
 * (custom quizzes are sent in full, since they live on the host's device).
 */
export function RoomSettingsForm({ initial = {}, idPrefix = 'rs' }) {
  const categories = availableCategories(SONGS);
  const quizzes = listQuizzes();
  const source = initial.quizLocalId ? `quiz:${initial.quizLocalId}` : initial.categoryId ?? 'all';
  const element = html(`
    <div class="gts-stack">
      <div class="ln-field">
        <span class="ln-field__label" id="${idPrefix}-mode-label">Format</span>
        <span class="ln-segment" role="radiogroup" aria-labelledby="${idPrefix}-mode-label">
          ${MULTIPLAYER_MODES.map((id) => `<label><input type="radio" name="${idPrefix}-mode" value="${id}" ${id === (initial.modeId ?? 'classic') ? 'checked' : ''}><span>${esc(MODES[id].name)} · ${MODES[id].timeLimitSec}s</span></label>`).join('')}
        </span>
      </div>
      <div class="ln-field">
        <label class="ln-field__label" for="${idPrefix}-source">Record</label>
        <select id="${idPrefix}-source" class="ln-input">
          <optgroup label="Categories">
            ${categories.map((c) => `<option value="${c.id}" ${source === c.id ? 'selected' : ''}>${esc(c.code)} · ${esc(c.name)} (${c.count})</option>`).join('')}
          </optgroup>
          ${quizzes.length ? `<optgroup label="Your quizzes">
            ${quizzes.map((q) => `<option value="quiz:${esc(q.localId)}" ${source === `quiz:${q.localId}` ? 'selected' : ''}>GTS-Q · ${esc(q.title)} (${q.tracks.length})</option>`).join('')}
          </optgroup>` : ''}
        </select>
      </div>
      <div class="ln-inline-form">
        <div class="ln-field">
          <label class="ln-field__label" for="${idPrefix}-difficulty">Difficulty</label>
          <select id="${idPrefix}-difficulty" class="ln-input">
            ${Object.values(DIFFICULTIES).map((d) => `<option value="${d.id}" ${d.id === (initial.difficultyId ?? 'medium') ? 'selected' : ''}>${esc(d.name)} · ${d.previewSec}s clip</option>`).join('')}
          </select>
        </div>
        <div class="ln-field">
          <label class="ln-field__label" for="${idPrefix}-count">Tracks</label>
          <select id="${idPrefix}-count" class="ln-input">
            ${QUESTION_COUNTS.map((n) => `<option value="${n}" ${n === (initial.questionCount ?? 10) ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`);

  return {
    element,
    value() {
      const sourceValue = element.querySelector(`#${idPrefix}-source`).value;
      const settings = {
        modeId: element.querySelector(`input[name="${idPrefix}-mode"]:checked`).value,
        difficultyId: element.querySelector(`#${idPrefix}-difficulty`).value,
        questionCount: Number(element.querySelector(`#${idPrefix}-count`).value),
        categoryId: 'all',
        quiz: null,
      };
      if (sourceValue.startsWith('quiz:')) {
        const quiz = getLocalQuiz(sourceValue.slice(5));
        if (quiz) settings.quiz = { title: quiz.title, tracks: quiz.tracks };
        settings.quizLocalId = quiz?.localId;
      } else {
        settings.categoryId = sourceValue;
      }
      return settings;
    },
  };
}
