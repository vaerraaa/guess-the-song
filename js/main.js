import { app, applySettings, installAudioUnlock } from './app.js';
import { defineRoute, startRouter } from './router.js';

defineRoute('home', () => import('./pages/HomePage.js'));
defineRoute('play', () => import('./pages/SetupPage.js'));
defineRoute('game', () => import('./pages/GamePage.js'));
defineRoute('results', () => import('./pages/ResultsPage.js'));
defineRoute('leaderboard', () => import('./pages/LeaderboardPage.js'));
defineRoute('multiplayer', () => import('./pages/MultiplayerPage.js'));
defineRoute('room', () => import('./pages/RoomPage.js'));
defineRoute('quizzes', () => import('./pages/QuizzesPage.js'));
defineRoute('quiz-editor', () => import('./pages/QuizEditorPage.js'));

// Share links: /?room=ABCD opens the join form, /?quiz=<id> opens a shared quiz.
const params = new URLSearchParams(location.search);
const roomCode = params.get('room')?.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
const quizId = params.get('quiz')?.replace(/[^a-z0-9]/g, '').slice(0, 16);
if (roomCode || quizId) {
  history.replaceState(null, '', location.pathname + (roomCode ? '#/multiplayer' : '#/quizzes'));
  if (roomCode) app.pendingRoomCode = roomCode;
  if (quizId) app.pendingQuizId = quizId;
}

applySettings();
installAudioUnlock();
startRouter(document.getElementById('app'));
