import { SCORING } from '../config.js';

/** Bonus for answering quickly. `elapsedMs` is time from preview start to answer. */
export function speedBonus(elapsedMs, timeLimitSec, config = SCORING) {
  const fraction = elapsedMs / (timeLimitSec * 1000);
  const tier = config.speedTiers.find((t) => fraction <= t.upTo);
  return tier ? tier.bonus : 0;
}

/** Multiplier for a streak count that already includes the current answer. */
export function streakMultiplier(streak, config = SCORING) {
  const rule = config.streakMultipliers.find((r) => streak >= r.minStreak);
  return rule ? rule.multiplier : 1;
}

/**
 * Score a single answer. Returns a full breakdown so the UI can show exactly how
 * points were earned:  points = round((base + bonus × modeBonusMultiplier) × streakMultiplier)
 */
export function scoreAnswer({ correct, elapsedMs, timeLimitSec, streak, modeBonusMultiplier = 1 }, config = SCORING) {
  if (!correct) {
    return { base: 0, bonus: 0, multiplier: 1, points: 0 };
  }
  const base = config.basePoints;
  const bonus = Math.round(speedBonus(elapsedMs, timeLimitSec, config) * modeBonusMultiplier);
  const multiplier = streakMultiplier(streak, config);
  return { base, bonus, multiplier, points: Math.round((base + bonus) * multiplier) };
}

export const PERFORMANCE_MESSAGES = [
  { minAccuracy: 90, title: 'Music mastermind.', emoji: '🏆' },
  { minAccuracy: 70, title: 'You know your music.', emoji: '🎧' },
  { minAccuracy: 50, title: 'Not bad. Your playlist needs some revision.', emoji: '📻' },
  { minAccuracy: 0, title: 'The aux cord may need to be taken away.', emoji: '🔌' },
];

export function performanceMessage(accuracyPercent) {
  return PERFORMANCE_MESSAGES.find((m) => accuracyPercent >= m.minAccuracy);
}
