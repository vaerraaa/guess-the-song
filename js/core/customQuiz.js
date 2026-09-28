// Custom quizzes: validation and conversion to the song shape the game engine uses.
// Shared by the browser and the server.

export const QUIZ_LIMITS = { minTracks: 4, maxTracks: 200, titleMax: 60 };

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

/** Clean untrusted quiz input. Returns { quiz } or { error }. */
export function sanitizeQuiz(input) {
  if (!input || typeof input !== 'object') return { error: 'Quiz data is missing.' };
  const title = clip(input.title, QUIZ_LIMITS.titleMax) || 'Untitled quiz';
  const seen = new Set();
  const tracks = [];
  for (const t of Array.isArray(input.tracks) ? input.tracks : []) {
    const itunesId = Number(t?.itunesId);
    if (!Number.isSafeInteger(itunesId) || itunesId <= 0 || seen.has(itunesId)) continue;
    seen.add(itunesId);
    const year = Number(t.year);
    tracks.push({
      itunesId,
      title: clip(t.title, 150),
      artist: clip(t.artist, 150),
      album: clip(t.album, 150),
      artwork: /^https:\/\/[a-z0-9.-]+\.mzstatic\.com\//.test(t.artwork ?? '') ? clip(t.artwork, 300) : '',
      genre: clip(t.genre, 40),
      year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : undefined,
      store: /^[A-Z]{2}$/.test(t.store ?? '') ? t.store : 'US',
    });
    if (tracks.length >= QUIZ_LIMITS.maxTracks) break;
  }
  if (tracks.some((t) => !t.title || !t.artist)) return { error: 'Every song needs a title and an artist.' };
  if (tracks.length < QUIZ_LIMITS.minTracks) return { error: `A quiz needs at least ${QUIZ_LIMITS.minTracks} songs.` };
  return { quiz: { title, tracks } };
}

/** Turn quiz tracks into game songs. */
export function quizToSongs(quiz) {
  return quiz.tracks.map((t) => ({
    id: `it${t.itunesId}`,
    itunesId: t.itunesId,
    store: t.store ?? 'US',
    title: t.title,
    artist: t.artist,
    album: t.album,
    artwork: t.artwork,
    genre: t.genre || 'Custom',
    year: t.year ?? 2000,
    difficulty: 'Medium',
    tags: [],
  }));
}
