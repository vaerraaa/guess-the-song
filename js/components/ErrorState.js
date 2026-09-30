import { esc, html } from '../utils.js';

/** A red-pen error block: headline, explanation, up to two actions. actions: [{ label, onClick, primary }] */
export function ErrorState({ title, message = '', actions = [] }) {
  const element = html(`
    <div class="gts-error" role="alert">
      <p class="ln-label-caps gts-error__title">✗ Error</p>
      <h2 class="ln-headline-md">${esc(title)}</h2>
      ${message ? `<p class="ln-body-md ln-muted ln-measure">${esc(message)}</p>` : ''}
      <div class="ln-btn-row"></div>
    </div>`);
  const row = element.querySelector('.ln-btn-row');
  for (const { label, onClick, primary } of actions) {
    const btn = html(`<button type="button" class="ln-btn ${primary ? 'ln-btn--primary' : 'ln-btn--secondary'}">${esc(label)}</button>`);
    btn.addEventListener('click', onClick);
    row.append(btn);
  }
  return element;
}
