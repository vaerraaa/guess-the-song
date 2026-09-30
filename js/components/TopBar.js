import { app } from '../app.js';
import { html } from '../utils.js';
import { openHowToPlay } from './HowToPlay.js';
import { openSettings } from './Settings.js';

const LINKS = [
  ['play', 'Solo'],
  ['multiplayer', 'With friends'],
  ['quizzes', 'My quizzes'],
  ['leaderboard', 'Leaderboard'],
];

/** The booklet's running header: home, sections, and the two printing controls. */
export function TopBar() {
  const element = html(`
    <nav class="ln-label-caps gts-topbar" aria-label="Main">
      <a class="gts-topbar__home" href="#/" aria-label="Guess the Song — home">GTS · Liner Notes</a>
      <div class="gts-topbar__links">
        ${LINKS.map(([route, label]) => `<a href="#/${route}" ${app.route === route ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
        <span class="gts-topbar__sep hide-sm" aria-hidden="true">|</span>
        <button type="button" data-howto>How to play</button>
        <button type="button" class="hide-sm" data-anim></button>
        <button type="button" class="hide-sm" data-theme-toggle></button>
        <button type="button" data-settings>Settings</button>
      </div>
    </nav>`);

  const animBtn = element.querySelector('[data-anim]');
  const themeBtn = element.querySelector('[data-theme-toggle]');
  const render = () => {
    animBtn.textContent = `Animations ${app.settings.animations ? 'on' : 'off'}`;
    animBtn.setAttribute('aria-pressed', String(app.settings.animations));
    themeBtn.textContent = app.settings.theme === 'light' ? 'Night printing' : 'Day printing';
    themeBtn.setAttribute('aria-label', `Switch to ${app.settings.theme === 'light' ? 'dark' : 'light'} theme`);
  };
  render();
  animBtn.addEventListener('click', () => {
    app.updateSettings({ animations: !app.settings.animations });
    render();
  });
  themeBtn.addEventListener('click', () => {
    app.updateSettings({ theme: app.settings.theme === 'light' ? 'dark' : 'light' });
    render();
  });
  element.querySelector('[data-howto]').addEventListener('click', openHowToPlay);
  element.querySelector('[data-settings]').addEventListener('click', () => openSettings().closed.then(render));
  return element;
}
