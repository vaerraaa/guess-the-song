// Multiplayer rooms. The server owns the game: it picks songs, times each question and scores
// answers, so every player sees the same thing and nobody can fake a result in their browser.
// Clients receive state over Server-Sent Events and send actions as small POST requests.
import { randomBytes, randomInt } from 'node:crypto';
import { DIFFICULTIES, MODES } from '../js/config.js';
import { SONGS } from '../js/data/songs.js';
import { answerPool, buildQuestion, createSongDeck, getCategory, songsForCategory } from '../js/core/questions.js';
import { scoreAnswer } from '../js/core/scoring.js';
import { quizToSongs, sanitizeQuiz } from '../js/core/customQuiz.js';
import { previewFor, warmPreviews } from './previews.mjs';

export const ROOM_LIMITS = { maxRooms: 500, maxPlayers: 12, nameMax: 20, minQuestions: 5, maxQuestions: 20 };
// GTS_TIMING_SCALE shrinks the waits (tests run with 0.05).
const SCALE = Number(process.env.GTS_TIMING_SCALE) || 1;
const TIMING = {
  leadInMs: 3500 * SCALE, // time for every player to buffer the preview before it starts together
  revealMs: 7000 * SCALE,
  graceMs: 400, // network allowance on the answer deadline
  hostHandoffMs: 15000,
  emptyRoomMs: 5 * 60 * 1000,
  idleRoomMs: 45 * 60 * 1000,
};
const MULTIPLAYER_MODES = ['classic', 'speed'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map();

export class RoomError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────
function cleanName(name) {
  const cleaned = String(name ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, ROOM_LIMITS.nameMax);
  if (!cleaned) throw new RoomError('bad_name', 'Enter a name to play.');
  return cleaned;
}

function newCode() {
  for (let i = 0; i < 50; i++) {
    const code = Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
  throw new RoomError('busy', 'Could not create a room right now. Try again.', 503);
}

function normalizeSettings(input = {}) {
  const modeId = MULTIPLAYER_MODES.includes(input.modeId) ? input.modeId : 'classic';
  const difficultyId = DIFFICULTIES[input.difficultyId] ? input.difficultyId : 'medium';
  const questionCount = Math.min(ROOM_LIMITS.maxQuestions, Math.max(ROOM_LIMITS.minQuestions, Number.parseInt(input.questionCount, 10) || 10));
  let quiz = null;
  if (input.quiz) {
    const { quiz: clean, error } = sanitizeQuiz(input.quiz);
    if (error) throw new RoomError('bad_quiz', error);
    quiz = clean;
  }
  const categoryId = getCategory(input.categoryId).id;
  return { modeId, difficultyId, questionCount, categoryId, quiz };
}

function settingsSummary(settings) {
  const mode = MODES[settings.modeId];
  const category = getCategory(settings.categoryId);
  return {
    modeId: mode.id,
    modeName: mode.name,
    difficultyId: settings.difficultyId,
    difficultyName: DIFFICULTIES[settings.difficultyId].name,
    questionCount: settings.questionCount,
    timeLimitSec: mode.timeLimitSec,
    previewSec: Math.min(DIFFICULTIES[settings.difficultyId].previewSec, mode.timeLimitSec),
    source: settings.quiz
      ? { kind: 'quiz', title: settings.quiz.title, count: settings.quiz.tracks.length }
      : { kind: 'category', id: category.id, name: category.name, icon: category.icon },
  };
}

function touch(room) {
  room.lastActivity = Date.now();
}

function requireRoom(code) {
  const room = rooms.get(String(code ?? '').toUpperCase());
  if (!room) throw new RoomError('no_room', 'That room doesn’t exist or has closed. Check the code.', 404);
  return room;
}

function requirePlayer(room, playerId, token) {
  const player = room.players.get(playerId);
  if (!player || player.token !== token) throw new RoomError('not_in_room', 'You’re not in this room anymore. Join again.', 403);
  return player;
}

function requireHost(room, player) {
  if (room.hostId !== player.id) throw new RoomError('not_host', 'Only the host can do that.', 403);
}

function newPlayer(name) {
  return {
    id: randomBytes(6).toString('hex'),
    token: randomBytes(16).toString('hex'),
    name: cleanName(name),
    joinedAt: Date.now(),
    connections: 0,
    connected: false,
    disconnectedAt: Date.now(),
    ...freshStats(),
  };
}

function freshStats() {
  return { score: 0, streak: 0, bestStreak: 0, correct: 0, answeredCount: 0, totalMs: 0, lastResult: null };
}

// ── Views sent to clients ─────────────────────────────────────────────
function viewFor(room, viewerId) {
  const q = room.current;
  const showResults = room.phase === 'reveal' || room.phase === 'final';
  const view = {
    now: Date.now(),
    code: room.code,
    you: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    settings: settingsSummary(room.settings),
    message: room.message ?? null,
    players: [...room.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        streak: p.streak,
        bestStreak: p.bestStreak,
        correct: p.correct,
        answeredCount: p.answeredCount,
        avgMs: p.correct ? Math.round(p.totalMs / p.correct) : null,
        connected: p.connected,
        answered: Boolean(q?.answers.has(p.id)),
        lastResult: showResults ? p.lastResult : null,
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    question: null,
    revealEndsAt: room.phase === 'reveal' ? room.revealEndsAt : null,
  };
  if (q && (room.phase === 'question' || room.phase === 'reveal')) {
    view.question = {
      number: q.number,
      total: room.game.questionCount,
      options: q.options.map((s) => ({ title: s.title, artist: s.artist })),
      startsAt: q.startsAt,
      endsAt: q.endsAt,
      previewUrl: q.preview?.previewUrl ?? null,
      synthSeed: q.preview ? null : q.synthSeed,
      offsetSec: q.offsetSec,
      previewSec: settingsSummary(room.settings).previewSec,
      yourChoice: q.answers.get(viewerId)?.choice ?? null,
    };
    if (room.phase === 'reveal') {
      view.question.correctIndex = q.correctIndex;
      view.question.song = {
        title: q.song.title,
        artist: q.song.artist,
        album: q.song.album,
        year: q.song.year,
        artwork: q.preview?.artwork || q.song.artwork || '',
        id: q.song.id,
      };
    }
  }
  return view;
}

function broadcast(room) {
  for (const player of room.players.values()) {
    for (const res of player.streams ?? []) send(res, viewFor(room, player.id));
  }
}

function send(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── Game flow ─────────────────────────────────────────────────────────
function schedule(room, delayMs, fn) {
  clearTimeout(room.timer);
  const epoch = room.epoch;
  room.timer = setTimeout(() => {
    if (room.epoch === epoch && rooms.has(room.code)) fn();
  }, Math.max(0, delayMs));
}

async function startGame(room) {
  const { settings } = room;
  let songs;
  let candidates;
  let fallback;
  if (settings.quiz) {
    songs = quizToSongs(settings.quiz);
    candidates = songs;
    fallback = songs;
  } else {
    candidates = songsForCategory(SONGS, settings.categoryId);
    songs = answerPool(SONGS, settings.categoryId, settings.difficultyId, settings.questionCount);
    fallback = SONGS;
  }
  if (songs.length < 4 || candidates.length < 4) throw new RoomError('no_songs', 'Not enough songs for this game. Pick another category or quiz.');

  room.epoch += 1;
  const epoch = room.epoch;
  room.message = null;
  for (const p of room.players.values()) Object.assign(p, freshStats());
  room.game = {
    deck: createSongDeck(songs),
    candidates,
    fallback,
    questionCount: Math.min(settings.questionCount, songs.length),
    asked: 0,
  };
  room.current = null;
  room.phase = 'starting';
  broadcast(room);
  await warmPreviews(songs);
  if (room.epoch === epoch && rooms.has(room.code)) nextQuestion(room);
}

async function nextQuestion(room) {
  const { game } = room;
  if (game.asked >= game.questionCount) return finish(room);
  const epoch = room.epoch;

  let song = null;
  let preview = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    song = game.deck.next();
    preview = await previewFor(song).catch(() => null);
    if (preview) break;
  }
  if (room.epoch !== epoch || !rooms.has(room.code)) return;

  const mode = MODES[room.settings.modeId];
  const question = buildQuestion(song, game.candidates, {
    similarityWeight: DIFFICULTIES[room.settings.difficultyId].distractorSimilarity,
    fallback: game.fallback,
  });
  game.asked += 1;
  const startsAt = Date.now() + TIMING.leadInMs;
  room.current = {
    number: game.asked,
    song,
    options: question.options,
    correctIndex: question.correctIndex,
    preview,
    synthSeed: randomInt(1, 1_000_000),
    offsetSec: randomInt(3, 13), // everyone hears the same part of the song
    startsAt,
    endsAt: startsAt + mode.timeLimitSec * 1000,
    answers: new Map(),
  };
  room.phase = 'question';
  touch(room);
  broadcast(room);
  schedule(room, room.current.endsAt + TIMING.graceMs - Date.now(), () => reveal(room));
}

function reveal(room) {
  const q = room.current;
  if (room.phase !== 'question' || !q) return;
  const mode = MODES[room.settings.modeId];
  const limitMs = mode.timeLimitSec * 1000;

  for (const player of room.players.values()) {
    const answer = q.answers.get(player.id);
    const correct = answer ? answer.choice === q.correctIndex : false;
    const elapsedMs = answer ? Math.min(limitMs, Math.max(0, answer.at - q.startsAt)) : limitMs;
    const streak = correct ? player.streak + 1 : 0;
    const breakdown = scoreAnswer({
      correct,
      elapsedMs,
      timeLimitSec: mode.timeLimitSec,
      streak,
      modeBonusMultiplier: mode.speedBonusMultiplier,
    });
    player.streak = streak;
    player.bestStreak = Math.max(player.bestStreak, streak);
    player.score += breakdown.points;
    player.answeredCount += 1;
    if (correct) {
      player.correct += 1;
      player.totalMs += elapsedMs;
    }
    player.lastResult = { choice: answer?.choice ?? null, correct, timedOut: !answer, elapsedMs, ...breakdown };
  }

  room.phase = 'reveal';
  room.revealEndsAt = Date.now() + TIMING.revealMs;
  touch(room);
  broadcast(room);
  schedule(room, TIMING.revealMs, () => nextQuestion(room));
}

function finish(room) {
  clearTimeout(room.timer);
  room.phase = 'final';
  room.current = null;
  touch(room);
  broadcast(room);
}

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}

function maybeRevealEarly(room) {
  const q = room.current;
  if (room.phase !== 'question' || !q) return;
  const waiting = connectedPlayers(room).filter((p) => !q.answers.has(p.id));
  if (waiting.length === 0) schedule(room, 700 * SCALE, () => reveal(room));
}

function assignNewHost(room) {
  const next = connectedPlayers(room).sort((a, b) => a.joinedAt - b.joinedAt)[0] ?? [...room.players.values()][0];
  if (next && next.id !== room.hostId) {
    room.hostId = next.id;
    room.message = `${next.name} is now the host.`;
  }
}

// ── Public API (called by the HTTP layer) ─────────────────────────────
export function createRoom({ name, settings }) {
  if (rooms.size >= ROOM_LIMITS.maxRooms) throw new RoomError('busy', 'The server is full right now. Try again soon.', 503);
  const host = newPlayer(name);
  const room = {
    code: newCode(),
    hostId: host.id,
    players: new Map([[host.id, host]]),
    settings: normalizeSettings(settings),
    phase: 'lobby',
    epoch: 0,
    game: null,
    current: null,
    timer: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(room.code, room);
  return { code: room.code, playerId: host.id, token: host.token };
}

export function roomInfo(code) {
  const room = requireRoom(code);
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.size,
    full: room.players.size >= ROOM_LIMITS.maxPlayers,
    settings: settingsSummary(room.settings),
  };
}

export function joinRoom(code, { name }) {
  const room = requireRoom(code);
  if (room.players.size >= ROOM_LIMITS.maxPlayers) throw new RoomError('full', `This room is full (${ROOM_LIMITS.maxPlayers} players max).`, 409);
  const player = newPlayer(name);
  const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
  let candidate = player.name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${player.name.slice(0, ROOM_LIMITS.nameMax - 3)} ${n}`;
  player.name = candidate;
  room.players.set(player.id, player);
  touch(room);
  broadcast(room);
  return { code: room.code, playerId: player.id, token: player.token };
}

export function verifyPlayer(code, playerId, token) {
  requirePlayer(requireRoom(code), playerId, token);
}

export function openStream(code, playerId, token, res) {
  const room = requireRoom(code);
  const player = requirePlayer(room, playerId, token);
  player.streams ??= new Set();
  player.streams.add(res);
  player.connections += 1;
  player.connected = true;
  if (room.hostId === player.id) clearTimeout(room.handoffTimer);
  touch(room);
  broadcast(room);

  return () => {
    player.streams.delete(res);
    player.connections = Math.max(0, player.connections - 1);
    if (player.connections > 0 || !room.players.has(player.id)) return;
    player.connected = false;
    player.disconnectedAt = Date.now();
    if (room.hostId === player.id) {
      clearTimeout(room.handoffTimer);
      room.handoffTimer = setTimeout(() => {
        if (!player.connected && rooms.has(room.code)) {
          assignNewHost(room);
          broadcast(room);
        }
      }, TIMING.hostHandoffMs);
    }
    maybeRevealEarly(room);
    broadcast(room);
  };
}

export async function roomAction(code, action, { playerId, token, ...body }) {
  const room = requireRoom(code);
  const player = requirePlayer(room, playerId, token);
  touch(room);

  switch (action) {
    case 'settings': {
      requireHost(room, player);
      if (room.phase !== 'lobby' && room.phase !== 'final') throw new RoomError('busy', 'Change settings between games.');
      room.settings = normalizeSettings(body.settings);
      room.phase = 'lobby';
      broadcast(room);
      return { ok: true };
    }
    case 'start': {
      requireHost(room, player);
      if (room.phase !== 'lobby' && room.phase !== 'final') throw new RoomError('busy', 'A game is already running.');
      await startGame(room);
      return { ok: true };
    }
    case 'answer': {
      const q = room.current;
      const choice = Number(body.choice);
      if (room.phase !== 'question' || !q || Number(body.questionNumber) !== q.number) throw new RoomError('closed', 'That question is closed.', 409);
      if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) throw new RoomError('bad_choice', 'Invalid answer.');
      const now = Date.now();
      if (now < q.startsAt - 250) throw new RoomError('early', 'The song hasn’t started yet.', 409);
      if (now > q.endsAt + TIMING.graceMs) throw new RoomError('closed', 'Time’s up for that question.', 409);
      if (q.answers.has(player.id)) return { ok: true, duplicate: true };
      q.answers.set(player.id, { choice, at: now });
      broadcast(room);
      maybeRevealEarly(room);
      return { ok: true };
    }
    case 'next': {
      requireHost(room, player);
      if (room.phase === 'reveal') {
        room.epoch += 1; // cancel the pending auto-advance
        nextQuestion(room);
      }
      return { ok: true };
    }
    case 'lobby': {
      requireHost(room, player);
      room.epoch += 1;
      clearTimeout(room.timer);
      room.phase = 'lobby';
      room.current = null;
      for (const p of room.players.values()) Object.assign(p, freshStats());
      broadcast(room);
      return { ok: true };
    }
    case 'leave': {
      room.players.delete(player.id);
      for (const res of player.streams ?? []) res.end();
      if (room.players.size === 0) {
        closeRoom(room);
        return { ok: true };
      }
      if (room.hostId === player.id) assignNewHost(room);
      maybeRevealEarly(room);
      broadcast(room);
      return { ok: true };
    }
    default:
      throw new RoomError('unknown_action', 'Unknown action.', 404);
  }
}

function closeRoom(room) {
  clearTimeout(room.timer);
  clearTimeout(room.handoffTimer);
  room.epoch += 1;
  rooms.delete(room.code);
}

// Housekeeping: drop rooms nobody is connected to, and rooms idle for too long.
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const anyoneHere = connectedPlayers(room).length > 0;
    const lastSeen = Math.max(...[...room.players.values()].map((p) => (p.connected ? now : p.disconnectedAt)));
    if ((!anyoneHere && now - lastSeen > TIMING.emptyRoomMs) || now - room.lastActivity > TIMING.idleRoomMs) {
      for (const p of room.players.values()) for (const res of p.streams ?? []) res.end();
      closeRoom(room);
    }
  }
}, 60 * 1000).unref();

export function roomStats() {
  return { rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.players.size, 0) };
}
