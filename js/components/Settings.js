import { app } from '../app.js';
import { DEFAULT_SETTINGS } from '../config.js';
import { resetAllData } from '../storage/storage.js';
import { html } from '../utils.js';
import { confirmDialog, openModal } from './Modal.js';
import { toast } from './Toast.js';

const TOGGLES = [
  { key: 'sound', label: 'Sound effects', hint: 'Clicks, correct and wrong cues' },
  { key: 'music', label: 'Menu music', hint: 'Soft ambient music outside of games' },
  { key: 'animations', label: 'Animations', hint: 'Motion and celebration effects' },
];

export function openSettings() {
  const s = app.settings;
  const content = html(`
    <form class="settings" onsubmit="return false">
      ${TOGGLES.map(({ key, label, hint }) => `
        <label class="setting-row">
          <span><strong>${label}</strong><small>${hint}</small></span>
          <input type="checkbox" role="switch" class="switch" name="${key}" ${s[key] ? 'checked' : ''}>
        </label>`).join('')}

      <fieldset class="setting-row">
        <legend class="sr-only">Theme</legend>
        <span><strong>Theme</strong><small>Dark or light interface</small></span>
        <span class="segmented">
          <label><input type="radio" name="theme" value="dark" ${s.theme === 'dark' ? 'checked' : ''}><span>Dark</span></label>
          <label><input type="radio" name="theme" value="light" ${s.theme === 'light' ? 'checked' : ''}><span>Light</span></label>
        </span>
      </fieldset>

      <fieldset class="setting-row">
        <legend class="sr-only">Song previews</legend>
        <span><strong>Song previews</strong><small>Real 30s store previews need internet. Offline plays placeholder tunes.</small></span>
        <span class="segmented">
          <label><input type="radio" name="audioSource" value="online" ${s.audioSource === 'online' ? 'checked' : ''}><span>Online</span></label>
          <label><input type="radio" name="audioSource" value="offline" ${s.audioSource === 'offline' ? 'checked' : ''}><span>Offline</span></label>
        </span>
      </fieldset>

      <div class="setting-row danger-zone">
        <span><strong>Reset local data</strong><small>Clears scores, stats, quizzes, username and settings on this device</small></span>
        <button type="button" class="btn btn-danger btn-small" data-reset>Reset</button>
      </div>
    </form>`);

  content.addEventListener('change', (e) => {
    const input = e.target;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    app.updateSettings({ [input.name]: value });
  });

  const modal = openModal({ title: 'Settings', content });

  content.querySelector('[data-reset]').addEventListener('click', async () => {
    modal.close();
    const ok = await confirmDialog({
      title: 'Reset all data?',
      message: 'This permanently clears your scores, stats, custom quizzes, username and settings on this device. Shared quiz links keep working.',
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
