import { esc, html } from '../utils.js';

/** Friendly error panel with up to two actions. actions: [{ label, onClick, primary }] */
export function ErrorState({ icon = '🎧', title, message = '', actions = [] }) {
  const element = html(`
    <div class="error-state" role="alert">
      <div class="error-icon" aria-hidden="true">${icon}</div>
      <h2 class="error-title">${esc(title)}</h2>
      ${message ? `<p class="error-message">${esc(message)}</p>` : ''}
      <div class="btn-row"></div>
    </div>`);
  const row = element.querySelector('.btn-row');
  for (const { label, onClick, primary } of actions) {
    const btn = html(`<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-ghost'}">${esc(label)}</button>`);
    btn.addEventListener('click', onClick);
    row.append(btn);
  }
  return element;
}
