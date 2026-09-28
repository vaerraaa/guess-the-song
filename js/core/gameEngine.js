import { ANSWER_OPTION_COUNT, DIFFICULTIES, MODES } from '../config.js';
import { answerPool, buildQuestion, createSongDeck, songsForCategory } from './questions.js';
import { scoreAnswer } from './scoring.js';

export class GameSetupError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Pure game state machine — no DOM, timers or audio. The UI drives it:
 *   nextQuestion() → (player answers or times out) → submitAnswer() → … until isOver
 */
export function createGame({ modeId = 'classic', categoryId = 'all', difficultyId = 'medium', songs, questionCount, rng = Math.random }) {
  const baseMode = MODES[modeId] ?? MODES.classic;
  // Custom quizzes can be shorter than a standard game.
  const mode = questionCount && Number.isFinite(baseMode.questionCount) ? { ...baseMode, questionCount: Math.min(baseMode.questionCount, questionCount) } : baseMode;
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.medium;
  const categorySongs = songsForCategory(songs, categoryId);
  const neededForDeck = Number.isFinite(mode.questionCount) ? mode.questionCount : ANSWER_OPTION_COUNT;
  const pool = answerPool(songs, categoryId, difficulty.id, neededForDeck);

  if (pool.length < neededForDeck || categorySongs.length < ANSWER_OPTION_COUNT) {
    throw new GameSetupError('NO_SONGS', 'No songs match these filters.');
  }

  const deck = createSongDeck(pool, rng);
  const timeLimitSec = mode.timeLimitSec;

  const state = {
    mode,
    difficulty,
    categoryId,
    timeLimitSec,
    previewSec: Math.min(difficulty.previewSec, timeLimitSec),
    questionNumber: 0,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correctCount: 0,
    wrongCount: 0,
    history: [],
    current: null,
  };

  function makeQuestion() {
    const song = deck.next();
    return buildQuestion(song, categorySongs, {
      similarityWeight: difficulty.distractorSimilarity,
      rng,
      fallback: songs,
    });
  }

  let upcoming = null; // pre-built next question, so its audio can be prefetched

  const game = {
    state,

    get livesLeft() {
      return mode.lives == null ? null : Math.max(0, mode.lives - state.wrongCount);
    },

    get isOver() {
      if (mode.lives != null) return state.wrongCount >= mode.lives;
      return state.history.length >= mode.questionCount;
    },

    get totalQuestions() {
      return mode.questionCount;
    },

    nextQuestion() {
      if (game.isOver) throw new Error('Game is over.');
      if (state.current && !state.current.answered) throw new Error('Current question not answered yet.');
      state.questionNumber += 1;
      state.current = { ...(upcoming ?? makeQuestion()), answered: false, result: null };
      upcoming = null;
      return state.current;
    },

    /** The song the next question will use (null if the game will be over). */
    peekUpcomingSong() {
      const willBeOver = mode.lives == null && state.history.length + (state.current && !state.current.answered ? 1 : 0) >= mode.questionCount;
      if (willBeOver) return null;
      upcoming ??= makeQuestion();
      return upcoming.song;
    },

    /** Swap the current (unanswered) question for a new song — used when a preview won't load. */
    replaceCurrentQuestion() {
      if (!state.current || state.current.answered) return state.current;
      state.current = { ...makeQuestion(), answered: false, result: null };
      return state.current;
    },

    /**
     * Lock in an answer. `optionIndex` null means time ran out.
     * Returns the result, or null if this question was already answered (double clicks etc).
     */
    submitAnswer(optionIndex, elapsedMs) {
      const q = state.current;
      if (!q || q.answered) return null;

      const timedOut = optionIndex == null;
      const correct = !timedOut && optionIndex === q.correctIndex;
      const clampedMs = Math.min(Math.max(elapsedMs, 0), timeLimitSec * 1000);
      const newStreak = correct ? state.streak + 1 : 0;
      const breakdown = scoreAnswer({
        correct,
        elapsedMs: clampedMs,
        timeLimitSec,
        streak: newStreak,
        modeBonusMultiplier: mode.speedBonusMultiplier,
      });

      state.streak = newStreak;
      state.bestStreak = Math.max(state.bestStreak, newStreak);
      state.score += breakdown.points;
      if (correct) state.correctCount += 1;
      else state.wrongCount += 1;

      const result = {
        questionNumber: state.questionNumber,
        song: q.song,
        selectedIndex: timedOut ? null : optionIndex,
        correctIndex: q.correctIndex,
        correct,
        timedOut,
        elapsedMs: clampedMs,
        streak: newStreak,
        ...breakdown,
      };
      q.answered = true;
      q.result = result;
      state.history.push(result);
      return result;
    },

    summary() {
      const answered = state.history.length;
      const inTime = state.history.filter((h) => !h.timedOut);
      const avgResponseMs = inTime.length ? inTime.reduce((sum, h) => sum + h.elapsedMs, 0) / inTime.length : null;
      return {
        modeId: mode.id,
        categoryId,
        difficultyId: difficulty.id,
        score: state.score,
        correct: state.correctCount,
        answered,
        accuracy: answered ? Math.round((state.correctCount / answered) * 100) : 0,
        bestStreak: state.bestStreak,
        avgResponseMs,
        history: state.history.map((h) => ({
          songId: h.song.id,
          correct: h.correct,
          timedOut: h.timedOut,
          points: h.points,
          elapsedMs: h.elapsedMs,
        })),
        finishedAt: Date.now(),
      };
    },
  };

  return game;
}
