// Liner Notes building blocks. String helpers return escaped HTML; the few stateful pieces
// (Disc, TrackRow) return { element, ...methods }.
import { esc, html } from '../utils.js';

export const pad2 = (n) => String(n).padStart(2, '0');

// ── Marks & labels ────────────────────────────────────────────────────
const TICK = '<svg class="ln-tick" width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M1.5 7.5 L6.5 12 L16.5 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function mark(kind, label, { animate = false } = {}) {
  const text = label ?? (kind === 'correct' ? 'Correct' : 'Wrong');
  const tick = kind === 'correct' ? (animate ? TICK.replace('ln-tick"', 'ln-tick ln-tick--draw"') : TICK) : '';
  const x = kind === 'wrong' ? '<span class="ln-mark__x" aria-hidden="true">✗</span>' : '';
  return `<span class="ln-mark ln-mark--${kind}">${tick}<span>${esc(text)}</span>${x}</span>`;
}

export function catalog(code, label) {
  return `<span class="ln-catalog"><span class="ln-catalog__code">${esc(code)}</span>${label ? `<span>${esc(label)}</span>` : ''}</span>`;
}

export function live(text) {
  return `<span class="ln-live">${esc(text)}</span>`;
}

export function creditLine({ title, artist, album, year, size = 'md' }) {
  const meta = [album, year].filter(Boolean).join(' · ');
  return `
    <div class="ln-credit ln-credit--${size}">
      <span class="ln-credit__title">${esc(title)}</span>
      <span class="ln-credit__artist">${esc(artist)}</span>
      ${meta ? `<span class="ln-credit__meta">${esc(meta)}</span>` : ''}
    </div>`;
}

export function statLine(items) {
  return `<div class="ln-stats">${items.map((it) => `<span><b>${esc(typeof it.value === 'number' ? it.value.toLocaleString('en-US') : it.value)}</b>${esc(it.label)}</span>`).join('')}</div>`;
}

export function avatar(name, { size = '', away = false } = {}) {
  return `<span class="ln-avatar ${size ? `ln-avatar--${size}` : ''} ${away ? 'ln-avatar--away' : ''}" aria-hidden="true">${esc(String(name).slice(0, 1))}</span>`;
}

// ── Stage pieces (brand moments only) ─────────────────────────────────
export function wordmark({ align = 'center', tag = 'h1', size } = {}) {
  const fontSize = size ? `;font-size:min(${size}px, ${(size / 8.4).toFixed(2)}vw)` : '';
  const alignItems = align === 'center' ? 'center' : 'flex-start';
  return `<${tag} class="ln-wordmark ln-poster" style="align-items:${alignItems};text-align:${align}${fontSize}"><span class="ln-wordmark__a">Guess</span><span class="ln-wordmark__b">the Song</span></${tag}>`;
}

export function waveform({ bars = 48, height = 30, playing = true, seed = 7 } = {}) {
  const list = Array.from({ length: bars }, (_, i) => Math.max(0.12, Math.abs(Math.sin((i + 1) * seed * 0.37) * 0.7 + Math.sin(i * 0.9) * 0.3)));
  return `<span class="ln-wave ${playing ? 'is-playing' : ''}" style="height:${height}px" aria-hidden="true">${list
    .map((v, i) => {
      const t = i / (bars - 1);
      return `<span class="ln-wave__bar" style="height:${Math.round(v * height)}px;background:color-mix(in oklch, var(--color-brand) ${Math.round((1 - t) * 100)}%, var(--color-brand-2));animation-delay:${-((i * 97) % 900)}ms"></span>`;
    })
    .join('')}</span>`;
}

const TINTS = {
  plum: ['--tile-plum', '#B04FB0'],
  moss: ['--tile-moss', '#4FA04A'],
  navy: ['--tile-navy', '#5C3FA8'],
  rust: ['--tile-rust', '#C9654D'],
  teal: ['--tile-teal', '#7A3E9C'],
  wine: ['--tile-navy', '#8E3448'],
};
const BARS = [55, 85, 40, 70, 30, 60];

/** A decorative album-cover tile: position is a CSS string like "left:5%;top:40px". */
export function coverTile({ motif = 'disc', tint = 'plum', size = 170, rotate = -8, position = '', delay = 0 }) {
  const [bg, ink] = TINTS[tint] ?? TINTS.plum;
  const inner =
    motif === 'disc' ? '<span class="ln-tile__disc"></span>'
    : motif === 'square' ? `<span class="ln-tile__sq" style="--sq-rot:${rotate * -2}deg"></span>`
    : `<span class="ln-tile__bars">${BARS.slice(0, 5).map((h) => `<span style="height:${h}%"></span>`).join('')}</span>`;
  return `<div class="ln-tile" aria-hidden="true" style="--tile-size:${size}px;--tile-rot:${rotate}deg;--tile-bg:var(${bg});--tile-ink:${ink};--tile-delay:${-delay}s;${position}">${inner}</div>`;
}

export function equalizer({ bars = 5, playing = false } = {}) {
  return `<span class="ln-eq ${playing ? 'is-playing' : ''}" aria-hidden="true">${'<span class="ln-eq__bar"></span>'.repeat(bars)}</span>`;
}

// ── Disc (countdown record) ───────────────────────────────────────────
export function Disc({ liveAt = 3, print = 'GTS · 33⅓' } = {}) {
  const element = html(`
    <div class="ln-disc" role="timer">
      <div class="ln-disc__vinyl"><div class="ln-disc__label"><span class="ln-disc__print">${esc(print)}</span></div></div>
      <span class="ln-disc__digits" aria-hidden="true"></span>
    </div>`);
  const vinyl = element.querySelector('.ln-disc__vinyl');
  const digits = element.querySelector('.ln-disc__digits');
  return {
    element,
    setSeconds(seconds) {
      digits.textContent = seconds == null ? '' : pad2(seconds);
      element.classList.toggle('ln-disc--live', seconds != null && seconds <= liveAt && seconds > 0);
      element.setAttribute('aria-label', seconds == null ? 'Song timer' : `${seconds} seconds left`);
    },
    setSpinning(on) {
      vinyl.classList.toggle('is-spinning', on);
    },
    showArt(src, alt) {
      element.classList.add('ln-disc--art');
      element.innerHTML = `<img class="ln-disc__art" src="${esc(src)}" alt="${esc(alt)}">`;
    },
  };
}

// ── Track row (an answer, as a numbered track) ────────────────────────
const ROW_MARKS = {
  correct: ['correct', 'Correct'],
  wrong: ['wrong', 'Your answer'],
  missed: ['correct', 'Correct answer'],
};

export function TrackRow({ number, title, artist, onSelect, flush = false }) {
  const element = html(`
    <button type="button" class="ln-track ${flush ? 'ln-track--flush' : ''}" aria-keyshortcuts="${number}"
      aria-label="Track ${number}: ${esc(title)} by ${esc(artist)}">
      <span class="ln-track__num">${pad2(number)}</span>
      <span class="ln-track__text">
        <span class="ln-track__title">${esc(title)}</span>
        <span class="ln-track__artist">${esc(artist)}</span>
      </span>
      <span class="ln-track__side"></span>
    </button>`);
  element.addEventListener('click', () => onSelect?.(number - 1));
  const side = element.querySelector('.ln-track__side');

  return {
    element,
    side,
    setDisabled(disabled) {
      element.disabled = disabled;
    },
    /** state: 'idle' | 'picked' | 'correct' | 'wrong' | 'missed' | 'dimmed' */
    setState(state, { label, animate = false } = {}) {
      element.className = `ln-track ${flush ? 'ln-track--flush' : ''} ${state && state !== 'idle' ? `ln-track--${state}` : ''}`;
      const m = ROW_MARKS[state];
      side.innerHTML = m ? mark(m[0], label ?? m[1], { animate }) : '';
      if (m) element.setAttribute('aria-label', `${label ?? m[1]}: ${title} by ${artist}`);
    },
  };
}
