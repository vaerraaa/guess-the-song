import { prefersReducedMotion } from '../utils.js';

const GLYPHS = ['♪', '♫', '♩', '★'];

/** A small burst of music notes from an element. Skipped when animations are off. */
export function celebrate(anchor, count = 10) {
  if (prefersReducedMotion() || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'celebrate-layer';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const note = document.createElement('span');
    note.className = 'celebrate-note';
    note.textContent = GLYPHS[i % GLYPHS.length];
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = 50 + Math.random() * 50;
    note.style.left = `${rect.left + rect.width / 2}px`;
    note.style.top = `${rect.top + rect.height / 2}px`;
    note.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    note.style.setProperty('--dy', `${Math.sin(angle) * distance - 30}px`);
    note.style.setProperty('--rot', `${Math.random() * 60 - 30}deg`);
    layer.append(note);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1000);
}
