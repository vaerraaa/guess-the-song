export function shuffle(items, rng = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function randomBetween(min, max, rng = Math.random) {
  return min + rng() * (max - min);
}

/** Deterministic PRNG (mulberry32) — used for reproducible tests and generated audio/art. */
export function seededRandom(seed) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function formatSeconds(ms) {
  return (ms / 1000).toFixed(1);
}

/** Build a DOM fragment from an HTML string. Interpolated data must be passed through esc(). */
export function html(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.childElementCount === 1
    ? template.content.firstElementChild
    : template.content;
}

export function prefersReducedMotion() {
  return (
    document.documentElement.dataset.animations === 'off' ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/** Animate a number inside an element from its current value to `to`. */
export function animateNumber(element, to, durationMs = 600) {
  const from = Number(element.dataset.value ?? 0);
  element.dataset.value = String(to);
  if (prefersReducedMotion() || from === to) {
    element.textContent = formatNumber(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = clamp((now - start) / durationMs, 0, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    element.textContent = formatNumber(from + (to - from) * eased);
    if (t < 1 && element.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Deterministic album-art-style cover as an SVG data URI (no text, so it never reveals answers). */
export function generatedArtwork(seed) {
  const rng = seededRandom(seed * 9973 + 17);
  const hue = Math.floor(rng() * 360);
  const hue2 = (hue + 40 + Math.floor(rng() * 80)) % 360;
  const shape = Math.floor(rng() * 3);
  const cx = 30 + Math.floor(rng() * 40);
  const cy = 30 + Math.floor(rng() * 40);
  const shapes = [
    `<circle cx="${cx}" cy="${cy}" r="28" fill="hsl(${hue2} 80% 65% / .85)"/><circle cx="${cx}" cy="${cy}" r="6" fill="hsl(${hue} 40% 12%)"/>`,
    `<rect x="${cx - 24}" y="${cy - 24}" width="48" height="48" rx="6" transform="rotate(${Math.floor(rng() * 45)} ${cx} ${cy})" fill="hsl(${hue2} 80% 62% / .8)"/>`,
    Array.from({ length: 5 }, (_, i) => `<rect x="${14 + i * 16}" y="${80 - (15 + rng() * 55)}" width="9" height="${15 + rng() * 55}" rx="4" fill="hsl(${hue2} 80% ${60 + i * 4}% / .85)"/>`).join(''),
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 55% 28%)"/><stop offset="1" stop-color="hsl(${(hue + 300) % 360} 45% 12%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${shapes[shape]}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
