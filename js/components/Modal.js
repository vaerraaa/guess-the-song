import { esc, html } from '../utils.js';

/**
 * Opens a native <dialog> (focus trapping + Esc handled by the browser).
 * `content` is a DOM node. Returns { dialog, close, closed: Promise<returnValue> }.
 */
export function openModal({ title, content, className = '', labelledBy = 'modal-title' }) {
  const dialog = html(`
    <dialog class="modal ${esc(className)}" aria-labelledby="${labelledBy}">
      <div class="modal-inner">
        <header class="modal-header">
          <h2 id="${labelledBy}">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">✕</button>
        </header>
        <div class="modal-body"></div>
      </div>
    </dialog>`);
  dialog.querySelector('.modal-body').append(content);
  document.body.append(dialog);

  const closed = new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(dialog.returnValue);
      dialog.remove();
    });
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close('cancel');
  });

  dialog.showModal();
  return { dialog, close: (value = '') => dialog.close(value), closed };
}

/** Promise<boolean> confirm dialog. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  const content = html(`
    <div class="confirm">
      <p>${esc(message)}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-ghost" data-value="cancel">${esc(cancelLabel)}</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-value="ok">${esc(confirmLabel)}</button>
      </div>
    </div>`);
  const modal = openModal({ title, content, className: 'modal-small', labelledBy: 'confirm-title' });
  content.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) modal.close(btn.dataset.value);
  });
  content.querySelector('[data-value="cancel"]').focus();
  return modal.closed.then((value) => value === 'ok');
}
