import { app } from '../app.js';
import { audioManager } from '../audio/audioManager.js';
import { forgetPreview, knownArtwork } from '../audio/previewProvider.js';
import { sfx, unlockAudio } from '../audio/synth.js';
import { AnswerButton } from '../components/AnswerButton.js';
import { celebrate } from '../components/celebrate.js';
import { ErrorState } from '../components/ErrorState.js';
import { confirmDialog } from '../components/Modal.js';
import { QuestionCard } from '../components/QuestionCard.js';
import { ScoreDisplay } from '../components/ScoreDisplay.js';
import { createCountdown, Timer } from '../components/Timer.js';
import { toast } from '../components/Toast.js';
import { navigate } from '../router.js';
import { recordGameStats } from '../storage/storage.js';
import { esc, generatedArtwork, html } from '../utils.js';

const KEY_TO_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

export function mount(root) {
  const session = app.session;
  if (!session) {
    // Direct visit or page refresh: there's no game to resume, so go back to setup.
    toast('No game in progress — pick a mode to start.');
    navigate('play', { replace: true });
    return {};
  }

  const { engine } = session;
  const { mode, timeLimitSec, previewSec } = engine.state;
  const timeLimitMs = timeLimitSec * 1000;
  let destroyed = false;
  let finished = false;
  let countdown = null;
  let answerButtons = [];
  let answersEnabled = false;

  // ── Layout ────────────────────────────────────────────────────────
  const header = ScoreDisplay({
    totalQuestions: engine.totalQuestions,
    lives: mode.lives,
    modeName: mode.name,
    onQuit: () => quit(),
  });
  const timer = Timer();
  header.timerSlot.append(timer.element);

  const stage = QuestionCard({ muted: audioManager.muted, onToggleMute: toggleMute });

  const main = html(`
    <main class="game container-narrow">
      <div class="game-stage"></div>
      <div class="answers" role="group" aria-label="Answer choices"></div>
      <div class="feedback" hidden></div>
      <p class="sr-only" aria-live="assertive" data-announce></p>
    </main>`);
  main.querySelector('.game-stage').append(stage.element);
  root.append(header.element, main);

  const answersEl = main.querySelector('.answers');
  const feedbackEl = main.querySelector('.feedback');
  const announcer = main.querySelector('[data-announce]');
  const announce = (text) => {
    announcer.textContent = '';
    setTimeout(() => (announcer.textContent = text), 50);
  };

  // ── Question lifecycle ────────────────────────────────────────────
  function startQuestion() {
    const q = engine.nextQuestion();
    header.setQuestion(engine.state.questionNumber);
    renderQuestion(q);
    loadAndPlay();
  }

  function renderQuestion(q) {
    stage.reset();
    timer.reset(timeLimitMs);
    feedbackEl.hidden = true;
    feedbackEl.replaceChildren();
    answerButtons = q.options.map((song, index) => AnswerButton({ song, index, onSelect: handleAnswer }));
    answersEl.replaceChildren(...answerButtons.map((b) => b.element));
    setAnswersEnabled(false);
    answersEl.classList.remove('answers-in');
    void answersEl.offsetWidth;
    answersEl.classList.add('answers-in');
  }

  function setAnswersEnabled(enabled) {
    answersEnabled = enabled;
    answerButtons.forEach((b) => b.setDisabled(!enabled));
    answersEl.setAttribute('aria-disabled', String(!enabled));
  }

  async function loadAndPlay() {
    const q = engine.state.current;
    stage.clearError();
    stage.setStatus('loading', 'Loading preview…');
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
    stage.hidePlayButton();
    try {
      await audioManager.play(previewSec, {
        onEnd: () => {
          if (!destroyed && !q.answered) stage.setStatus('ended', 'Preview ended — make your guess!');
        },
      });
    } catch (err) {
      if (destroyed) return;
      if (err.code === 'AUTOPLAY_BLOCKED') {
        stage.setStatus('blocked', 'Your browser blocked autoplay.');
        stage.showPlayButton(async () => {
          await unlockAudio();
          playPreview();
        });
        return;
      }
      showAudioError(err);
      return;
    }
    if (destroyed || engine.state.current !== q) return;

    // The clock only starts once audio is actually playing — loading time never counts.
    stage.setStatus('playing', 'Listen carefully…');
    setAnswersEnabled(true);
    countdown = createCountdown({
      durationMs: timeLimitMs,
      onTick: (remaining) => timer.update(remaining, timeLimitMs),
      onWholeSecond: (s) => {
        stage.setCountdown(s);
        if (s <= 3 && s > 0) sfx.play('tick');
      },
      onExpire: () => handleAnswer(null),
    });
    countdown.start();

    const upcoming = engine.peekUpcomingSong();
    if (upcoming) audioManager.prefetch(upcoming);
  }

  function showAudioError(err) {
    const q = engine.state.current;
    stage.setStatus('error', '');
    const offline = app.settings.audioSource === 'offline';
    const networkIssue = err.code === 'NETWORK';
    stage.showError(
      ErrorState({
        icon: networkIssue ? '📡' : '🎧',
        title: networkIssue ? 'Something went wrong loading the game.' : "Couldn't load this preview.",
        message: networkIssue
          ? 'Check your connection, or switch to offline placeholder audio.'
          : 'You can try again or skip to another song — no penalty.',
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
    const result = engine.submitAnswer(index, elapsed);
    if (!result) return; // already answered — ignore double clicks / late timer
    setAnswersEnabled(false);
    showResult(result);
  }

  function showResult(result) {
    const q = engine.state.current;
    const { state } = engine;

    answerButtons.forEach((btn, i) => {
      if (i === result.correctIndex) btn.setState(result.correct ? 'correct' : 'missed');
      else if (i === result.selectedIndex) btn.setState('wrong');
      else btn.setState('dimmed');
    });

    if (result.timedOut) {
      timer.update(0, timeLimitMs);
      stage.setCountdown(0);
    }
    stage.setStatus('answered');
    stage.reveal(q.song, knownArtwork(q.song) || generatedArtwork(q.song.id));

    header.setScore(state.score, result.points);
    header.setStreak(state.streak, state.bestStreak);
    header.setLives(engine.livesLeft, mode.lives);
    if (Number.isFinite(engine.totalQuestions)) header.setProgress(state.history.length);

    if (result.correct) {
      sfx.play('correct');
      celebrate(answerButtons[result.correctIndex].element);
    } else {
      sfx.play('wrong');
      if (app.settings.animations) main.querySelector('.answers').classList.add('shake');
      setTimeout(() => main.querySelector('.answers')?.classList.remove('shake'), 500);
    }

    const title = result.correct ? 'Correct!' : result.timedOut ? "Time's up!" : 'Not quite.';
    const breakdown = result.correct
      ? `${result.base} base + ${result.bonus} speed bonus${result.multiplier > 1 ? ` × ${result.multiplier} streak` : ''}`
      : `It was <strong>${esc(q.song.title)}</strong> by ${esc(q.song.artist)}.`;
    const last = engine.isOver;
    const nextLabel = last ? 'See results' : result.correct ? 'Next song' : 'Continue';

    feedbackEl.dataset.result = result.correct ? 'correct' : 'wrong';
    feedbackEl.innerHTML = `
      <div class="feedback-text">
        <p class="feedback-title"><span aria-hidden="true">${result.correct ? '✓' : '✗'}</span> ${title}
          ${result.correct ? `<span class="feedback-points">+${result.points}</span>` : ''}</p>
        <p class="feedback-detail">${breakdown}</p>
      </div>
      <button type="button" class="btn btn-primary next-btn">${nextLabel} <span aria-hidden="true">→</span></button>`;
    feedbackEl.hidden = false;
    const nextBtn = feedbackEl.querySelector('.next-btn');
    nextBtn.addEventListener('click', next, { once: true });
    nextBtn.focus({ preventScroll: true });
    feedbackEl.scrollIntoView({ block: 'nearest', behavior: app.settings.animations ? 'smooth' : 'auto' });

    announce(
      result.correct
        ? `Correct! ${q.song.title} by ${q.song.artist}. Plus ${result.points} points. Score ${state.score}.`
        : `${title} The answer was ${q.song.title} by ${q.song.artist}.`,
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
    stage.setMuted(audioManager.muted);
  }

  function pause() {
    countdown?.pause();
    audioManager.pause();
  }

  function resume() {
    countdown?.resume();
    audioManager.resume();
  }

  async function confirmQuit() {
    if (finished || !app.session) return true;
    pause();
    const ok = await confirmDialog({
      title: 'Quit this game?',
      message: 'Your progress in this game will be lost.',
      confirmLabel: 'Quit game',
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
      answerButtons[KEY_TO_INDEX[key]]?.element.click();
    } else if (key === 'm') {
      toggleMute();
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
