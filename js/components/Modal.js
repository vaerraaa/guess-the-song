import { esc, html } from '../utils.js';

/**
 * Opens a native <dialog> (focus trapping + Esc handled by the browser), styled as a
 * Liner Notes dialog: a boxed sheet on the scrim. Returns { dialog, close, closed }.
 */
export function openModal({ title, content, wide = false, labelledBy = 'modal-title' }) {
  const dialog = html(`
    <dialog class="ln-dialog ${wide ? 'ln-dialog--wide' : ''}" aria-labelledby="${labelledBy}">
      <div class="ln-dialog__head">
        <h2 class="ln-dialog__title" id="${labelledBy}">${esc(title)}</h2>
        <button type="button" class="ln-dialog__close" data-close>Close</button>
      </div>
      <div class="ln-dialog__body"></div>
    </dialog>`);
  dialog.querySelector('.ln-dialog__body').append(content);
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
    <div class="gts-stack">
      <p class="ln-body-md">${esc(message)}</p>
      <div class="ln-btn-row">
        <button type="button" class="ln-btn ${danger ? 'ln-btn--danger' : 'ln-btn--primary'}" data-value="ok">${esc(confirmLabel)}</button>
        <button type="button" class="ln-btn ln-btn--secondary" data-value="cancel">${esc(cancelLabel)}</button>
      </div>
    </div>`);
  const modal = openModal({ title, content, labelledBy: 'confirm-title' });
  content.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (btn) modal.close(btn.dataset.value);
  });
  content.querySelector('[data-value="cancel"]').focus();
  return modal.closed.then((value) => value === 'ok');
}
