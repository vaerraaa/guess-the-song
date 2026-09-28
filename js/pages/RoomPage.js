import { api, appUrl } from '../api.js';
import { app } from '../app.js';
import { audioManager } from '../audio/audioManager.js';
import { sfx, unlockAudio } from '../audio/synth.js';
import { AnswerButton } from '../components/AnswerButton.js';
import { celebrate } from '../components/celebrate.js';
import { ErrorState } from '../components/ErrorState.js';
import { confirmDialog } from '../components/Modal.js';
import { RoomSettingsForm } from '../components/RoomSettingsForm.js';
import { createCountdown, Timer } from '../components/Timer.js';
import { toast } from '../components/Toast.js';
import { Waveform } from '../components/Waveform.js';
import { copyText } from '../quizActions.js';
import { navigate } from '../router.js';
import { loadRoomSeat, saveRoomSeat } from '../storage/storage.js';
import { animateNumber, esc, formatNumber, formatSeconds, generatedArtwork, html } from '../utils.js';

const KEY_TO_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
const MEDALS = ['🥇', '🥈', '🥉'];

function avatarHue(name) {
  return [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 17);
}

function avatar(player, size = '') {
  return `<span class="avatar ${size}" style="--hue:${avatarHue(player.name)}" aria-hidden="true">${esc(player.name.slice(0, 1).toUpperCase())}</span>`;
}

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
  let answerButtons = [];
  let myChoice = null;
  let settingsForm = null;
  const serverNow = () => Date.now() + (clockOffset ?? 0);

  const shell = html(`
    <div class="room">
      <header class="room-bar">
        <button type="button" class="icon-btn" data-leave aria-label="Leave room">✕</button>
        <button type="button" class="room-code-chip" data-copy aria-label="Copy invite link">
          <span class="muted">Room</span> <strong data-code>${esc(seat.code)}</strong> <span aria-hidden="true">⧉</span>
        </button>
        <span class="room-status" aria-live="polite"></span>
        <button type="button" class="icon-btn mute-btn" data-mute></button>
      </header>
      <main class="container-narrow room-main"></main>
      <p class="sr-only" aria-live="assertive" data-announce></p>
    </div>`);
  root.append(shell);
  const view = shell.querySelector('.room-main');
  const statusEl = shell.querySelector('.room-status');
  const announce = (text) => {
    const el = shell.querySelector('[data-announce]');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 50);
  };

  // ── Controls in the bar ───────────────────────────────────────────
  const muteBtn = shell.querySelector('[data-mute]');
  const renderMute = () => {
    muteBtn.textContent = audioManager.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', audioManager.muted ? 'Unmute' : 'Mute');
    muteBtn.setAttribute('aria-pressed', String(audioManager.muted));
  };
  renderMute();
  muteBtn.addEventListener('click', () => {
    audioManager.setMuted(!audioManager.muted);
    renderMute();
  });

  const inviteLink = () => appUrl({ room: seat.code });
  shell.querySelector('[data-copy]').addEventListener('click', async () => {
    toast((await copyText(inviteLink())) ? 'Invite link copied.' : `Invite link: ${inviteLink()}`);
  });

  shell.querySelector('[data-leave]').addEventListener('click', async () => {
    const inGame = state && ['starting', 'question', 'reveal'].includes(state.phase);
    const ok = await confirmDialog({
      title: 'Leave this room?',
      message: inGame ? 'The game will continue without you.' : 'You can rejoin with the room code while it’s open.',
      confirmLabel: 'Leave room',
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
            icon: '🚪',
            title: 'This room has closed.',
            message: 'The room ended or you were removed after being away too long.',
            actions: [
              { label: 'Join another room', primary: true, onClick: () => navigate('multiplayer') },
              { label: 'Home', onClick: () => navigate('home') },
            ],
          }),
        );
        closed = true;
      } else {
        statusEl.textContent = 'Reconnecting…';
      }
    };
  }

  // ── Rendering ─────────────────────────────────────────────────────
  const me = () => state.players.find((p) => p.id === state.you);
  const isHost = () => state.hostId === state.you;

  function render() {
    const key = `${state.phase}:${state.question?.number ?? ''}`;
    if (key !== renderedKey) {
      renderedKey = key;
      if (state.phase !== 'question') stopRound();
      if (state.phase === 'lobby') renderLobby();
      else if (state.phase === 'starting') renderStarting();
      else if (state.phase === 'question') renderQuestion();
      else if (state.phase === 'reveal') renderReveal();
      else if (state.phase === 'final') renderFinal();
    } else {
      updateLive();
    }
    if (state.message && state.message !== render.lastMessage) {
      render.lastMessage = state.message;
      toast(state.message);
    }
  }

  function playerList(players, { showAnswered = false } = {}) {
    return `<ul class="player-list">${players
      .map((p) => `
        <li class="player ${p.id === state.you ? 'is-you' : ''} ${p.connected ? '' : 'is-away'}">
          ${avatar(p)}
          <span class="player-name">${esc(p.name)}${p.id === state.hostId ? ' <span class="chip" title="Host">Host</span>' : ''}${p.id === state.you ? ' <span class="muted">(you)</span>' : ''}</span>
          ${showAnswered ? `<span class="answered-mark ${p.answered ? 'on' : ''}">${p.answered ? '✓ Locked in' : p.connected ? 'Thinking…' : 'Away'}</span>` : `<span class="player-state">${p.connected ? '' : 'Away'}</span>`}
        </li>`)
      .join('')}</ul>`;
  }

  function sourceLabel(s) {
    return s.source.kind === 'quiz' ? `🎼 ${esc(s.source.title)}` : `${s.source.icon} ${esc(s.source.name)}`;
  }

  function renderLobby() {
    const s = state.settings;
    view.replaceChildren(html(`
      <section class="lobby">
        <div class="lobby-hero card">
          <p class="eyebrow">Room code</p>
          <h1 class="big-code" aria-label="Room code ${state.code.split('').join(' ')}">${esc(state.code)}</h1>
          <p class="muted">Friends open <strong>${esc(location.host)}</strong> → Play with friends, and enter this code.</p>
          <button type="button" class="btn btn-ghost" data-invite>Copy invite link</button>
        </div>
        <div class="lobby-grid">
          <section class="card lobby-players" aria-labelledby="players-title">
            <h2 id="players-title" class="panel-title">Players <span class="muted" data-count>${state.players.length}/12</span></h2>
            <div data-players>${playerList(state.players)}</div>
          </section>
          <section class="card lobby-settings" aria-labelledby="settings-title">
            <h2 id="settings-title" class="panel-title">Game</h2>
            <div data-settings></div>
          </section>
        </div>
        <div class="lobby-actions" data-actions></div>
      </section>`));
    view.querySelector('[data-invite]').addEventListener('click', async () => {
      toast((await copyText(inviteLink())) ? 'Invite link copied.' : `Invite link: ${inviteLink()}`);
    });

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
      const start = html('<button type="button" class="btn btn-primary btn-xl" data-start>Start game</button>');
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
      actions.innerHTML = `<p class="waiting-note"><span class="pulse-dot" aria-hidden="true"></span> Waiting for ${esc(host?.name ?? 'the host')} to start…</p>`;
    }
  }

  function settingsSummary(s) {
    return `
      <dl class="summary-list">
        <div><dt>Mode</dt><dd>${esc(s.modeName)} · ${s.timeLimitSec}s per song</dd></div>
        <div><dt>Songs</dt><dd>${sourceLabel(s)}</dd></div>
        <div><dt>Difficulty</dt><dd>${esc(s.difficultyName)} · ${s.previewSec}s preview</dd></div>
        <div><dt>Length</dt><dd>${s.questionCount} songs</dd></div>
      </dl>`;
  }

  function renderStarting() {
    view.replaceChildren(html(`
      <section class="room-center">
        <div class="waveform-slot"></div>
        <h1>Loading songs…</h1>
        <p class="muted">${sourceLabel(state.settings)} · ${state.settings.questionCount} songs</p>
      </section>`));
    const wave = Waveform({ bars: 24 });
    wave.setState('loading');
    view.querySelector('.waveform-slot').append(wave.element);
  }

  function renderQuestion() {
    const q = state.question;
    myChoice = q.yourChoice;
    const timer = Timer();
    const wave = Waveform({ bars: 32 });
    view.replaceChildren(html(`
      <section class="round">
        <div class="round-head">
          <p class="round-count">Song <strong>${q.number}</strong> <span class="muted">/ ${q.total}</span></p>
          <div class="timer-slot"></div>
        </div>
        <div class="stage stage-compact">
          <div class="stage-body">
            <div class="stage-wave"></div>
            <p class="stage-status">Get ready…</p>
            <button type="button" class="btn btn-primary play-preview" hidden>▶ Tap to hear the song</button>
          </div>
        </div>
        <div class="answers" role="group" aria-label="Answer choices"></div>
        <p class="round-note" aria-live="polite"></p>
        <section class="round-players" aria-label="Players">${playerList(state.players, { showAnswered: true })}</section>
      </section>`));
    view.querySelector('.timer-slot').append(timer.element);
    view.querySelector('.stage-wave').append(wave.element);
    timer.reset(q.endsAt - q.startsAt);
    wave.setState('loading');

    answerButtons = q.options.map((song, index) => AnswerButton({ song, index, onSelect: choose }));
    const answersEl = view.querySelector('.answers');
    answersEl.replaceChildren(...answerButtons.map((b) => b.element));
    answersEl.classList.add('answers-in');
    setLocked(myChoice != null);
    if (myChoice != null) answerButtons[myChoice].setState('picked');

    const status = view.querySelector('.stage-status');
    const playBtn = view.querySelector('.play-preview');
    const source = q.previewUrl && app.settings.audioSource !== 'offline' ? { kind: 'url', url: q.previewUrl } : { kind: 'synth', seed: q.synthSeed ?? q.number };
    const loading = audioManager.loadResolved(source).catch(() => null);

    const startPlayback = async () => {
      const prepared = await loading;
      if (renderedKey !== `question:${q.number}`) return;
      wave.setState('playing');
      status.textContent = 'Listen carefully…';
      if (!prepared) {
        status.textContent = 'Couldn’t load the audio — guess from the options!';
        wave.setState('idle');
        return;
      }
      const lateSec = Math.max(0, (serverNow() - q.startsAt) / 1000);
      const remaining = q.previewSec - lateSec;
      if (remaining <= 0.3) return;
      try {
        await audioManager.play(remaining, {
          offsetSec: q.offsetSec + lateSec,
          onEnd: () => {
            if (renderedKey === `question:${q.number}`) {
              wave.setState('idle');
              status.textContent = 'Preview ended — lock in your answer!';
            }
          },
        });
      } catch (err) {
        if (err.code === 'AUTOPLAY_BLOCKED') {
          status.textContent = 'Your browser paused the audio.';
          playBtn.hidden = false;
          playBtn.onclick = async () => {
            playBtn.hidden = true;
            await unlockAudio();
            startPlayback();
          };
        } else {
          status.textContent = 'Couldn’t play the audio — guess from the options!';
        }
      }
    };

    const beginRound = () => {
      startPlayback();
      if (myChoice == null) setLocked(false);
      countdown = createCountdown({
        durationMs: Math.max(0, q.endsAt - serverNow()),
        onTick: (remaining) => timer.update(remaining, q.endsAt - q.startsAt),
        onWholeSecond: (s) => {
          if (s <= 3 && s > 0) sfx.play('tick');
        },
        onExpire: () => {
          setLocked(true);
          if (myChoice == null) view.querySelector('.round-note').textContent = 'Time’s up!';
        },
      });
      countdown.start();
    };

    const untilStart = q.startsAt - serverNow();
    if (untilStart > 0) {
      setLocked(true);
      // Lead-in: a short "3, 2, 1" while everyone's audio buffers.
      const tick = () => {
        const left = Math.ceil((q.startsAt - serverNow()) / 1000);
        if (left > 0) status.textContent = `Get ready… ${left}`;
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
    announce(`Song ${q.number} of ${q.total}.`);
  }

  function setLocked(locked) {
    answerButtons.forEach((b) => b.setDisabled(locked));
    view.querySelector('.answers')?.setAttribute('aria-disabled', String(locked));
  }

  async function choose(index) {
    const q = state?.question;
    if (!q || state.phase !== 'question' || myChoice != null) return;
    myChoice = index;
    setLocked(true);
    answerButtons[index].setState('picked');
    sfx.play('click');
    try {
      await action('answer', { questionNumber: q.number, choice: index });
      updateLive();
    } catch (err) {
      if (err.code === 'early') {
        myChoice = null;
        answerButtons[index].setState('');
        setLocked(false);
      }
      toast(err.message);
    }
  }

  function updateLive() {
    if (state.phase === 'lobby') {
      const list = view.querySelector('[data-players]');
      if (list) list.innerHTML = playerList(state.players);
      const count = view.querySelector('[data-count]');
      if (count) count.textContent = `${state.players.length}/12`;
      if (!isHost()) {
        const slot = view.querySelector('[data-settings]');
        if (slot) slot.innerHTML = settingsSummary(state.settings);
      } else if (!settingsForm) {
        renderLobby(); // we just became the host
      }
    } else if (state.phase === 'question') {
      const players = view.querySelector('.round-players');
      if (players) players.innerHTML = playerList(state.players, { showAnswered: true });
      const answered = state.players.filter((p) => p.answered).length;
      const note = view.querySelector('.round-note');
      if (note && myChoice != null) note.textContent = `Locked in! ${answered} of ${state.players.length} answered.`;
    } else if (state.phase === 'reveal' || state.phase === 'final') {
      const hostSlot = view.querySelector('[data-host-controls]');
      if (hostSlot && isHost() && !hostSlot.childElementCount) render.hostControls?.(hostSlot);
    }
  }

  function renderReveal() {
    const q = state.question;
    const mine = me()?.lastResult;
    const song = q.song;
    view.replaceChildren(html(`
      <section class="round reveal">
        <div class="reveal-top">
          <img class="reveal-art" src="${esc(song.artwork || generatedArtwork(typeof song.id === 'number' ? song.id : q.number))}" alt="${esc(song.album)} cover">
          <div>
            <p class="eyebrow">Song ${q.number} of ${q.total}</p>
            <p class="reveal-title">${esc(song.title)}</p>
            <p class="reveal-artist">${esc(song.artist)}</p>
            <p class="reveal-meta">${esc(song.album)}${song.year ? ` · ${song.year}` : ''}</p>
          </div>
        </div>
        <div class="my-result ${mine?.correct ? 'is-correct' : 'is-wrong'}">
          ${mine
            ? mine.correct
              ? `<strong>✓ Correct!</strong> <span class="feedback-points">+${mine.points}</span> <span class="muted">in ${formatSeconds(mine.elapsedMs)}s${mine.multiplier > 1 ? ` · ${mine.multiplier}× streak` : ''}</span>`
              : `<strong>✗ ${mine.timedOut ? 'No answer' : 'Not quite'}</strong> <span class="muted">— streak reset</span>`
            : '<strong>Watching this round</strong>'}
        </div>
        <div class="answers answers-reveal" aria-label="Answers"></div>
        <section class="card scoreboard" aria-labelledby="scores-title">
          <h2 id="scores-title" class="panel-title">Scores</h2>
          ${scoreboard(state.players, { withRound: true })}
        </section>
        <div class="reveal-footer">
          <p class="muted" data-next-in></p>
          <div data-host-controls></div>
        </div>
      </section>`));

    const answersEl = view.querySelector('.answers');
    q.options.forEach((opt, i) => {
      const btn = AnswerButton({ song: opt, index: i, onSelect: () => {} });
      btn.setDisabled(true);
      if (i === q.correctIndex) btn.setState(mine?.choice === i ? 'correct' : 'missed');
      else if (mine?.choice === i) btn.setState('wrong');
      else btn.setState('dimmed');
      const pickers = state.players.filter((p) => p.lastResult?.choice === i);
      if (pickers.length) {
        btn.element.append(html(`<span class="pickers" aria-label="Picked by ${esc(pickers.map((p) => p.name).join(', '))}">${pickers.slice(0, 5).map((p) => avatar(p, 'avatar-xs')).join('')}</span>`));
      }
      answersEl.append(btn.element);
    });

    if (mine?.correct) {
      sfx.play('correct');
      celebrate(view.querySelector('.my-result'));
    } else if (mine) {
      sfx.play('wrong');
    }

    const nextIn = view.querySelector('[data-next-in]');
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.revealEndsAt - serverNow()) / 1000));
      nextIn.textContent = q.number >= q.total ? `Final results in ${left}…` : `Next song in ${left}…`;
    };
    tick();
    revealTimer = setInterval(tick, 250);

    render.hostControls = (slot) => {
      const btn = html(`<button type="button" class="btn btn-primary">${q.number >= q.total ? 'Show results' : 'Next song'} →</button>`);
      btn.addEventListener('click', () => action('next').catch((err) => toast(err.message)));
      slot.replaceChildren(btn);
    };
    if (isHost()) render.hostControls(view.querySelector('[data-host-controls]'));
    announce(`${song.title} by ${song.artist}. ${mine?.correct ? `You got it, plus ${mine.points} points.` : 'You missed this one.'}`);
  }

  function scoreboard(players, { withRound = false } = {}) {
    return `<ol class="score-list">${players
      .map((p, i) => `
        <li class="score-row ${p.id === state.you ? 'is-you' : ''}">
          <span class="score-rank">${i + 1}</span>
          ${avatar(p)}
          <span class="player-name">${esc(p.name)}${p.streak >= 2 ? ` <span class="streak-hot">🔥${p.streak}</span>` : ''}</span>
          ${withRound ? `<span class="round-points ${p.lastResult?.correct ? 'up' : ''}">${p.lastResult?.correct ? `+${p.lastResult.points}` : '—'}</span>` : ''}
          <span class="score-total">${formatNumber(p.score)}</span>
        </li>`)
      .join('')}</ol>`;
  }

  function renderFinal() {
    const players = state.players;
    const podium = players.slice(0, 3);
    const myRank = players.findIndex((p) => p.id === state.you) + 1;
    view.replaceChildren(html(`
      <section class="final">
        <p class="eyebrow">${sourceLabel(state.settings)} · ${esc(state.settings.modeName)}</p>
        <h1>${myRank === 1 ? 'You win!' : 'Final results'}</h1>
        <ol class="podium">
          ${podium.map((p, i) => `
            <li class="podium-spot place-${i + 1} ${p.id === state.you ? 'is-you' : ''}">
              ${avatar(p, 'avatar-lg')}
              <span class="podium-name">${esc(p.name)}</span>
              <span class="podium-score" data-score="${p.score}">${formatNumber(p.score)}</span>
              <span class="podium-block"><span aria-hidden="true">${MEDALS[i]}</span><span class="sr-only">Place ${i + 1}</span></span>
            </li>`).join('')}
        </ol>
        <div class="card final-table">
          <div class="table-scroll">
            <table class="board-table">
              <thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col" class="num">Score</th><th scope="col" class="num">Correct</th><th scope="col" class="num hide-sm">Best streak</th><th scope="col" class="num hide-sm">Avg. time</th></tr></thead>
              <tbody>
                ${players.map((p, i) => `
                  <tr class="${p.id === state.you ? 'is-you' : ''}">
                    <td class="rank">${i + 1}</td>
                    <td class="player">${esc(p.name)}</td>
                    <td class="num score">${formatNumber(p.score)}</td>
                    <td class="num">${p.correct}/${p.answeredCount}</td>
                    <td class="num hide-sm">${p.bestStreak}</td>
                    <td class="num hide-sm">${p.avgMs == null ? '—' : `${formatSeconds(p.avgMs)}s`}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="final-actions" data-host-controls></div>
        ${isHost() ? '' : '<p class="waiting-note muted">The host can start another round.</p>'}
      </section>`));
    render.hostControls = (slot) => {
      const again = html('<button type="button" class="btn btn-primary btn-lg">Play again</button>');
      const lobby = html('<button type="button" class="btn btn-ghost btn-lg">Change settings</button>');
      again.addEventListener('click', () => {
        unlockAudio();
        action('start').catch((err) => toast(err.message));
      });
      lobby.addEventListener('click', () => action('lobby').catch((err) => toast(err.message)));
      slot.replaceChildren(again, lobby);
    };
    if (isHost()) render.hostControls(view.querySelector('[data-host-controls]'));
    view.querySelectorAll('.podium-score').forEach((el) => {
      el.dataset.value = '0';
      animateNumber(el, Number(el.dataset.score), 1000);
    });
    sfx.play('complete');
    if (myRank === 1 && players.length > 1) celebrate(view.querySelector('.podium .is-you'), 16);
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
      const btn = answerButtons[KEY_TO_INDEX[key]];
      if (btn && !btn.element.disabled) {
        e.preventDefault();
        btn.element.click();
      }
    } else if (key === 'm') {
      muteBtn.click();
    }
  }
  window.addEventListener('keydown', onKeyDown);

  view.append(html('<p class="muted room-connecting">Connecting to the room…</p>'));
  connect();

  return {
    async beforeLeave() {
      if (closed || !state || !['starting', 'question', 'reveal'].includes(state.phase)) return true;
      return confirmDialog({
        title: 'Leave the game?',
        message: 'You’ll stay in the room and can rejoin from “Play with friends” while it’s open.',
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
