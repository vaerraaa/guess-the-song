import { esc, html } from '../utils.js';

let region = null;

export function toast(message, { timeoutMs = 3200 } = {}) {
  if (!region || !region.isConnected) {
    region = html('<div class="ln-toast-region" role="status" aria-live="polite"></div>');
    document.body.append(region);
  }
  const item = html(`<div class="ln-toast">${esc(message)}</div>`);
  region.append(item);
  setTimeout(() => {
    item.classList.add('ln-toast--out');
    setTimeout(() => item.remove(), 250);
  }, timeoutMs);
}
