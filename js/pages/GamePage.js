import { app } from '../app.js';
import { audioManager } from '../audio/audioManager.js';
import { forgetPreview, knownArtwork } from '../audio/previewProvider.js';
import { sfx, unlockAudio } from '../audio/synth.js';
import { getCategory } from '../core/questions.js';
import { ErrorState } from '../components/ErrorState.js';
import { catalog, creditLine, Disc, equalizer, live, mark, pad2, TrackRow } from '../components/ln.js';
import { confirmDialog } from '../components/Modal.js';
import { createCountdown } from '../components/Timer.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { recordGameStats } from '../storage/storage.js';
import { esc, formatNumber, generatedArtwork, html } from '../utils.js';

const KEY_TO_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };
const LIVE_AT = 3;

export function mount(root) {
  const session = app.session;
  if (!session) {
    // Direct visit or page refresh: there's no game to resume, so go back to setup.
    toast('No game in progress. Pick a record to start.');
    navigate('play', { replace: true });
    return {};
  }

  const { engine } = session;
  const { mode, timeLimitSec, previewSec } = engine.state;
  const timeLimitMs = timeLimitSec * 1000;
  const endless = !Number.isFinite(engine.totalQuestions);
  const recordCode = session.setup.quizLocalId
    ? catalog('GTS-Q', session.setup.quizTitle)
    : catalog(getCategory(session.setup.categoryId).code, getCategory(session.setup.categoryId).name);
  let destroyed = false;
  let finished = false;
  let countdown = null;
  let rows = [];
  let answersEnabled = false;
  let secondsLeft = null;

  // ── Layout ────────────────────────────────────────────────────────
  root.append(html(`
    <main class="gts-page">
      <div class="ln-strip ln-strip--sticky">
        <span class="ln-strip__items" data-strip></span>
        <span class="ln-strip__actions">
          <span data-time></span>
          <button type="button" class="ln-strip__btn" data-mute aria-keyshortcuts="M"></button>
          <button type="button" class="ln-strip__btn" data-quit>Quit</button>
        </span>
      </div>
      ${endless ? '' : `<div class="gts-progress" role="progressbar" aria-label="Round progress" aria-valuemin="0" aria-valuemax="${engine.totalQuestions}" aria-valuenow="0"><div></div></div>`}
      <div class="gts-game">
        <aside class="gts-game__player">
          <div data-disc></div>
          <div class="gts-player-status" data-status aria-live="polite"></div>
          <button type="button" class="ln-btn ln-btn--primary" data-play hidden>▶ Play the clip</button>
          <div class="gts-stack-sm">
            ${recordCode}
            ${catalog(mode.format, `${mode.name} · ${engine.state.difficulty.name}`)}
          </div>
        </aside>
        <section class="gts-game__sheet">
          <div data-head></div>
          <div data-error></div>
          <div class="ln-list" role="group" aria-label="Answer choices" data-answers></div>
          <div class="gts-game__foot" data-foot></div>
        </section>
      </div>
      <p class="sr-only" aria-live="assertive" data-announce></p>
    </main>`));

  const $ = (sel) => root.querySelector(sel);
  const stripEl = $('[data-strip]');
  const timeEl = $('[data-time]');
  const discSlot = $('[data-disc]');
  const statusEl = $('[data-status]');
  const playBtn = $('[data-play]');
  const headEl = $('[data-head]');
  const errorEl = $('[data-error]');
  const answersEl = $('[data-answers]');
  const footEl = $('[data-foot]');
  const muteBtn = $('[data-mute]');
  let disc = null;
  let lastGain = 0;

  const announce = (text) => {
    const el = $('[data-announce]');
    el.textContent = '';
    setTimeout(() => (el.textContent = text), 50);
  };

  // ── Credits strip ─────────────────────────────────────────────────
  function renderStrip() {
    const s = engine.state;
    const dot = '<span class="ln-strip__dot">·</span>';
    const parts = [
      `<span>Track ${pad2(s.questionNumber)}${endless ? '' : ` / ${pad2(engine.totalQuestions)}`}</span>`,
      `<span>${formatNumber(s.score)} pts${lastGain ? ` <span class="ln-score-pop">+${lastGain}</span>` : ''}</span>`,
    ];
    if (s.streak > 0) parts.push(`<span>Streak ${s.streak}</span>`);
    if (mode.lives != null) parts.push(`<span>Lives ${engine.livesLeft} / ${mode.lives}</span>`);
    if (endless && s.bestStreak > 0) parts.push(`<span class="hide-sm">Best ${s.bestStreak}</span>`);
    stripEl.innerHTML = parts.join(dot);
    const bar = root.querySelector('.gts-progress');
    if (bar) {
      bar.setAttribute('aria-valuenow', String(s.history.length));
      bar.firstElementChild.style.width = `${(s.history.length / engine.totalQuestions) * 100}%`;
    }
  }

  function renderTime(seconds) {
    secondsLeft = seconds;
    timeEl.innerHTML = seconds == null ? '' : seconds <= LIVE_AT ? live(pad2(seconds)) : `<span class="ln-strip__time">${pad2(seconds)}</span>`;
    disc?.setSeconds(seconds);
  }

  function renderMute() {
    muteBtn.textContent = audioManager.muted ? 'Unmute' : 'Mute';
    muteBtn.setAttribute('aria-pressed', String(audioManager.muted));
  }

  /** state: loading | playing | ended | blocked | error | answered */
  function setStatus(state) {
    const playing = state === 'playing';
    disc?.setSpinning(playing && app.settings.animations);
    statusEl.innerHTML =
      state === 'playing' ? `${live('Now playing')} ${equalizer({ playing: true })}`
      : state === 'loading' ? '<span class="ln-label-caps ln-muted">Cueing the record…</span>'
      : state === 'ended' ? '<span class="ln-label-caps ln-muted">Clip ended · lock it in</span>'
      : state === 'blocked' ? '<span class="ln-label-caps ln-muted">Your browser paused the audio</span>'
      : state === 'answered' ? '<span class="ln-label-caps ln-muted">Clip ended</span>'
      : '';
  }

  // ── Question lifecycle ────────────────────────────────────────────
  function startQuestion() {
    const q = engine.nextQuestion();
    lastGain = 0;
    renderQuestion(q);
    loadAndPlay();
  }

  function renderQuestion(q) {
    renderStrip();
    disc = Disc();
    discSlot.replaceChildren(disc.element);
    renderTime(null);
    playBtn.hidden = true;
    errorEl.replaceChildren();
    headEl.innerHTML = `<h2 class="ln-headline-md gts-question">Which song is this?</h2>`;
    rows = q.options.map((song, i) => TrackRow({ number: i + 1, title: song.title, artist: song.artist, onSelect: handleAnswer }));
    answersEl.replaceChildren(...rows.map((r) => r.element));
    footEl.innerHTML = '<span class="ln-label-caps ln-muted">Keys 1–4 to answer · M to mute</span>';
    setAnswersEnabled(false);
  }

  function setAnswersEnabled(enabled) {
    answersEnabled = enabled;
    rows.forEach((r) => r.setDisabled(!enabled));
    answersEl.setAttribute('aria-disabled', String(!enabled));
  }

  async function loadAndPlay() {
    const q = engine.state.current;
    errorEl.replaceChildren();
    setStatus('loading');
    try {
      await audioManager.load(q.song);
    } catch (err) {
      if (destroyed || err.code === 'CANCELLED') return;
      showAudioError(err);
      return;
    }
    if (destroyed || engine.state.current !== q) return;
    await playPreview();
  }

  async function playPreview() {
    const q = engine.state.current;
    playBtn.hidden = true;
    try {
      await audioManager.play(previewSec, {
        onEnd: () => {
          if (!destroyed && !q.answered) setStatus('ended');
        },
      });
    } catch (err) {
      if (destroyed) return;
      if (err.code === 'AUTOPLAY_BLOCKED') {
        setStatus('blocked');
        playBtn.hidden = false;
        playBtn.onclick = async () => {
          await unlockAudio();
          playPreview();
        };
        playBtn.focus();
        return;
      }
      showAudioError(err);
      return;
    }
    if (destroyed || engine.state.current !== q) return;

    // The clock only starts once audio is actually playing — loading time never counts.
    setStatus('playing');
    setAnswersEnabled(true);
    countdown = createCountdown({
      durationMs: timeLimitMs,
      onWholeSecond: (s) => {
        renderTime(s);
        if (s <= LIVE_AT && s > 0) sfx.play('tick');
      },
      onExpire: () => handleAnswer(null),
    });
    countdown.start();

    const upcoming = engine.peekUpcomingSong();
    if (upcoming) audioManager.prefetch(upcoming);
  }

  function showAudioError(err) {
    const q = engine.state.current;
    setStatus('error');
    const offline = app.settings.audioSource === 'offline';
    const networkIssue = err.code === 'NETWORK';
    errorEl.replaceChildren(
      ErrorState({
        title: networkIssue ? 'Something went wrong loading the game.' : "Couldn't load this preview.",
        message: networkIssue
          ? 'Check your connection, or switch to offline placeholder audio.'
          : 'Try again, or skip to another song. Skipping costs nothing.',
        actions: [
          { label: networkIssue ? 'Retry' : 'Try again', primary: true, onClick: () => { forgetPreview(q.song); loadAndPlay(); } },
          networkIssue && !offline
            ? { label: 'Play offline', onClick: () => { app.updateSettings({ audioSource: 'offline' }); loadAndPlay(); } }
            : { label: 'Skip song', onClick: () => { renderQuestion(engine.replaceCurrentQuestion()); loadAndPlay(); } },
        ],
      }),
    );
  }

  function handleAnswer(index) {
    if (!answersEnabled && index != null) return;
    const elapsed = countdown ? countdown.stop() : timeLimitMs;
    const streakBefore = engine.state.streak;
    const result = engine.submitAnswer(index, elapsed);
    if (!result) return; // already answered — ignore double clicks / late timer
    setAnswersEnabled(false);
    showResult(result, streakBefore);
  }

  function showResult(result, streakBefore) {
    const q = engine.state.current;
    const { state } = engine;
    const animate = app.settings.animations;

    rows.forEach((row, i) => {
      if (i === result.correctIndex) row.setState(result.correct ? 'correct' : 'missed', { animate });
      else if (i === result.selectedIndex) row.setState('wrong', { label: 'Your answer' });
      else row.setState('dimmed');
    });

    renderTime(result.timedOut ? 0 : null);
    setStatus('answered');
    disc.showArt(knownArtwork(q.song) || generatedArtwork(typeof q.song.id === 'number' ? q.song.id : state.questionNumber), `${q.song.album} cover`);

    lastGain = result.points;
    renderStrip();

    const outcome = result.correct
      ? mark('correct', `+ ${formatNumber(result.points)} pts`, { animate })
      : mark('wrong', result.timedOut ? 'Out of time' : 'No points');
    const breakdown = result.correct
      ? `${result.base} base + ${result.bonus} speed${result.multiplier > 1 ? ` × ${result.multiplier} streak` : ''}`
      : streakBefore > 0 ? `Streak of ${streakBefore} reset` : '';
    headEl.innerHTML = `
      <div class="gts-reveal">
        ${creditLine({ title: q.song.title, artist: q.song.artist, album: q.song.album, year: q.song.year, size: 'lg' })}
        <div class="ln-btn-row">${outcome}${breakdown ? `<span class="ln-data-sm ln-muted">${esc(breakdown.toUpperCase())}</span>` : ''}</div>
      </div>`;

    sfx.play(result.correct ? 'correct' : 'wrong');

    const nextLabel = engine.isOver ? 'See results' : 'Next track';
    footEl.innerHTML = `<button type="button" class="ln-btn ln-btn--primary" data-next>${nextLabel}</button><span class="ln-label-caps ln-muted">Enter to continue</span>`;
    const nextBtn = footEl.querySelector('[data-next]');
    nextBtn.addEventListener('click', next, { once: true });
    nextBtn.focus({ preventScroll: true });

    announce(
      result.correct
        ? `Correct. ${q.song.title} by ${q.song.artist}. Plus ${result.points} points. Score ${state.score}.`
        : `${result.timedOut ? 'Out of time.' : 'Not quite.'} It was ${q.song.title} by ${q.song.artist}.`,
    );
  }

  function next() {
    audioManager.stop({ fade: true });
    if (engine.isOver) finish();
    else startQuestion();
  }

  function finish() {
    finished = true;
    const summary = engine.summary();
    if (session.setup.quizLocalId) Object.assign(summary, { categoryId: 'custom', quizTitle: session.setup.quizTitle });
    recordGameStats(summary);
    app.setLastResult({
      summary,
      setup: session.setup,
      saved: false,
      recap: engine.state.history.map((h) => ({
        id: h.song.id,
        title: h.song.title,
        artist: h.song.artist,
        album: h.song.album,
        year: h.song.year,
        artwork: knownArtwork(h.song),
        correct: h.correct,
        timedOut: h.timedOut,
        points: h.points,
      })),
    });
    app.session = null;
    sfx.play('complete');
    navigate('results', { replace: true });
  }

  // ── Controls ──────────────────────────────────────────────────────
  function toggleMute() {
    audioManager.setMuted(!audioManager.muted);
    renderMute();
  }
  renderMute();
  muteBtn.addEventListener('click', toggleMute);
  $('[data-quit]').addEventListener('click', () => quit());

  function pause() {
    countdown?.pause();
    audioManager.pause();
    disc?.setSpinning(false);
  }

  function resume() {
    countdown?.resume();
    audioManager.resume();
    if (countdown?.running) disc?.setSpinning(app.settings.animations);
  }

  async function confirmQuit() {
    if (finished || !app.session) return true;
    pause();
    const ok = await confirmDialog({
      title: 'Quit this round?',
      message: 'Your progress in this round will be lost.',
      confirmLabel: 'Quit round',
      cancelLabel: 'Keep playing',
      danger: true,
    });
    if (!ok) resume();
    return ok;
  }

  async function quit() {
    if (await confirmQuit()) {
      app.session = null;
      navigate('home');
    }
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea')) return;
    const key = e.key.toLowerCase();
    if (key in KEY_TO_INDEX && answersEnabled) {
      e.preventDefault();
      rows[KEY_TO_INDEX[key]]?.element.click();
    } else if (key === 'm') {
      toggleMute();
    } else if (key === 'enter' && !e.target.closest?.('button, a')) {
      footEl.querySelector('[data-next]')?.click();
    }
  }

  function onVisibilityChange() {
    if (document.hidden) pause();
    else if (!document.querySelector('dialog[open]')) resume();
  }

  window.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);

  startQuestion();

  return {
    async beforeLeave() {
      const ok = await confirmQuit();
      if (ok) app.session = null;
      return ok;
    },
    destroy() {
      destroyed = true;
      countdown?.stop();
      audioManager.stop();
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}
