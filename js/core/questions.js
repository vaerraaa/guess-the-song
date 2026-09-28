import { ANSWER_OPTION_COUNT, CATEGORIES, DIFFICULTIES, MIN_SONGS_PER_CATEGORY } from '../config.js';
import { shuffle } from '../utils.js';

export function getCategory(categoryId) {
  return CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];
}

export function songsForCategory(songs, categoryId) {
  return songs.filter(getCategory(categoryId).filter);
}

/** Categories with enough songs to play, each annotated with its song count. */
export function availableCategories(songs, minSongs = MIN_SONGS_PER_CATEGORY) {
  return CATEGORIES.map((c) => ({ ...c, count: songs.filter(c.filter).length })).filter(
    (c) => c.count >= minSongs,
  );
}

/**
 * Songs eligible to be the *correct* answer for a category + difficulty.
 * Falls back to the whole category if the difficulty filter leaves too few.
 */
export function answerPool(songs, categoryId, difficultyId, minSize) {
  const inCategory = songsForCategory(songs, categoryId);
  const allowed = DIFFICULTIES[difficultyId]?.songPool;
  if (!allowed) return inCategory;
  const filtered = inCategory.filter((s) => allowed.includes(s.difficulty));
  return filtered.length >= minSize ? filtered : inCategory;
}

/** Higher = more similar. Used to pick convincing wrong answers. */
export function similarity(a, b) {
  let score = 0;
  if (a.genre === b.genre) score += 3;
  const yearGap = Math.abs(a.year - b.year);
  if (yearGap <= 3) score += 2;
  else if (yearGap <= 8) score += 1;
  if (a.language && a.language === b.language) score += 1;
  if (a.difficulty === b.difficulty) score += 1;
  return score;
}

function isValidDistractor(correct, candidate) {
  return (
    candidate.id !== correct.id &&
    candidate.title.trim().toLowerCase() !== correct.title.trim().toLowerCase()
  );
}

/**
 * Pick wrong answers for `correct`.
 * similarityWeight 0 → random, 1 → most similar songs, in between → a blend.
 * `candidates` should be the category's songs; `fallback` (whole library) is used if too few.
 */
export function pickDistractors(correct, candidates, { count = ANSWER_OPTION_COUNT - 1, similarityWeight = 0.5, rng = Math.random, fallback = [] } = {}) {
  const seenTitles = new Set([correct.title.toLowerCase()]);
  const chosen = [];

  const consider = (list) => {
    const ranked = shuffle(list.filter((s) => isValidDistractor(correct, s)), rng)
      .map((song) => ({ song, rank: similarity(correct, song) * similarityWeight + rng() * 6 * (1 - similarityWeight) }))
      .sort((a, b) => b.rank - a.rank);
    for (const { song } of ranked) {
      if (chosen.length >= count) break;
      const key = song.title.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      chosen.push(song);
    }
  };

  consider(candidates);
  if (chosen.length < count) consider(fallback);
  return chosen;
}

/** Build one question: the correct song plus shuffled options. */
export function buildQuestion(correct, candidates, { similarityWeight, rng = Math.random, fallback = [] } = {}) {
  const distractors = pickDistractors(correct, candidates, { similarityWeight, rng, fallback });
  if (distractors.length < ANSWER_OPTION_COUNT - 1) {
    throw new Error('Not enough songs to build answer choices.');
  }
  const options = shuffle([correct, ...distractors], rng);
  return {
    song: correct,
    options,
    correctIndex: options.findIndex((s) => s.id === correct.id),
  };
}

/**
 * Supplies correct-answer songs without repeats. When the pool is exhausted (Endless mode),
 * it reshuffles but keeps the most recent songs out so nothing repeats back-to-back.
 */
export function createSongDeck(pool, rng = Math.random) {
  let queue = shuffle(pool, rng);
  const recent = [];
  const recentLimit = Math.min(Math.floor(pool.length / 2), 20);

  return {
    next() {
      if (queue.length === 0) {
        const recentIds = new Set(recent.map((s) => s.id));
        queue = shuffle(pool.filter((s) => !recentIds.has(s.id)), rng);
      }
      const song = queue.shift();
      recent.push(song);
      if (recent.length > recentLimit) recent.shift();
      return song;
    },
    get remaining() {
      return queue.length;
    },
  };
}
