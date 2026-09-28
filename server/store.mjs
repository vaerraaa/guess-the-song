// Tiny JSON-file persistence for shared quizzes and the global leaderboard.
// Files live in DATA_DIR (default ./data). On hosts with an ephemeral disk, point DATA_DIR at a
// persistent volume — or replace these functions with database calls; nothing else changes.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const cache = new Map();
const writeQueues = new Map();

async function load(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let value = fallback;
  try {
    value = JSON.parse(await readFile(join(DATA_DIR, `${name}.json`), 'utf8'));
  } catch {
    /* first run or unreadable file: start fresh */
  }
  cache.set(name, value);
  return value;
}

// Writes are serialized per file and done atomically (write temp, then rename).
function persist(name) {
  const previous = writeQueues.get(name) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      const file = join(DATA_DIR, `${name}.json`);
      await writeFile(`${file}.tmp`, JSON.stringify(cache.get(name)));
      await rename(`${file}.tmp`, file);
    })
    .catch((err) => console.error(`Could not save ${name}:`, err.message));
  writeQueues.set(name, next);
  return next;
}

// ── Quizzes ───────────────────────────────────────────────────────────
const QUIZ_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function newQuizId() {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => QUIZ_ID_ALPHABET[b % QUIZ_ID_ALPHABET.length]).join('');
}

export async function saveQuiz(quiz, existingId, editToken) {
  const quizzes = await load('quizzes', {});
  if (existingId && quizzes[existingId]) {
    if (quizzes[existingId].editToken !== editToken) return { error: 'not_owner' };
    quizzes[existingId] = { ...quizzes[existingId], ...quiz, updatedAt: Date.now() };
    await persist('quizzes');
    return { id: existingId, editToken };
  }
  const id = existingId && /^[a-z0-9]{8}$/.test(existingId) && !quizzes[existingId] ? existingId : newQuizId();
  const token = editToken && /^[a-f0-9]{32}$/.test(editToken) ? editToken : randomBytes(16).toString('hex');
  quizzes[id] = { ...quiz, id, editToken: token, createdAt: Date.now(), updatedAt: Date.now(), plays: 0 };
  await persist('quizzes');
  return { id, editToken: token };
}

export async function getQuiz(id) {
  const quizzes = await load('quizzes', {});
  const quiz = quizzes[id];
  if (!quiz) return null;
  const { editToken, ...publicQuiz } = quiz;
  return publicQuiz;
}

export async function countQuizPlay(id) {
  const quizzes = await load('quizzes', {});
  if (!quizzes[id]) return;
  quizzes[id].plays = (quizzes[id].plays ?? 0) + 1;
  persist('quizzes');
}

// ── Global leaderboard ────────────────────────────────────────────────
const MAX_ENTRIES = 1000;

export async function listScores({ modeId, limit = 50 } = {}) {
  const scores = await load('leaderboard', []);
  return scores.filter((s) => !modeId || s.modeId === modeId).slice(0, limit);
}

export async function addScore(entry) {
  const scores = await load('leaderboard', []);
  const record = { id: randomBytes(6).toString('hex'), date: Date.now(), ...entry };
  scores.push(record);
  scores.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy || a.date - b.date);
  scores.length = Math.min(scores.length, MAX_ENTRIES);
  await persist('leaderboard');
  const sameMode = scores.filter((s) => s.modeId === record.modeId);
  const rank = sameMode.findIndex((s) => s.id === record.id) + 1;
  return { record, rank: rank || null };
}
