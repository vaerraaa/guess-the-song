// Guess the Song server: static files + multiplayer rooms + playlist import + shared quizzes
// + global leaderboard. Node 18+, no dependencies.   npm start → http://localhost:5173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { MODES, CATEGORIES } from '../js/config.js';
import { sanitizeQuiz } from '../js/core/customQuiz.js';
import { ImportError, importPlaylist, spotifyEnabled } from './imports.mjs';
import { RoomError, createRoom, joinRoom, openStream, roomAction, roomInfo, roomStats, verifyPlayer } from './rooms.mjs';
import { addScore, countQuizPlay, getQuiz, listScores, saveQuiz } from './store.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const PUBLIC_PATHS = ['index.html', 'css/', 'js/', 'assets/'];
const MAX_BODY_BYTES = 256 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.mzstatic.com",
    "media-src 'self' https://*.apple.com https://*.itunes.apple.com",
    "connect-src 'self' https://itunes.apple.com",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ── Rate limiting (per client IP, fixed window) ───────────────────────
const buckets = new Map();
function clientIp(req) {
  return String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}
function rateLimit(req, key, limit, windowMs = 60_000) {
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  let bucket = buckets.get(id);
  if (!bucket || bucket.reset < now) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(id, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) throw new HttpError(429, 'rate_limited', 'Slow down a little and try again in a minute.');
}
setInterval(() => {
  const now = Date.now();
  for (const [id, b] of buckets) if (b.reset < now) buckets.delete(id);
}, 60_000).unref();

// ── HTTP helpers ──────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'That request is too large.');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json', 'The request body isn’t valid JSON.');
  }
}

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

// ── API routes ────────────────────────────────────────────────────────
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop 'api'
  const method = req.method;

  if (parts[0] === 'health') return sendJson(res, 200, { ok: true, ...roomStats() });
  if (parts[0] === 'config') return sendJson(res, 200, { multiplayer: true, sharedQuizzes: true, globalLeaderboard: true, spotifyImport: spotifyEnabled() });

  // Multiplayer rooms
  if (parts[0] === 'rooms') {
    if (parts.length === 1 && method === 'POST') {
      rateLimit(req, 'create-room', 15);
      return sendJson(res, 201, createRoom(await readJson(req)));
    }
    const code = parts[1];
    if (parts.length === 2 && method === 'GET') return sendJson(res, 200, roomInfo(code));
    if (parts[2] === 'join' && method === 'POST') {
      rateLimit(req, 'join-room', 30);
      return sendJson(res, 201, joinRoom(code, await readJson(req)));
    }
    if (parts[2] === 'stream' && method === 'GET') {
      const playerId = url.searchParams.get('player');
      const token = url.searchParams.get('token');
      verifyPlayer(code, playerId, token); // throws (as JSON) before the stream starts
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      const release = openStream(code, playerId, token, res); // sends the current state right away
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
      req.on('close', () => {
        clearInterval(heartbeat);
        release();
      });
      return;
    }
    if (parts.length === 3 && method === 'POST') {
      rateLimit(req, 'room-action', 240);
      return sendJson(res, 200, await roomAction(code, parts[2], await readJson(req)));
    }
  }

  // Playlist import
  if (parts[0] === 'import' && method === 'GET') {
    rateLimit(req, 'import', 12);
    return sendJson(res, 200, await importPlaylist(url.searchParams.get('url') ?? ''));
  }

  // Shared quizzes
  if (parts[0] === 'quizzes') {
    if (parts.length === 1 && method === 'POST') {
      rateLimit(req, 'save-quiz', 20);
      const body = await readJson(req);
      const { quiz, error } = sanitizeQuiz(body.quiz);
      if (error) throw new HttpError(400, 'bad_quiz', error);
      const saved = await saveQuiz(quiz, body.id, body.editToken);
      if (saved.error) throw new HttpError(403, 'not_owner', 'This quiz belongs to someone else. Save it as a copy.');
      return sendJson(res, 201, saved);
    }
    if (parts.length === 2 && method === 'GET') {
      const quiz = await getQuiz(parts[1]);
      if (!quiz) throw new HttpError(404, 'not_found', 'That quiz doesn’t exist. Check the link.');
      return sendJson(res, 200, quiz);
    }
    if (parts[2] === 'play' && method === 'POST') {
      rateLimit(req, 'quiz-play', 60);
      await countQuizPlay(parts[1]);
      return sendJson(res, 200, { ok: true });
    }
  }

  // Global leaderboard
  if (parts[0] === 'leaderboard') {
    if (method === 'GET') {
      const modeId = MODES[url.searchParams.get('mode')] ? url.searchParams.get('mode') : undefined;
      return sendJson(res, 200, await listScores({ modeId, limit: 50 }));
    }
    if (method === 'POST') {
      rateLimit(req, 'score', 20);
      const b = await readJson(req);
      const answered = Number.parseInt(b.answered, 10);
      const correct = Number.parseInt(b.correct, 10);
      const score = Number.parseInt(b.score, 10);
      const name = cleanText(b.name, 20);
      const plausible =
        name && MODES[b.modeId] && answered > 0 && answered <= 1000 &&
        correct >= 0 && correct <= answered && score >= 0 && score <= answered * 400;
      if (!plausible) throw new HttpError(400, 'bad_score', 'That score couldn’t be saved.');
      const categoryId = CATEGORIES.some((c) => c.id === b.categoryId) ? b.categoryId : 'custom';
      return sendJson(res, 201, await addScore({
        name,
        score,
        correct,
        answered,
        accuracy: Math.round((correct / answered) * 100),
        modeId: b.modeId,
        categoryId,
        difficultyId: ['easy', 'medium', 'hard'].includes(b.difficultyId) ? b.difficultyId : 'medium',
        quizTitle: categoryId === 'custom' ? cleanText(b.quizTitle, 60) : undefined,
      }));
    }
  }

  throw new HttpError(404, 'not_found', 'Unknown API route.');
}

// ── Static files ──────────────────────────────────────────────────────
const etagCache = new Map(); // path → { key, etag }

async function readWithEtag(file, info) {
  const body = await readFile(file);
  const key = `${info.size}:${info.mtimeMs}`;
  let entry = etagCache.get(file);
  if (!entry || entry.key !== key) {
    entry = { key, etag: `"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"` };
    etagCache.set(file, entry);
  }
  return { body, etag: entry.etag };
}

async function serveStatic(req, res, url) {
  let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (path === '' || path.endsWith('/')) path += 'index.html';
  const safe = normalize(path);
  const allowed = !safe.startsWith('..') && PUBLIC_PATHS.some((p) => safe === p || safe.split(sep).join('/').startsWith(p));
  const file = join(ROOT, safe);
  try {
    if (!allowed) throw new Error('not public');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    // Revalidate every time against a hash of the file's contents. A browser keeps its copy only
    // when the bytes are identical, so deploying a newer OR an older version (a rollback) can
    // never leave it running a mix of old and new modules. Date-based validators can't do that:
    // a rollback serves files with older timestamps, which looks "not modified".
    const { body, etag } = await readWithEtag(file, info);
    const headers = { ...SECURITY_HEADERS, 'Cache-Control': 'no-cache', ETag: etag };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    // Unknown paths get the app shell so shared links like /?room=ABCD always load.
    if (!extname(safe)) {
      const body = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache' });
      res.end(body);
      return;
    }
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, url);
    else throw new HttpError(405, 'method', 'Method not allowed.');
  } catch (err) {
    const known = err instanceof HttpError || err instanceof RoomError || err instanceof ImportError;
    if (!known) console.error(err);
    if (res.headersSent) return res.end();
    sendJson(res, known ? err.status : 500, { error: known ? err.code : 'server_error', message: known ? err.message : 'Something went wrong on the server.' });
  }
});

server.keepAliveTimeout = 65_000;
server.listen(PORT, () => console.log(`Guess the Song → http://localhost:${PORT}`));

// Rooms live in memory, so one unexpected error shouldn't take every game down with it.
process.on('uncaughtException', (err) => console.error('Uncaught error:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
