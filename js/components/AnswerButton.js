import { esc, html } from '../utils.js';

const KEYS = ['A', 'B', 'C', 'D'];

/**
 * One answer choice. States after reveal (never colour-only — each gets an icon + text label):
 *   'correct'  the right answer (✓ Correct)
 *   'wrong'    the player's wrong pick (✗ Your answer)
 *   'missed'   the right answer when the player got it wrong (✓ Correct answer)
 *   'dimmed'   other options
 */
export function AnswerButton({ song, index, onSelect }) {
  const element = html(`
    <button type="button" class="answer" data-index="${index}" aria-keyshortcuts="${index + 1} ${KEYS[index]}"
      aria-label="Option ${KEYS[index]}: ${esc(song.title)} by ${esc(song.artist)}" style="--i:${index}">
      <span class="answer-key" aria-hidden="true">${KEYS[index]}</span>
      <span class="answer-text">
        <span class="answer-title">${esc(song.title)}</span>
        <span class="answer-artist">${esc(song.artist)}</span>
      </span>
      <span class="answer-badge" aria-hidden="true"></span>
    </button>`);
  element.addEventListener('click', () => onSelect(index));

  const BADGES = {
    correct: ['✓', 'Correct'],
    missed: ['✓', 'Correct answer'],
    wrong: ['✗', 'Your answer'],
  };

  return {
    element,
    setDisabled(disabled) {
      element.disabled = disabled;
    },
    setState(state) {
      element.dataset.state = state;
      const badge = BADGES[state];
      element.querySelector('.answer-badge').innerHTML = badge ? `<span>${badge[0]}</span> ${badge[1]}` : '';
      if (badge) element.setAttribute('aria-label', `${badge[1]}: ${song.title} by ${song.artist}`);
    },
  };
}
