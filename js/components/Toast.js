import { esc, html } from '../utils.js';

let region = null;

export function toast(message, { timeoutMs = 3200 } = {}) {
  if (!region) {
    region = html('<div class="toast-region" role="status" aria-live="polite"></div>');
    document.body.append(region);
  }
  const item = html(`<div class="toast">${esc(message)}</div>`);
  region.append(item);
  setTimeout(() => {
    item.classList.add('toast-out');
    setTimeout(() => item.remove(), 300);
  }, timeoutMs);
}
