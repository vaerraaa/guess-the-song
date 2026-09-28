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
    <main class="container multiplayer">
      <header class="page-head">
        <h1>Play with friends</h1>
        <p class="muted">Everyone hears the same song at the same time. Fastest right answer wins the most points.</p>
      </header>
      <div class="mp-body"><p class="muted">Connecting…</p></div>
    </main>`);
  root.append(main);
  const body = main.querySelector('.mp-body');

  serverFeatures().then((features) => {
    if (!features?.multiplayer) {
      body.replaceChildren(
        ErrorState({
          icon: '📡',
          title: 'Multiplayer needs the game server.',
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
    app.pendingRoomCode = null;
    app.pendingHostQuizId = null;
    const name = loadUsername();

    body.replaceChildren(html(`
      <div class="mp-grid">
        ${seat ? `
        <div class="card rejoin-card">
          <p><strong>You’re still in room ${esc(seat.code)}.</strong></p>
          <button type="button" class="btn btn-primary" data-rejoin>Rejoin room</button>
        </div>` : ''}
        <form class="card mp-card" data-form="join" novalidate>
          <h2>Join a game</h2>
          <p class="muted small">Ask the host for the 4-letter room code.</p>
          <label class="field-label" for="join-code">Room code</label>
          <input id="join-code" class="text-input code-input" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="4" placeholder="ABCD" value="${esc(prefillCode)}" required>
          <label class="field-label" for="join-name">Your name</label>
          <input id="join-name" class="text-input" maxlength="20" autocomplete="nickname" placeholder="Your name" value="${esc(name)}" required>
          <p class="form-msg error-text" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">Join</button>
        </form>
        <form class="card mp-card" data-form="host" novalidate>
          <h2>Host a game</h2>
          <p class="muted small">Create a room, then share the code or link.</p>
          <label class="field-label" for="host-name">Your name</label>
          <input id="host-name" class="text-input" maxlength="20" autocomplete="nickname" placeholder="Your name" value="${esc(name)}" required>
          <div class="settings-slot"></div>
          <p class="form-msg error-text" aria-live="polite"></p>
          <button type="submit" class="btn btn-primary btn-lg btn-block">Create room</button>
        </form>
      </div>`));

    const settingsForm = RoomSettingsForm({ initial: { quizLocalId: hostQuizId }, idPrefix: 'host' });
    body.querySelector('.settings-slot').append(settingsForm.element);

    body.querySelector('[data-rejoin]')?.addEventListener('click', () => navigate('room'));

    const codeInput = body.querySelector('#join-code');
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    });
    if (prefillCode) body.querySelector('#join-name').focus();

    body.querySelector('[data-form="join"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const msg = form.querySelector('.form-msg');
      const code = codeInput.value.trim();
      const playerName = form.querySelector('#join-name').value.trim();
      if (code.length !== 4) return fail(msg, 'Room codes are 4 letters.', codeInput);
      if (!playerName) return fail(msg, 'Enter your name.', form.querySelector('#join-name'));
      await submit(form, msg, () => api(`rooms/${code}/join`, { method: 'POST', body: { name: playerName } }), playerName);
    });

    body.querySelector('[data-form="host"]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const msg = form.querySelector('.form-msg');
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
