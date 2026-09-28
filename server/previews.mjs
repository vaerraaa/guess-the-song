// Server-side preview resolution for multiplayer rooms, with a shared cache.
import { ITUNES_IDS } from '../js/data/itunesIds.js';
import { findTrack, lookupTracks } from '../js/core/itunes.js';

const TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map(); // itunesId → { previewUrl, artwork, at }

export function itunesRef(song) {
  if (song.itunesId) return { id: Number(song.itunesId), store: song.store ?? 'US' };
  const pinned = ITUNES_IDS[song.id];
  return pinned ? { id: pinned[0], store: pinned[1] } : null;
}

/** Make sure previews for these songs are cached (one lookup per store per 150 songs). */
export async function warmPreviews(songs) {
  const byStore = new Map();
  for (const song of songs) {
    const ref = itunesRef(song);
    if (!ref) continue;
    const hit = cache.get(ref.id);
    if (hit && Date.now() - hit.at < TTL_MS) continue;
    if (!byStore.has(ref.store)) byStore.set(ref.store, []);
    byStore.get(ref.store).push(ref.id);
  }
  for (const [store, ids] of byStore) {
    try {
      const found = await lookupTracks(ids, { country: store });
      for (const [id, r] of found) {
        cache.set(id, { previewUrl: r.previewUrl, artwork: r.artworkUrl100?.replace('100x100bb', '600x600bb') ?? '', at: Date.now() });
      }
    } catch (err) {
      console.warn('Preview lookup failed:', err.message);
    }
  }
}

/** { previewUrl, artwork } for a song, or null when no preview is available. */
export async function previewFor(song) {
  if (song.previewUrl) return { previewUrl: song.previewUrl, artwork: song.artwork ?? '' };
  const ref = itunesRef(song);
  if (!ref) return searchPreview(song);
  if (!cache.has(ref.id)) await warmPreviews([song]);
  const hit = cache.get(ref.id);
  return hit ? { previewUrl: hit.previewUrl, artwork: song.artwork || hit.artwork } : null;
}

// Songs not yet pinned by `npm run resolve-songs` fall back to a title/artist search.
const searched = new Map(); // song id → { previewUrl, artwork, at } | null
async function searchPreview(song) {
  const hit = searched.get(song.id);
  if (hit !== undefined && (hit === null || Date.now() - hit.at < TTL_MS)) return hit;
  try {
    const countries = song.country === 'IN' ? ['IN', 'US'] : ['US'];
    const r = await findTrack(song, { countries });
    const value = r ? { previewUrl: r.previewUrl, artwork: song.artwork || r.artworkUrl100?.replace('100x100bb', '600x600bb') || '', at: Date.now() } : null;
    searched.set(song.id, value);
    return value;
  } catch {
    return null; // network trouble: try again next time
  }
}
