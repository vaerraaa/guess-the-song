// Central game configuration. Tweak gameplay here — no other file needs to change.

export const SCORING = {
  basePoints: 100,
  // Speed bonus tiers, expressed as a fraction of the question's time limit.
  // With a 10s limit these map to 0–2s, 2–5s, 5–8s and 8–10s.
  speedTiers: [
    { upTo: 0.2, bonus: 100 },
    { upTo: 0.5, bonus: 75 },
    { upTo: 0.8, bonus: 50 },
    { upTo: 1.0, bonus: 25 },
  ],
  // Multiplier applied once the streak (including the current answer) reaches `minStreak`.
  streakMultipliers: [
    { minStreak: 4, multiplier: 1.5 },
    { minStreak: 3, multiplier: 1.2 },
    { minStreak: 2, multiplier: 1.1 },
  ],
};

export const MODES = {
  classic: {
    id: 'classic',
    name: 'Classic',
    icon: '🎵',
    tagline: '10 songs · 10 seconds each',
    description: 'The original. Ten songs, four choices, ten seconds to name each one.',
    questionCount: 10,
    timeLimitSec: 10,
    lives: null,
    speedBonusMultiplier: 1,
  },
  speed: {
    id: 'speed',
    name: 'Speed',
    icon: '⚡',
    tagline: '10 songs · 5 seconds each',
    description: 'Half the time, double the pressure. Fast answers earn a bigger bonus.',
    questionCount: 10,
    timeLimitSec: 5,
    lives: null,
    speedBonusMultiplier: 1.5,
  },
  endless: {
    id: 'endless',
    name: 'Endless',
    icon: '♾️',
    tagline: 'Keep going · 3 lives',
    description: 'No finish line. Keep naming songs until you miss three.',
    questionCount: Infinity,
    timeLimitSec: 10,
    lives: 3,
    speedBonusMultiplier: 1,
  },
};

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    name: 'Easy',
    previewSec: 10,
    // Which song difficulty tags are eligible to be the correct answer.
    songPool: ['Easy', 'Medium'],
    // 0 = distractors chosen at random, 1 = distractors as similar as possible.
    distractorSimilarity: 0,
  },
  medium: {
    id: 'medium',
    name: 'Medium',
    previewSec: 7,
    songPool: ['Easy', 'Medium', 'Hard'],
    distractorSimilarity: 0.5,
  },
  hard: {
    id: 'hard',
    name: 'Hard',
    previewSec: 5,
    songPool: ['Easy', 'Medium', 'Hard'],
    distractorSimilarity: 1,
  },
};

// Categories are just filters over the song list. Add one here and it appears in the UI
// automatically once enough songs match it.
export const CATEGORIES = [
  { id: 'all', name: 'All Songs', icon: '🎵', filter: () => true },
  { id: 'pop', name: 'Pop', icon: '🎤', filter: (s) => s.genre === 'Pop' },
  { id: 'rock', name: 'Rock', icon: '🎸', filter: (s) => s.genre === 'Rock' },
  { id: 'hiphop', name: 'Hip-Hop', icon: '🎧', filter: (s) => s.genre === 'Hip-Hop' },
  { id: 'electronic', name: 'Electronic', icon: '🎛️', filter: (s) => s.genre === 'Electronic' },
  { id: 'kpop', name: 'K-Pop', icon: '💜', filter: (s) => s.genre === 'K-Pop' },
  { id: 'latin', name: 'Latin', icon: '💃', filter: (s) => s.genre === 'Latin' },
  { id: 'country', name: 'Country', icon: '🤠', filter: (s) => s.genre === 'Country' },
  { id: 'international', name: 'International', icon: '🌎', filter: (s) => hasTag(s, 'international') },
  { id: 'indian', name: 'Indian', icon: '🪔', filter: (s) => s.country === 'IN' },
  { id: 'movie', name: 'Movie Songs', icon: '🎬', filter: (s) => hasTag(s, 'movie') },
  { id: '80s', name: '80s', icon: '📼', filter: (s) => s.year >= 1980 && s.year <= 1989 },
  { id: '90s', name: '90s', icon: '💿', filter: (s) => s.year >= 1990 && s.year <= 1999 },
  { id: '2000s', name: '2000s', icon: '🕺', filter: (s) => s.year >= 2000 && s.year <= 2009 },
  { id: '2010s', name: '2010s', icon: '📀', filter: (s) => s.year >= 2010 && s.year <= 2019 },
  { id: '2020s', name: '2020s', icon: '🔥', filter: (s) => s.year >= 2020 },
];

// A category must have at least this many songs to be offered.
export const MIN_SONGS_PER_CATEGORY = 12;
export const ANSWER_OPTION_COUNT = 4;

export const AUDIO = {
  // Where in a 30s store preview to start playing (random within this range, seconds).
  previewStartRange: [3, 12],
  // Give up on loading a preview after this long.
  loadTimeoutMs: 9000,
  // Sources tried in order when a song has no hard-coded previewUrl.
  // 'itunes' = Apple's public Search API (free, legal 30s previews, no key needed).
  onlineProvider: 'itunes',
};

export const DEFAULT_SETTINGS = {
  sound: true, // UI sound effects
  music: false, // ambient menu music
  animations: true,
  theme: 'dark',
  audioSource: 'online', // 'online' (real previews) | 'offline' (placeholder tones)
};

function hasTag(song, tag) {
  return Array.isArray(song.tags) && song.tags.includes(tag);
}
