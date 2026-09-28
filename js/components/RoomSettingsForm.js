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
    <div class="room-settings">
      <div class="field">
        <span class="field-label" id="${idPrefix}-mode-label">Mode</span>
        <span class="segmented segmented-wide" role="radiogroup" aria-labelledby="${idPrefix}-mode-label">
          ${MULTIPLAYER_MODES.map((id) => `<label><input type="radio" name="${idPrefix}-mode" value="${id}" ${id === (initial.modeId ?? 'classic') ? 'checked' : ''}><span>${MODES[id].icon} ${MODES[id].name} <small>${MODES[id].timeLimitSec}s</small></span></label>`).join('')}
        </span>
      </div>
      <div class="field">
        <label class="field-label" for="${idPrefix}-source">Songs</label>
        <select id="${idPrefix}-source" class="text-input select">
          <optgroup label="Categories">
            ${categories.map((c) => `<option value="${c.id}" ${source === c.id ? 'selected' : ''}>${c.icon} ${esc(c.name)} (${c.count})</option>`).join('')}
          </optgroup>
          ${quizzes.length ? `<optgroup label="Your quizzes">
            ${quizzes.map((q) => `<option value="quiz:${q.localId}" ${source === `quiz:${q.localId}` ? 'selected' : ''}>🎼 ${esc(q.title)} (${q.tracks.length})</option>`).join('')}
          </optgroup>` : ''}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label" for="${idPrefix}-difficulty">Difficulty</label>
          <select id="${idPrefix}-difficulty" class="text-input select">
            ${Object.values(DIFFICULTIES).map((d) => `<option value="${d.id}" ${d.id === (initial.difficultyId ?? 'medium') ? 'selected' : ''}>${d.name} · ${d.previewSec}s preview</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="${idPrefix}-count">Songs per game</label>
          <select id="${idPrefix}-count" class="text-input select">
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
