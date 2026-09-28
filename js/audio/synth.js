// Web Audio helpers: a shared AudioContext, UI sound effects, ambient menu music and the
// offline placeholder "song" generator (a unique, deterministic little tune per song id).
import { seededRandom } from '../utils.js';

let context = null;

export function getAudioContext() {
  if (!context) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    context = new Ctx();
  }
  return context;
}

/** Call from a user gesture so later audio isn't blocked. */
export async function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* stays suspended; callers check ctx.state */
    }
  }
  return ctx;
}

function tone(ctx, destination, { freq, start, duration, type = 'sine', gain = 0.2, attack = 0.01, release = 0.08 }) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  env.gain.setValueAtTime(0, start);
  env.gain.linearRampToValueAtTime(gain, start + attack);
  env.gain.setValueAtTime(gain, Math.max(start + attack, start + duration - release));
  env.gain.linearRampToValueAtTime(0, start + duration);
  osc.connect(env).connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
  return osc;
}

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ── UI sound effects ──────────────────────────────────────────────────
export const sfx = {
  enabled: true,
  play(name) {
    if (!this.enabled) return;
    const ctx = getAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.01;
    const out = ctx.destination;
    switch (name) {
      case 'correct':
        tone(ctx, out, { freq: 660, start: t, duration: 0.12, type: 'triangle', gain: 0.18 });
        tone(ctx, out, { freq: 990, start: t + 0.1, duration: 0.2, type: 'triangle', gain: 0.18 });
        break;
      case 'wrong':
        tone(ctx, out, { freq: 220, start: t, duration: 0.18, type: 'sawtooth', gain: 0.07 });
        tone(ctx, out, { freq: 165, start: t + 0.14, duration: 0.26, type: 'sawtooth', gain: 0.07 });
        break;
      case 'tick':
        tone(ctx, out, { freq: 1200, start: t, duration: 0.05, type: 'square', gain: 0.04, release: 0.03 });
        break;
      case 'click':
        tone(ctx, out, { freq: 500, start: t, duration: 0.04, type: 'sine', gain: 0.08, release: 0.03 });
        break;
      case 'complete':
        [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, { freq: f, start: t + i * 0.09, duration: 0.22, type: 'triangle', gain: 0.14 }));
        break;
    }
  },
};

// ── Ambient menu music (soft chord pad) ───────────────────────────────
export const ambient = (() => {
  let gainNode = null;
  let timer = null;
  const chords = [
    [57, 60, 64, 67],
    [53, 57, 60, 64],
    [48, 52, 55, 60],
    [55, 59, 62, 65],
  ];
  let index = 0;

  function scheduleChord(ctx) {
    const start = ctx.currentTime + 0.05;
    chords[index % chords.length].forEach((m) =>
      tone(ctx, gainNode, { freq: midiToFreq(m), start, duration: 4.2, type: 'sine', gain: 0.05, attack: 1.2, release: 1.6 }),
    );
    index++;
  }

  return {
    get playing() {
      return timer != null;
    },
    start() {
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running' || timer) return;
      gainNode = ctx.createGain();
      gainNode.gain.value = 0.6;
      gainNode.connect(ctx.destination);
      scheduleChord(ctx);
      timer = setInterval(() => scheduleChord(ctx), 4000);
    },
    stop() {
      clearInterval(timer);
      timer = null;
      if (gainNode) {
        const ctx = getAudioContext();
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        const g = gainNode;
        setTimeout(() => g.disconnect(), 500);
        gainNode = null;
      }
    },
  };
})();

// ── Offline placeholder tune ──────────────────────────────────────────
const SCALES = [
  [0, 2, 4, 5, 7, 9, 11], // major
  [0, 2, 3, 5, 7, 8, 10], // minor
  [0, 2, 4, 7, 9], // major pentatonic
  [0, 3, 5, 7, 10], // minor pentatonic
  [0, 2, 3, 5, 7, 9, 10], // dorian
];
const LEAD_WAVES = ['triangle', 'square', 'sawtooth', 'sine'];

/**
 * Plays a generated tune for `songId` for `durationSec`. Returns a handle with stop()/setMuted().
 * Each song id always produces the same tune, so placeholders are distinguishable during testing.
 */
export function playPlaceholderTune(songId, durationSec, { muted = false } = {}) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') {
    const err = new Error('Audio context is not running');
    err.name = 'NotAllowedError';
    throw err;
  }
  const rng = seededRandom(songId * 7919 + 3);
  const scale = SCALES[Math.floor(rng() * SCALES.length)];
  const root = 57 + Math.floor(rng() * 8);
  const bpm = 88 + Math.floor(rng() * 50);
  const beat = 60 / bpm;
  const leadWave = LEAD_WAVES[Math.floor(rng() * LEAD_WAVES.length)];

  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);

  // A 2-bar motif repeated, so the tune feels like a "hook".
  const motif = Array.from({ length: 8 }, () => ({
    degree: Math.floor(rng() * scale.length),
    octave: rng() < 0.2 ? 12 : 0,
    length: rng() < 0.3 ? 2 : 1,
    rest: rng() < 0.12,
  }));
  const bassPattern = Array.from({ length: 4 }, () => scale[Math.floor(rng() * Math.min(scale.length, 5))]);

  const start = ctx.currentTime + 0.05;
  const end = start + durationSec;
  let t = start;
  let step = 0;
  while (t < end) {
    const note = motif[step % motif.length];
    const len = note.length * beat * 0.5;
    if (!note.rest) {
      const midi = root + 12 + scale[note.degree] + note.octave;
      tone(ctx, master, { freq: midiToFreq(midi), start: t, duration: Math.min(len * 0.9, end - t), type: leadWave, gain: leadWave === 'sine' ? 0.18 : 0.08 });
    }
    t += len;
    step++;
  }
  for (let b = 0, bt = start; bt < end; b++, bt += beat * 2) {
    tone(ctx, master, { freq: midiToFreq(root - 12 + bassPattern[b % bassPattern.length]), start: bt, duration: Math.min(beat * 1.8, end - bt), type: 'sine', gain: 0.22 });
  }

  return {
    stop() {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
      setTimeout(() => master.disconnect(), 150);
    },
    setMuted(value) {
      master.gain.setValueAtTime(value ? 0 : 0.9, ctx.currentTime);
    },
  };
}
