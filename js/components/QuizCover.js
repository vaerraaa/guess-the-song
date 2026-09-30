import { esc, generatedArtwork } from '../utils.js';

/** 2×2 artwork mosaic for a quiz — square, like four sleeves in a crate. */
export function quizCover(quiz) {
  const art = quiz.tracks.slice(0, 4).map((t, i) => t.artwork || generatedArtwork(Number(t.itunesId ?? i) % 100000));
  while (art.length < 4) art.push(generatedArtwork(art.length + 7));
  return `<div class="gts-cover4" aria-hidden="true">${art.map((src) => `<img src="${esc(src)}" alt="" loading="lazy">`).join('')}</div>`;
}
