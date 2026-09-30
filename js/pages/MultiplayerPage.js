import { api, serverFeatures } from '../api.js';
import { app } from '../app.js';
import { unlockAudio } from '../audio/synth.js';
import { ErrorState } from '../components/ErrorState.js';
import { RoomSettingsForm } from '../components/RoomSettingsForm.js';
import { TopBar } from '../components/TopBar.js';
import { navigate } from '../router.js';
import { loadRoomSeat, loadUsername, saveRoomSeat, saveUsername } from '../storage/storage.js';
import { esc, html } from '../utils.js';

export function mount(root) {
  root.append(TopBar());
  const main = html(`
    <main class="gts-page">
      <header class="gts-head">
        <span class="ln-label-caps ln-muted">Side B · With friends</span>
        <h1 class="ln-headline-lg">Play in a room.</h1>
        <p class="ln-body-md ln-italic ln-muted ln-measure">Everyone hears the same clip at the same moment. The fastest right answer takes the most points.</p>
      </header>
      <div data-body><p class="ln-label-caps ln-muted">Connecting…</p></div>
    </main>`);
  root.append(main);
  const body = main.querySelector('[data-body]');

  serverFeatures().then((features) => {
    if (!features?.multiplayer) {
      body.replaceChildren(
        ErrorState({
          title: 'Rooms need the game server.',
          message: 'This copy of the game is running without its server, so rooms aren’t available. Solo play still works.',
          actions: [{ label: 'Play solo', primary: true, onClick: () => navigate('play') }],
        }),
      );
      return;
    }
    render();
  });

  function render() {
    const seat = loadRoomSeat();
    const prefillCode = app.pendingRoomCode ?? '';
    const hostQuizId = app.pendingHostQuizId ?? null;
    const focusJoin = app.focusJoin || Boolean(prefillCode);
    app.pendingRoomCode = null;
    app.pendingHostQuizId = null;
    app.focusJoin = false;
    const name = loadUsername();

    body.replaceChildren(html(`
      <div class="gts-stack">
        ${seat ? `
        <div class="ln-sleeve ln-btn-row" style="justify-content:space-between">
          <span class="ln-body-md">You’re still in room <strong class="ln-data-md">${esc(seat.code)}</strong>.</span>
          <button type="button" class="ln-btn ln-btn--primary" data-rejoin>Rejoin room</button>
        </div>` : ''}
        <div class="gts-split" style="padding-top:0">
          <form class="gts-stack" data-form="join" novalidate>
            <p class="ln-section-label">Join a room</p>
            <div class="ln-field" data-code-field>
              <label class="ln-field__label" for="join-code">Room code</label>
              <input id="join-code" class="ln-input ln-input--code" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="4" placeholder="D0CE" value="${esc(prefillCode)}" required>
            </div>
            <div class="ln-field">
              <label class="ln-field__label" for="join-name">Your name</label>
              <input id="join-name" class="ln-input" maxlength="20" autocomplete="nickname" placeholder="Name" value="${esc(name)}" required>
            </div>
            <p class="ln-form-msg ln-error-text" aria-live="polite"></p>
            <div><button type="submit" class="ln-btn ln-btn--primary">Join room</button></div>
          </form>
          <form class="gts-stack" data-form="host" novalidate>
            <p class="ln-section-label">Host a room</p>
            <div class="ln-field">
              <label class="ln-field__label" for="host-name">Your name</label>
              <input id="host-name" class="ln-input" maxlength="20" autocomplete="nickname" placeholder="Name" value="${esc(name)}" required>
            </div>
            <div class="ln-sleeve" data-settings></div>
            <p class="ln-form-msg ln-error-text" aria-live="polite"></p>
            <div><button type="submit" class="ln-btn ln-btn--primary">Start a room</button></div>
          </form>
        </div>
      </div>`));

    const settingsForm = RoomSettingsForm({ initial: { quizLocalId: hostQuizId }, idPrefix: 'host' });
    body.querySelector('[data-settings]').append(settingsForm.element);
    body.querySelector('[data-rejoin]')?.addEventListener('click', () => navigate('room'));

    const codeInput = body.querySelector('#join-code');
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    if (focusJoin) (prefillCode ? body.querySelector('#join-name') : codeInput).focus();

    body.querySelector('[data-form="join"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const msg = form.querySelector('.ln-form-msg');
      const code = codeInput.value.trim();
      const playerName = form.querySelector('#join-name').value.trim();
      const codeField = form.querySelector('[data-code-field]');
      codeField.classList.toggle('ln-field--error', code.length !== 4);
      if (code.length !== 4) return fail(msg, 'Room codes are four letters.', codeInput);
      if (!playerName) return fail(msg, 'Enter your name.', form.querySelector('#join-name'));
      await submit(form, msg, () => api(`rooms/${code}/join`, { method: 'POST', body: { name: playerName } }), playerName);
    });

    body.querySelector('[data-form="host"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const msg = form.querySelector('.ln-form-msg');
      const playerName = form.querySelector('#host-name').value.trim();
      if (!playerName) return fail(msg, 'Enter your name.', form.querySelector('#host-name'));
      const settings = settingsForm.value();
      app.lastRoomSettings = settings;
      await submit(form, msg, () => api('rooms', { method: 'POST', body: { name: playerName, settings } }), playerName);
    });
  }

  function fail(msg, text, input) {
    msg.textContent = text;
    input?.focus();
  }

  async function submit(form, msg, request, playerName) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    msg.textContent = '';
    unlockAudio(); // this click counts as the gesture that allows audio later
    try {
      const seat = await request();
      saveUsername(playerName);
      saveRoomSeat(seat);
      navigate('room');
    } catch (err) {
      msg.textContent = err.message;
      button.disabled = false;
    }
  }
}
