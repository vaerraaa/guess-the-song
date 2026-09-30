import { app } from '../app.js';
import { DEFAULT_SETTINGS } from '../config.js';
import { resetAllData } from '../storage/storage.js';
import { html } from '../utils.js';
import { confirmDialog, openModal } from './Modal.js';
import { toast } from './Toast.js';

const TOGGLES = [
  { key: 'sound', label: 'Sound effects', hint: 'Clicks and the right/wrong cues' },
  { key: 'music', label: 'Menu music', hint: 'A soft pad on the menus, never during a round' },
  { key: 'animations', label: 'Animations', hint: 'Spinning disc, waveform and floating covers' },
];

export function openSettings() {
  const s = app.settings;
  const content = html(`
    <form class="ln-list" onsubmit="return false">
      ${TOGGLES.map(({ key, label, hint }) => `
        <label class="ln-setting">
          <span><strong class="ln-body-md">${label}</strong><small>${hint}</small></span>
          <input type="checkbox" role="switch" class="ln-switch" name="${key}" ${s[key] ? 'checked' : ''}>
        </label>`).join('')}
      <fieldset class="ln-setting">
        <legend class="sr-only">Printing</legend>
        <span><strong class="ln-body-md">Printing</strong><small>Ink on paper, or cream ink on black board</small></span>
        <span class="ln-segment">
          <label><input type="radio" name="theme" value="light" ${s.theme === 'light' ? 'checked' : ''}><span>Day</span></label>
          <label><input type="radio" name="theme" value="dark" ${s.theme === 'dark' ? 'checked' : ''}><span>Night</span></label>
        </span>
      </fieldset>
      <fieldset class="ln-setting">
        <legend class="sr-only">Song previews</legend>
        <span><strong class="ln-body-md">Song previews</strong><small>Real 30-second previews need internet. Offline plays placeholder tunes.</small></span>
        <span class="ln-segment">
          <label><input type="radio" name="audioSource" value="online" ${s.audioSource === 'online' ? 'checked' : ''}><span>Online</span></label>
          <label><input type="radio" name="audioSource" value="offline" ${s.audioSource === 'offline' ? 'checked' : ''}><span>Offline</span></label>
        </span>
      </fieldset>
      <div class="ln-setting">
        <span><strong class="ln-body-md">Reset this device</strong><small>Clears scores, stats, quizzes, your name and settings</small></span>
        <button type="button" class="ln-btn ln-btn--danger ln-btn--small" data-reset>Reset</button>
      </div>
    </form>`);

  content.addEventListener('change', (e) => {
    const input = e.target;
    app.updateSettings({ [input.name]: input.type === 'checkbox' ? input.checked : input.value });
  });

  const modal = openModal({ title: 'Settings', content });

  content.querySelector('[data-reset]').addEventListener('click', async () => {
    modal.close();
    const ok = await confirmDialog({
      title: 'Reset all data?',
      message: 'This permanently clears your scores, stats, custom quizzes, name and settings on this device. Shared quiz links keep working.',
      confirmLabel: 'Reset everything',
      danger: true,
    });
    if (!ok) return;
    resetAllData();
    app.updateSettings({ ...DEFAULT_SETTINGS });
    toast('Local data cleared.');
    window.dispatchEvent(new CustomEvent('gts:data-reset'));
  });

  return modal;
}
