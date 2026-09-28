import { DEFAULT_SETTINGS } from '../config.js';
import { api, serverFeatures } from '../api.js';

const PREFIX = 'gts:';
const KEYS = {
  settings: 'settings',
  username: 'username',
  leaderboard: 'leaderboard',
  stats: 'stats',
  previewCache: 'previewCache',
  lastSetup: 'lastSetup',
  quizzes: 'quizzes',
};

// localStorage can throw (private mode, quota, disabled). Everything degrades to in-memory.
const memory = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return memory.has(key) ? memory.get(key) : fallback;
  }
}

function write(key, value) {
  memory.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* in-memory copy is enough */
  }
}

function remove(key) {
  memory.delete(key);
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

// ── Settings ──────────────────────────────────────────────────────────
export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}

export function saveSettings(settings) {
  write(KEYS.settings, settings);
}

// ── Username ──────────────────────────────────────────────────────────
export function loadUsername() {
  return read(KEYS.username, '');
}

export function saveUsername(name) {
  write(KEYS.username, name);
}

// ── Last chosen setup (mode/category/difficulty) ──────────────────────
export function loadLastSetup() {
  return read(KEYS.lastSetup, { modeId: 'classic', categoryId: 'all', difficultyId: 'medium' });
}

export function saveLastSetup(setup) {
  write(KEYS.lastSetup, setup);
}

// ── Stats ─────────────────────────────────────────────────────────────
export function loadStats() {
  return read(KEYS.stats, { gamesPlayed: 0, songsAnswered: 0, songsCorrect: 0, bestScores: {} });
}

export function recordGameStats(summary) {
  const stats = loadStats();
  stats.gamesPlayed += 1;
  stats.songsAnswered += summary.answered;
  stats.songsCorrect += summary.correct;
  stats.bestScores[summary.modeId] = Math.max(stats.bestScores[summary.modeId] ?? 0, summary.score);
  write(KEYS.stats, stats);
  return stats;
}

// ── Preview URL cache (so we don't hit the music API every game) ─────
export function loadPreviewCache() {
  return read(KEYS.previewCache, {});
}

export function savePreviewCache(cache) {
  write(KEYS.previewCache, cache);
}

// ── Leaderboard ───────────────────────────────────────────────────────
// "local" scores live on this device; "global" scores go through the game server when there is one.
const MAX_ENTRIES = 100;

function listLocal(modeId) {
  return read(KEYS.leaderboard, [])
    .filter((e) => !modeId || e.modeId === modeId)
    .sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || a.date - b.date);
}

export const leaderboardRepository = {
  async hasGlobal() {
    return Boolean((await serverFeatures())?.globalLeaderboard);
  },

  async list({ modeId, scope = 'local' } = {}) {
    if (scope === 'global') return api(`leaderboard${modeId ? `?mode=${modeId}` : ''}`);
    return listLocal(modeId);
  },

  /** Saves locally, and globally when a server is available. */
  async add(entry) {
    const record = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: Date.now(), ...entry };
    const entries = [...read(KEYS.leaderboard, []), record].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
    write(KEYS.leaderboard, entries);
    const rank = listLocal(record.modeId).findIndex((e) => e.id === record.id) + 1;

    let global = null;
    if (await this.hasGlobal()) {
      try {
        global = await api('leaderboard', { method: 'POST', body: entry });
      } catch {
        /* the local save still counts */
      }
    }
    return { record, rank, globalRank: global?.rank ?? null, globalId: global?.record?.id ?? null };
  },
};

// ── Custom quizzes (kept on this device; shared copies live on the server) ──
export function listQuizzes() {
  return read(KEYS.quizzes, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getLocalQuiz(localId) {
  return read(KEYS.quizzes, []).find((q) => q.localId === localId) ?? null;
}

export function saveLocalQuiz(quiz) {
  const quizzes = read(KEYS.quizzes, []);
  const record = { ...quiz, localId: quiz.localId ?? `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, updatedAt: Date.now() };
  const index = quizzes.findIndex((q) => q.localId === record.localId);
  if (index >= 0) quizzes[index] = record;
  else quizzes.push(record);
  write(KEYS.quizzes, quizzes);
  return record;
}

export function deleteLocalQuiz(localId) {
  write(KEYS.quizzes, read(KEYS.quizzes, []).filter((q) => q.localId !== localId));
}

// ── Multiplayer seat (per tab, so a refresh rejoins the same room) ────
export function loadRoomSeat() {
  try {
    return JSON.parse(sessionStorage.getItem(PREFIX + 'room') ?? 'null');
  } catch {
    return memory.get('room') ?? null;
  }
}

export function saveRoomSeat(seat) {
  memory.set('room', seat);
  try {
    if (seat) sessionStorage.setItem(PREFIX + 'room', JSON.stringify(seat));
    else sessionStorage.removeItem(PREFIX + 'room');
  } catch {
    /* memory copy is enough */
  }
}

export function resetAllData() {
  Object.values(KEYS).forEach(remove);
}
