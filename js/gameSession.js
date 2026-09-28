import { app } from './app.js';
import { warmPreviews } from './audio/previewProvider.js';
import { quizToSongs } from './core/customQuiz.js';
import { GameSetupError, createGame } from './core/gameEngine.js';
import { navigate } from './router.js';
import { getLocalQuiz, saveLastSetup } from './storage/storage.js';

/**
 * Create a fresh game (all state reset) and go to the game screen. Throws GameSetupError.
 * setup: { modeId, difficultyId, categoryId } or { modeId, difficultyId, quizLocalId }
 */
export function startGame(setup) {
  let songs = app.songs;
  let questionCount;
  let quizTitle;
  if (setup.quizLocalId) {
    const quiz = getLocalQuiz(setup.quizLocalId);
    if (!quiz) throw new GameSetupError('NO_SONGS', 'That quiz is no longer on this device.');
    songs = quizToSongs(quiz);
    questionCount = songs.length;
    quizTitle = quiz.title;
  }
  const engine = createGame({
    modeId: setup.modeId,
    difficultyId: setup.difficultyId,
    categoryId: setup.quizLocalId ? 'all' : setup.categoryId,
    songs,
    questionCount,
  });
  app.session = { engine, setup: { ...setup, quizTitle } };
  saveLastSetup(setup);
  // One batched lookup for every preview this game might need.
  warmPreviews(songs, { source: app.settings.audioSource });
  navigate('game');
}
