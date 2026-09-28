import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS } from '../js/data/songs.js';
import { scoreAnswer, speedBonus, streakMultiplier, performanceMessage } from '../js/core/scoring.js';
import { availableCategories, buildQuestion, createSongDeck, pickDistractors } from '../js/core/questions.js';
import { createGame, GameSetupError } from '../js/core/gameEngine.js';
import { seededRandom } from '../js/utils.js';

test('song data is well-formed and ids are unique', () => {
  const ids = new Set();
  for (const s of SONGS) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    for (const field of ['title', 'artist', 'album', 'genre', 'difficulty']) assert.ok(s[field], `${s.id} missing ${field}`);
    assert.ok(Number.isInteger(s.year));
    assert.ok(['Easy', 'Medium', 'Hard'].includes(s.difficulty));
  }
});

test('speed bonus tiers for a 10s limit', () => {
  assert.equal(speedBonus(1500, 10), 100);
  assert.equal(speedBonus(2000, 10), 100);
  assert.equal(speedBonus(4000, 10), 75);
  assert.equal(speedBonus(7000, 10), 50);
  assert.equal(speedBonus(9900, 10), 25);
});

test('streak multipliers', () => {
  assert.equal(streakMultiplier(1), 1);
  assert.equal(streakMultiplier(2), 1.1);
  assert.equal(streakMultiplier(3), 1.2);
  assert.equal(streakMultiplier(4), 1.5);
  assert.equal(streakMultiplier(9), 1.5);
});

test('scoreAnswer combines base, bonus and multiplier', () => {
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 1000, timeLimitSec: 10, streak: 1 }).points, 200);
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 3000, timeLimitSec: 10, streak: 3 }).points, 210); // 175 × 1.2
  assert.equal(scoreAnswer({ correct: false, elapsedMs: 1000, timeLimitSec: 10, streak: 0 }).points, 0);
  // Speed mode: 1.5× bonus, 5s limit → 0.8s is the top tier
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 800, timeLimitSec: 5, streak: 1, modeBonusMultiplier: 1.5 }).points, 250);
});

test('performance messages', () => {
  assert.equal(performanceMessage(95).title, 'Music mastermind.');
  assert.equal(performanceMessage(70).title, 'You know your music.');
  assert.equal(performanceMessage(50).title, 'Not bad. Your playlist needs some revision.');
  assert.equal(performanceMessage(10).title, 'The aux cord may need to be taken away.');
});

test('questions have 4 unique options including the correct song', () => {
  const rng = seededRandom(42);
  for (let i = 0; i < 200; i++) {
    const correct = SONGS[Math.floor(rng() * SONGS.length)];
    const q = buildQuestion(correct, SONGS, { similarityWeight: rng(), rng });
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.id)).size, 4);
    assert.equal(q.options[q.correctIndex].id, correct.id);
  }
});

test('correct answer position is randomised', () => {
  const rng = seededRandom(7);
  const positions = new Set();
  for (let i = 0; i < 40; i++) positions.add(buildQuestion(SONGS[0], SONGS, { rng }).correctIndex);
  assert.equal(positions.size, 4);
});

test('hard distractors favour the same genre', () => {
  const correct = SONGS.find((s) => s.genre === 'Rock');
  const d = pickDistractors(correct, SONGS, { similarityWeight: 1, rng: seededRandom(1) });
  assert.ok(d.every((s) => s.genre === 'Rock'));
});

test('deck never repeats within one pass', () => {
  const deck = createSongDeck(SONGS, seededRandom(3));
  const seen = new Set();
  for (let i = 0; i < SONGS.length; i++) {
    const s = deck.next();
    assert.ok(!seen.has(s.id));
    seen.add(s.id);
  }
});

test('every offered category can host a classic game at every difficulty', () => {
  for (const c of availableCategories(SONGS)) {
    for (const d of ['easy', 'medium', 'hard']) {
      const game = createGame({ modeId: 'classic', categoryId: c.id, difficultyId: d, songs: SONGS, rng: seededRandom(5) });
      for (let i = 0; i < 10; i++) {
        game.nextQuestion();
        game.submitAnswer(0, 1000);
      }
      assert.ok(game.isOver);
    }
  }
});

test('classic game: full loop, no repeated songs, streaks and double-answer guard', () => {
  const game = createGame({ modeId: 'classic', songs: SONGS, rng: seededRandom(11) });
  const played = new Set();
  let expectedScore = 0;
  for (let i = 0; i < 10; i++) {
    const q = game.nextQuestion();
    assert.ok(!played.has(q.song.id));
    played.add(q.song.id);
    const pick = i === 4 ? (q.correctIndex + 1) % 4 : q.correctIndex; // miss question 5
    const result = game.submitAnswer(pick, 1000);
    expectedScore += result.points;
    assert.equal(game.submitAnswer(q.correctIndex, 500), null, 'second answer ignored');
  }
  assert.ok(game.isOver);
  assert.throws(() => game.nextQuestion());
  const summary = game.summary();
  assert.equal(summary.correct, 9);
  assert.equal(summary.accuracy, 90);
  assert.equal(summary.bestStreak, 5);
  assert.equal(summary.score, expectedScore);
});

test('timeouts count as wrong and reset the streak', () => {
  const game = createGame({ modeId: 'classic', songs: SONGS, rng: seededRandom(2) });
  let q = game.nextQuestion();
  game.submitAnswer(q.correctIndex, 1000);
  q = game.nextQuestion();
  const r = game.submitAnswer(null, 10000);
  assert.equal(r.correct, false);
  assert.equal(r.timedOut, true);
  assert.equal(game.state.streak, 0);
});

test('cannot skip ahead before answering', () => {
  const game = createGame({ modeId: 'classic', songs: SONGS });
  game.nextQuestion();
  assert.throws(() => game.nextQuestion());
});

test('endless mode ends after 3 wrong answers', () => {
  const game = createGame({ modeId: 'endless', songs: SONGS, rng: seededRandom(9) });
  let rounds = 0;
  while (!game.isOver) {
    const q = game.nextQuestion();
    game.submitAnswer(rounds % 5 === 4 ? (q.correctIndex + 1) % 4 : q.correctIndex, 2000);
    rounds++;
  }
  assert.equal(game.state.wrongCount, 3);
  assert.equal(game.livesLeft, 0);
  assert.equal(rounds, 15);
});

test('empty filters raise a setup error', () => {
  assert.throws(
    () => createGame({ modeId: 'classic', categoryId: 'pop', songs: SONGS.slice(0, 3) }),
    (e) => e instanceof GameSetupError && e.code === 'NO_SONGS',
  );
});

import { parseTrackList } from '../js/core/trackMatching.js';
import { quizToSongs, sanitizeQuiz } from '../js/core/customQuiz.js';
import { matchScore } from '../js/core/itunes.js';

test('parseTrackList handles common list formats', () => {
  const items = parseTrackList('1. Blinding Lights - The Weeknd\n\nKesariya by Arijit Singh\n- Levitating\tDua Lipa\nJust A Title');
  assert.equal(items.length, 4);
  assert.deepEqual([items[0].title, items[0].artist, items[0].swappable], ['Blinding Lights', 'The Weeknd', true]);
  assert.deepEqual([items[1].title, items[1].artist, items[1].swappable], ['Kesariya', 'Arijit Singh', false]);
  assert.deepEqual([items[2].title, items[2].artist], ['Levitating', 'Dua Lipa']);
  assert.equal(items[3].artist, '');
});

test('sanitizeQuiz drops junk and enforces limits', () => {
  const tracks = [1, 2, 3, 4].map((i) => ({ itunesId: i, title: `T${i}`, artist: 'A' }));
  assert.ok(sanitizeQuiz({ title: 'x', tracks }).quiz);
  assert.ok(sanitizeQuiz({ title: 'x', tracks: tracks.slice(0, 3) }).error);
  const dupes = sanitizeQuiz({ title: 'x', tracks: [...tracks, tracks[0], { itunesId: 'abc', title: 'bad', artist: 'b' }] });
  assert.equal(dupes.quiz.tracks.length, 4);
  const songs = quizToSongs(dupes.quiz);
  assert.equal(songs[0].id, 'it1');
  const game = createGame({ modeId: 'classic', songs, questionCount: songs.length, rng: seededRandom(1) });
  assert.equal(game.totalQuestions, 4, 'short quizzes make short games');
});

test('matchScore prefers the original over remixes', () => {
  const want = { title: 'Blinding Lights', artist: 'The Weeknd' };
  const original = { kind: 'song', previewUrl: 'x', trackName: 'Blinding Lights', artistName: 'The Weeknd', collectionName: 'After Hours' };
  const remix = { ...original, trackName: 'Blinding Lights (Remix)', artistName: 'The Weeknd & ROSALÍA' };
  assert.ok(matchScore(want, original) >= 8);
  assert.ok(matchScore(want, remix) < matchScore(want, original));
});
