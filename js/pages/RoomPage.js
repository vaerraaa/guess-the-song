import { api, appUrl } from '../api.js';
import { app } from '../app.js';
import { audioManager } from '../audio/audioManager.js';
import { sfx, unlockAudio } from '../audio/synth.js';
import { ErrorState } from '../components/ErrorState.js';
import { avatar, catalog, creditLine, Disc, equalizer, live, mark, pad2, TrackRow, waveform } from '../components/ln.js';
import { confirmDialog } from '../components/Modal.js';
import { RoomSettingsForm } from '../components/RoomSettingsForm.js';
import { createCountdown } from '../components/Timer.js';
import { toast } from '../components/Toast.js';
import { copyText } from '../quizActions.js';
import { navigate } from '../router.js';
import { loadRoomSeat, saveRoomSeat } from '../storage/storage.js';
import { esc, formatNumber, formatSeconds, generatedArtwork, html } from '../utils.js';

const KEY_TO_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
const LIVE_AT = 3;

export function mount(root) {
  const seat = loadRoomSeat();
  if (!seat) {
    navigate('multiplayer', { replace: true });
    return {};
  }

  let state = null;
  let clockOffset = null; // serverTime ≈ Date.now() + clockOffset
  let renderedKey = null; // phase + question number currently on screen
  let events = null;
  let closed = false;
  let countdown = null;
  let startTimer = null;
  let leadInTimer = null;
  let revealTimer = null;
  let rows = [];
  let myChoice = null;
  let settingsForm = null;
  let disc = null;
  let hostControls = null;
  let lastMessage = null;
  const serverNow = () => Date.now() + (clockOffset ?? 0);

  const shell = html(`
    <main class="gts-page">
      <div class="ln-strip ln-strip--sticky">
        <span class="ln-strip__items">
          <button type="button" class="ln-strip__btn" data-copy aria-label="Copy invite link for room ${esc(seat.code)}">Room <span style="color:var(--color-on-surface)">${esc(seat.code)}</span></button>
          <span class="ln-strip__dot">·</span>
          <span data-strip-info></span>
          <span data-status aria-live="polite" style="color:var(--color-tertiary)"></span>
        </span>
        <span class="ln-strip__actions">
          <span data-time></span>
          <button type="button" class="ln-strip__btn" data-mute aria-keyshortcuts="M"></button>
          <button type="button" class="ln-strip__btn" data-leave>Leave</button>
        </span>
      </div>
      <div data-view><p class="ln-label-caps ln-muted" style="padding:48px 0">Connecting to the room…</p></div>
      <p class="sr-only" aria-live="assertive" data-announce></p>
    </main>`);
  root.append(shell);
  const view = shell.querySelector('[data-view]');
  const statusEl = shell.querySelector('[data-status]');
  const infoEl = shell.querySelector('[data-strip-info]');
  const timeEl = shell.querySelector('[data-time]');
  const announce = (text) => {
    const el = shell.querySelector('[data-announce]');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 50);
  };

  // ── Strip controls ────────────────────────────────────────────────
  const muteBtn = shell.querySelector('[data-mute]');
  const renderMute = () => {
    muteBtn.textContent = audioManager.muted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(audioManager.muted));
  };
  renderMute();
  muteBtn.addEventListener('click', () => {
    audioManager.setMuted(!audioManager.muted);
    renderMute();
  });

  const inviteLink = () => appUrl({ room: seat.code });
  const copyInvite = async () => toast((await copyText(inviteLink())) ? 'Invite link copied.' : `Invite link: ${inviteLink()}`);
  shell.querySelector('[data-copy]').addEventListener('click', copyInvite);

  shell.querySelector('[data-leave]').addEventListener('click', async () => {
    const inGame = state && ['starting', 'question', 'reveal'].includes(state.phase);
    const ok = await confirmDialog({
      title: 'Leave the room?',
      message: inGame ? 'The others can keep playing without you.' : 'You can rejoin with the same code while the room is open.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      danger: true,
    });
    if (!ok) return;
    await leaveRoom();
    navigate('home');
  });

  async function leaveRoom() {
    closed = true;
    events?.close();
    api(`rooms/${seat.code}/leave`, { method: 'POST', body: seat }).catch(() => {});
    saveRoomSeat(null);
  }

  const action = (name, body = {}) => api(`rooms/${seat.code}/${name}`, { method: 'POST', body: { ...seat, ...body } });

  // ── Live connection ───────────────────────────────────────────────
  function connect() {
    const url = `/api/rooms/${encodeURIComponent(seat.code)}/stream?${new URLSearchParams({ player: seat.playerId, token: seat.token })}`;
    events = new EventSource(url);
    events.onmessage = (e) => {
      const received = Date.now();
      const next = JSON.parse(e.data);
      // Keep the largest estimate: it has the least network delay baked in.
      const estimate = next.now - received;
      clockOffset = clockOffset == null ? estimate : Math.max(clockOffset, estimate);
      statusEl.textContent = '';
      state = next;
      render();
    };
    events.onerror = () => {
      if (closed) return;
      if (events.readyState === EventSource.CLOSED) {
        // The server refused the stream: the room is gone or we were removed.
        saveRoomSeat(null);
        stopRound();
        view.replaceChildren(
          ErrorState({
            title: 'This room has closed.',
            message: 'The room ended, or you were removed after being away too long.',
            actions: [
              { label: 'Join another room', primary: true, onClick: () => navigate('multiplayer') },
              { label: 'Back to the booklet', onClick: () => navigate('home') },
            ],
          }),
        );
        closed = true;
      } else {
        statusEl.textContent = '· Reconnecting…';
      }
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────
  const me = () => state.players.find((p) => p.id === state.you);
  const isHost = () => state.hostId === state.you;

  function sourceCatalog(s) {
    return s.source.kind === 'quiz' ? catalog('GTS-Q', s.source.title) : catalog(s.source.code, s.source.name);
  }

  function renderInfo() {
    const mine = me();
    const q = state.question;
    if (state.phase === 'question' || state.phase === 'reveal') {
      infoEl.innerHTML = `Track ${pad2(q.number)} / ${pad2(q.total)} <span class="ln-strip__dot">·</span> ${formatNumber(mine?.score ?? 0)} pts${mine?.streak > 1 ? ` <span class="ln-strip__dot">·</span> Streak ${mine.streak}` : ''}`;
    } else {
      infoEl.textContent = `${state.players.length} in the room`;
    }
  }

  function renderTime(seconds) {
    timeEl.innerHTML = seconds == null ? '' : seconds <= LIVE_AT ? live(pad2(seconds)) : `<span class="ln-strip__time">${pad2(seconds)}</span>`;
    disc?.setSeconds(seconds);
  }

  function playerRows(players, { answered = false } = {}) {
    return players
      .map((p, i) => {
        const status = answered
          ? p.answered ? mark('correct', 'Locked in') : `<span class="ln-label-caps ln-muted">${p.connected ? 'Thinking' : 'Away'}</span>`
          : `<span class="ln-label-caps ln-muted">${p.id === state.hostId ? 'Host' : p.id === state.you ? 'You' : p.connected ? 'Ready' : 'Away'}</span>`;
        return `
          <div class="gts-player ${p.connected ? '' : 'gts-player--away'}">
            <span class="ln-data-md ln-muted">${pad2(i + 1)}</span>
            ${avatar(p.name, { away: !p.connected })}
            <span class="gts-player__name ln-body-md">${esc(p.name)}${p.id === state.you && p.id === state.hostId ? ' <span class="ln-label-caps ln-muted">(you)</span>' : ''}</span>
            ${status}
          </div>`;
      })
      .join('');
  }

  function scoreTable(players, { withRound = false } = {}) {
    return `
      <div class="ln-board-wrap"><table class="ln-board">
        <thead><tr><th scope="col">No.</th><th scope="col">Player</th>${withRound ? '<th scope="col" class="num">This track</th>' : '<th scope="col" class="num hide-sm">Named</th><th scope="col" class="num hide-sm">Best streak</th><th scope="col" class="num hide-sm">Avg.</th>'}<th scope="col" class="num">Score</th></tr></thead>
        <tbody>
          ${players.map((p, i) => `
            <tr class="${p.id === state.you ? 'is-you' : ''}">
              <td class="ln-board__rank ${i < 3 && !withRound ? 'is-top' : ''}">${pad2(i + 1)}</td>
              <td><span class="ln-board__who">${avatar(p.name, { away: !p.connected })}<span class="ln-board__name">${esc(p.name)}</span>${p.id === state.you ? '<span class="ln-board__you">You</span>' : ''}</span></td>
              ${withRound
                ? `<td class="num">${p.lastResult?.correct ? mark('correct', `+${p.lastResult.points}`) : '<span class="ln-data-sm ln-muted">—</span>'}</td>`
                : `<td class="ln-board__data num hide-sm">${p.correct}/${p.answeredCount}</td><td class="ln-board__data num hide-sm">${p.bestStreak}</td><td class="ln-board__data num hide-sm">${p.avgMs == null ? '—' : `${formatSeconds(p.avgMs)}s`}</td>`}
              <td class="ln-board__score">${formatNumber(p.score)}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;
  }

  // ── Rendering ─────────────────────────────────────────────────────
  function render() {
    renderInfo();
    const key = `${state.phase}:${state.question?.number ?? ''}`;
    if (key !== renderedKey) {
      renderedKey = key;
      if (state.phase !== 'question') stopRound();
      if (state.phase !== 'question' && state.phase !== 'reveal') renderTime(null);
      hostControls = null;
      if (state.phase === 'lobby') renderLobby();
      else if (state.phase === 'starting') renderStarting();
      else if (state.phase === 'question') renderQuestion();
      else if (state.phase === 'reveal') renderReveal();
      else if (state.phase === 'final') renderFinal();
    } else {
      updateLive();
    }
    if (state.message && state.message !== lastMessage) {
      lastMessage = state.message;
      toast(state.message);
    }
  }

  function renderLobby() {
    const s = state.settings;
    view.replaceChildren(html(`
      <div class="gts-split">
        <section class="gts-stack">
          <div class="gts-stack-sm">
            <p class="ln-label-caps ln-muted">Room code</p>
            <button type="button" class="gts-code" data-code aria-label="Room code ${state.code.split('').join(' ')}. Copy invite link.">
              <span class="ln-readout">${esc(state.code)}</span>
            </button>
            ${waveform({ bars: 28, height: 18, playing: true, seed: state.code.charCodeAt(0) })}
            <p class="ln-body-sm ln-muted">Friends open <strong>${esc(location.host)}</strong>, choose <em>With friends</em> and type the code. Or <button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-invite>copy the invite link</button></p>
          </div>
          <div>
            <p class="ln-section-label" data-count>In the room · ${state.players.length}</p>
            <div data-players>${playerRows(state.players)}</div>
          </div>
        </section>
        <section class="gts-stack">
          <div class="ln-sleeve gts-stack">
            <h2 class="ln-title-md">Room settings</h2>
            <div data-settings></div>
          </div>
          <div class="ln-btn-row" data-actions></div>
        </section>
      </div>`));
    view.querySelector('[data-code]').addEventListener('click', copyInvite);
    view.querySelector('[data-invite]').addEventListener('click', copyInvite);

    const settingsSlot = view.querySelector('[data-settings]');
    const actions = view.querySelector('[data-actions]');
    if (isHost()) {
      const initial = app.lastRoomSettings ?? { modeId: s.modeId, difficultyId: s.difficultyId, questionCount: s.questionCount, categoryId: s.source.kind === 'category' ? s.source.id : 'all' };
      settingsForm = RoomSettingsForm({ initial, idPrefix: 'room' });
      settingsSlot.append(settingsForm.element);
      settingsForm.element.addEventListener('change', async () => {
        const value = settingsForm.value();
        app.lastRoomSettings = value;
        try {
          await action('settings', { settings: value });
        } catch (err) {
          toast(err.message);
        }
      });
      const start = html('<button type="button" class="ln-btn ln-btn--primary" data-start>Start the record</button>');
      start.addEventListener('click', async () => {
        start.disabled = true;
        unlockAudio();
        try {
          await action('start');
        } catch (err) {
          toast(err.message);
          start.disabled = false;
        }
      });
      actions.append(start);
    } else {
      settingsForm = null;
      settingsSlot.innerHTML = settingsSummary(s);
      const host = state.players.find((p) => p.id === state.hostId);
      actions.innerHTML = `<p class="gts-waiting">${equalizer({ playing: true })}<span class="ln-body-md ln-italic">Waiting for ${esc(host?.name ?? 'the host')} to drop the needle…</span></p>`;
    }
  }

  function settingsSummary(s) {
    const row = (label, value) => `<div class="gts-opt" style="cursor:default"><span class="ln-label-caps ln-muted">${label}</span><span class="ln-body-md">${value}</span></div>`;
    return `<div>
      ${row('Record', sourceCatalog(s))}
      ${row('Format', `${esc(s.modeName)} · ${s.timeLimitSec}s per track`)}
      ${row('Difficulty', `${esc(s.difficultyName)} · ${s.previewSec}s clip`)}
      ${row('Tracks', `<span class="ln-data-md">${s.questionCount}</span>`)}
    </div>`;
  }

  function renderStarting() {
    view.replaceChildren(html(`
      <section class="gts-empty" style="padding-top:96px">
        ${waveform({ bars: 40, height: 36, playing: true })}
        <h1 class="ln-headline-lg">Cueing the records…</h1>
        <p class="ln-label-caps ln-muted">${sourceCatalog(state.settings)} · ${state.settings.questionCount} tracks</p>
      </section>`));
  }

  function renderQuestion() {
    const q = state.question;
    myChoice = q.yourChoice;
    disc = Disc();
    view.replaceChildren(html(`
      <div class="gts-game">
        <aside class="gts-game__player">
          <div data-disc></div>
          <div class="gts-player-status" data-play-status><span class="ln-label-caps ln-muted">Get ready…</span></div>
          <button type="button" class="ln-btn ln-btn--primary" data-play hidden>▶ Tap to hear the clip</button>
          ${sourceCatalog(state.settings)}
        </aside>
        <section class="gts-game__sheet">
          <h2 class="ln-headline-md gts-question">Which song is this?</h2>
          <div class="ln-list" role="group" aria-label="Answer choices" data-answers></div>
          <p class="gts-game__foot ln-label-caps ln-muted" data-note>Keys 1–4 to answer</p>
          <div style="margin-top:32px">
            <p class="ln-section-label">In the room</p>
            <div data-players>${playerRows(state.players, { answered: true })}</div>
          </div>
        </section>
      </div>`));
    view.querySelector('[data-disc]').append(disc.element);
    const status = view.querySelector('[data-play-status]');
    const playBtn = view.querySelector('[data-play]');

    rows = q.options.map((opt, i) => TrackRow({ number: i + 1, title: opt.title, artist: opt.artist, onSelect: choose }));
    view.querySelector('[data-answers]').replaceChildren(...rows.map((r) => r.element));
    setLocked(myChoice != null);
    if (myChoice != null) rows[myChoice].setState('picked');

    const source = q.previewUrl && app.settings.audioSource !== 'offline' ? { kind: 'url', url: q.previewUrl } : { kind: 'synth', seed: q.synthSeed ?? q.number };
    const loading = audioManager.loadResolved(source).catch(() => null);

    const setPlaying = (on) => {
      disc.setSpinning(on && app.settings.animations);
      status.innerHTML = on ? `${live('Now playing')} ${equalizer({ playing: true })}` : '<span class="ln-label-caps ln-muted">Clip ended · lock it in</span>';
    };

    const startPlayback = async () => {
      const prepared = await loading;
      if (renderedKey !== `question:${q.number}`) return;
      if (!prepared) {
        status.innerHTML = '<span class="ln-label-caps ln-muted">No audio · guess from the titles</span>';
        return;
      }
      const lateSec = Math.max(0, (serverNow() - q.startsAt) / 1000);
      const remaining = q.previewSec - lateSec;
      if (remaining <= 0.3) return;
      try {
        await audioManager.play(remaining, {
          offsetSec: q.offsetSec + lateSec,
          onEnd: () => {
            if (renderedKey === `question:${q.number}`) setPlaying(false);
          },
        });
        setPlaying(true);
      } catch (err) {
        if (err.code === 'AUTOPLAY_BLOCKED') {
          status.innerHTML = '<span class="ln-label-caps ln-muted">Your browser paused the audio</span>';
          playBtn.hidden = false;
          playBtn.onclick = async () => {
            playBtn.hidden = true;
            await unlockAudio();
            startPlayback();
          };
        } else {
          status.innerHTML = '<span class="ln-label-caps ln-muted">No audio · guess from the titles</span>';
        }
      }
    };

    const beginRound = () => {
      startPlayback();
      if (myChoice == null) setLocked(false);
      countdown = createCountdown({
        durationMs: Math.max(0, q.endsAt - serverNow()),
        onWholeSecond: (s) => {
          renderTime(s);
          if (s <= LIVE_AT && s > 0) sfx.play('tick');
        },
        onExpire: () => {
          setLocked(true);
          if (myChoice == null) view.querySelector('[data-note]').textContent = 'Out of time';
        },
      });
      countdown.start();
    };

    const untilStart = q.startsAt - serverNow();
    if (untilStart > 0) {
      setLocked(true);
      // Lead-in: a short count while everyone's audio buffers.
      const tick = () => {
        const left = Math.ceil((q.startsAt - serverNow()) / 1000);
        if (left > 0) {
          status.innerHTML = `<span class="ln-label-caps ln-muted">Needle drops in ${left}</span>`;
          disc.setSeconds(null);
        }
      };
      tick();
      leadInTimer = setInterval(tick, 200);
      startTimer = setTimeout(() => {
        clearInterval(leadInTimer);
        beginRound();
      }, untilStart);
    } else {
      beginRound();
    }
    announce(`Track ${q.number} of ${q.total}.`);
  }

  function setLocked(locked) {
    rows.forEach((r) => r.setDisabled(locked));
    view.querySelector('[data-answers]')?.setAttribute('aria-disabled', String(locked));
  }

  async function choose(index) {
    const q = state?.question;
    if (!q || state.phase !== 'question' || myChoice != null) return;
    myChoice = index;
    setLocked(true);
    rows[index].setState('picked');
    sfx.play('click');
    try {
      await action('answer', { questionNumber: q.number, choice: index });
      updateLive();
    } catch (err) {
      if (err.code === 'early') {
        myChoice = null;
        rows[index].setState('idle');
        setLocked(false);
      }
      toast(err.message);
    }
  }

  function updateLive() {
    if (state.phase === 'lobby') {
      const list = view.querySelector('[data-players]');
      if (list) list.innerHTML = playerRows(state.players);
      const count = view.querySelector('[data-count]');
      if (count) count.textContent = `In the room · ${state.players.length}`;
      if (!isHost()) {
        const slot = view.querySelector('[data-settings]');
        if (slot) slot.innerHTML = settingsSummary(state.settings);
      } else if (!settingsForm) {
        renderLobby(); // we just became the host
      }
    } else if (state.phase === 'question') {
      const players = view.querySelector('[data-players]');
      if (players) players.innerHTML = playerRows(state.players, { answered: true });
      const answered = state.players.filter((p) => p.answered).length;
      const note = view.querySelector('[data-note]');
      if (note && myChoice != null) note.textContent = `Locked in · ${answered} of ${state.players.length} answered`;
    } else if (state.phase === 'reveal' || state.phase === 'final') {
      const slot = view.querySelector('[data-host-controls]');
      if (slot && isHost() && !slot.childElementCount) hostControls?.(slot);
    }
  }

  function renderReveal() {
    const q = state.question;
    const mine = me()?.lastResult;
    const song = q.song;
    const animate = app.settings.animations;
    disc = Disc();
    view.replaceChildren(html(`
      <div class="gts-game">
        <aside class="gts-game__player">
          <div data-disc></div>
          <span class="ln-label-caps ln-muted">Clip ended</span>
          ${sourceCatalog(state.settings)}
        </aside>
        <section class="gts-game__sheet">
          <div class="gts-reveal">
            ${creditLine({ title: song.title, artist: song.artist, album: song.album, year: song.year, size: 'lg' })}
            <div class="ln-btn-row">
              ${mine
                ? mine.correct
                  ? `${mark('correct', `+ ${formatNumber(mine.points)} pts`, { animate })}<span class="ln-data-sm ln-muted">IN ${formatSeconds(mine.elapsedMs)}S${mine.multiplier > 1 ? ` · ${mine.multiplier}× STREAK` : ''}</span>`
                  : mark('wrong', mine.timedOut ? 'Out of time' : 'No points')
                : '<span class="ln-label-caps ln-muted">Listening in on this one</span>'}
            </div>
          </div>
          <div class="ln-list" data-answers></div>
          <div style="margin-top:32px">
            <p class="ln-section-label">Standings</p>
            ${scoreTable(state.players, { withRound: true })}
          </div>
          <div class="gts-game__foot">
            <div data-host-controls></div>
            <span class="ln-label-caps ln-muted" data-next-in></span>
          </div>
        </section>
      </div>`));
    view.querySelector('[data-disc]').append(disc.element);
    disc.showArt(song.artwork || generatedArtwork(typeof song.id === 'number' ? song.id : q.number), `${song.album} cover`);

    const answersEl = view.querySelector('[data-answers]');
    q.options.forEach((opt, i) => {
      const row = TrackRow({ number: i + 1, title: opt.title, artist: opt.artist });
      row.setDisabled(true);
      if (i === q.correctIndex) row.setState(mine?.choice === i ? 'correct' : 'missed', { animate });
      else if (mine?.choice === i) row.setState('wrong');
      else row.setState('dimmed');
      const pickers = state.players.filter((p) => p.lastResult?.choice === i);
      if (pickers.length) {
        row.side.insertAdjacentHTML('afterbegin', `<span class="gts-pickers" aria-label="Picked by ${esc(pickers.map((p) => p.name).join(', '))}">${pickers.slice(0, 5).map((p) => avatar(p.name, { size: 'xs' })).join('')}</span>`);
      }
      answersEl.append(row.element);
    });

    if (mine) sfx.play(mine.correct ? 'correct' : 'wrong');

    const nextIn = view.querySelector('[data-next-in]');
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.revealEndsAt - serverNow()) / 1000));
      nextIn.textContent = q.number >= q.total ? `Final standings in ${left}` : `Next track in ${left}`;
    };
    tick();
    revealTimer = setInterval(tick, 250);

    hostControls = (slot) => {
      const btn = html(`<button type="button" class="ln-btn ln-btn--primary">${q.number >= q.total ? 'Final standings' : 'Next track'}</button>`);
      btn.addEventListener('click', () => action('next').catch((err) => toast(err.message)));
      slot.replaceChildren(btn);
    };
    if (isHost()) hostControls(view.querySelector('[data-host-controls]'));
    announce(`${song.title} by ${song.artist}. ${mine?.correct ? `You got it, plus ${mine.points} points.` : 'You missed this one.'}`);
  }

  function renderFinal() {
    const players = state.players;
    const podium = players.slice(0, 3);
    const myRank = players.findIndex((p) => p.id === state.you) + 1;
    const winner = players[0];
    view.replaceChildren(html(`
      <section class="gts-stack" style="padding-top:48px">
        <div class="gts-stack-sm">
          <p class="ln-label-caps ln-muted">Final standings · ${sourceCatalog(state.settings)} · ${esc(state.settings.modeName)}</p>
          <h1 class="ln-display">${myRank === 1 ? 'You take the room.' : `${esc(winner.name)} takes the room.`}</h1>
          ${waveform({ bars: 48, height: 26, playing: true })}
        </div>
        <ol class="gts-podium" style="list-style:none;margin:0;padding:0">
          ${podium.map((p, i) => `
            <li class="gts-podium__spot">
              <span class="ln-label-caps ln-muted">${['First', 'Second', 'Third'][i]}${p.id === state.you ? ' · You' : ''}</span>
              <span class="ln-headline-md">${esc(p.name)}</span>
              <span class="ln-readout">${formatNumber(p.score)}</span>
            </li>`).join('')}
        </ol>
        ${scoreTable(players)}
        <div class="ln-btn-row" data-host-controls></div>
        ${isHost() ? '' : '<p class="ln-body-md ln-italic ln-muted">The host can put on another record.</p>'}
      </section>`));
    hostControls = (slot) => {
      const again = html('<button type="button" class="ln-btn ln-btn--primary">Play again</button>');
      const lobby = html('<button type="button" class="ln-btn ln-btn--secondary">Change settings</button>');
      again.addEventListener('click', () => {
        unlockAudio();
        action('start').catch((err) => toast(err.message));
      });
      lobby.addEventListener('click', () => action('lobby').catch((err) => toast(err.message)));
      slot.replaceChildren(again, lobby);
    };
    if (isHost()) hostControls(view.querySelector('[data-host-controls]'));
    sfx.play('complete');
    announce(`Game over. You finished ${myRank} of ${players.length}.`);
  }

  function stopRound() {
    countdown?.stop();
    countdown = null;
    clearTimeout(startTimer);
    clearInterval(leadInTimer);
    clearInterval(revealTimer);
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, select')) return;
    const key = e.key.toLowerCase();
    if (state?.phase === 'question' && key in KEY_TO_INDEX) {
      const row = rows[KEY_TO_INDEX[key]];
      if (row && !row.element.disabled) {
        e.preventDefault();
        row.element.click();
      }
    } else if (key === 'm') {
      muteBtn.click();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  connect();

  return {
    async beforeLeave() {
      if (closed || !state || !['starting', 'question', 'reveal'].includes(state.phase)) return true;
      return confirmDialog({
        title: 'Leave the round?',
        message: 'You’ll keep your seat and can rejoin from With friends while the room is open.',
        confirmLabel: 'Leave for now',
        cancelLabel: 'Keep playing',
      });
    },
    destroy() {
      closed = true;
      events?.close();
      stopRound();
      audioManager.stop();
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
