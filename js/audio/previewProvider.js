/*
  Resolves a playable preview for a song. Order:
    1. song.previewUrl (your own licensed files / URLs)
    2. the song's iTunes track (custom-quiz tracks carry itunesId; built-in songs are pinned in
       js/data/itunesIds.js) — looked up in batches, so a whole game costs one request
    3. an iTunes search by title + artist (songs added but not yet pinned)
    4. an offline placeholder tune, when offline mode is chosen
*/
import { ITUNES_IDS } from '../data/itunesIds.js';
import { ItunesError, findTrack, lookupTracks } from '../core/itunes.js';
import { loadPreviewCache, savePreviewCache } from '../storage/storage.js';

export class PreviewError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'NOT_FOUND' | 'NETWORK' | 'LOAD_FAILED' | 'AUTOPLAY_BLOCKED' | 'CANCELLED'
  }
}

const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const cache = loadPreviewCache(); // key → { url, artwork, at }
const inflight = new Map();

function itunesRef(song) {
  if (song.itunesId) return { id: Number(song.itunesId), store: song.store ?? 'US' };
  const pinned = ITUNES_IDS[song.id];
  return pinned ? { id: pinned[0], store: pinned[1] } : null;
}

function cacheKey(song) {
  const ref = itunesRef(song);
  return ref ? `it:${ref.id}` : `q:${song.title}|${song.artist}`;
}

function fresh(entry) {
  return entry && Date.now() - (entry.at ?? 0) < CACHE_TTL_MS;
}

function remember(key, url, artwork) {
  cache[key] = { url, artwork: artwork?.replace('100x100bb', '600x600bb') ?? '', at: Date.now() };
}

function toPreviewError(err) {
  if (err instanceof PreviewError) return err;
  if (err instanceof ItunesError && err.code !== 'NOT_FOUND') return new PreviewError('NETWORK', err.message);
  return new PreviewError('NOT_FOUND', 'No preview available for this song.');
}

/** Fetch previews for many songs at once (call at game start). Failures are ignored. */
export async function warmPreviews(songs, { source = 'online' } = {}) {
  if (source === 'offline') return;
  const byStore = new Map();
  for (const song of songs) {
    const ref = itunesRef(song);
    if (!ref || song.previewUrl || fresh(cache[`it:${ref.id}`])) continue;
    if (!byStore.has(ref.store)) byStore.set(ref.store, []);
    byStore.get(ref.store).push(ref.id);
  }
  try {
    for (const [store, ids] of byStore) {
      const found = await lookupTracks(ids, { country: store });
      for (const [id, r] of found) remember(`it:${id}`, r.previewUrl, r.artworkUrl100);
    }
    savePreviewCache(cache);
  } catch {
    /* individual songs retry on demand */
  }
}

async function lookupOne(song) {
  const ref = itunesRef(song);
  if (ref) {
    const found = await lookupTracks([ref.id], { country: ref.store });
    const r = found.get(ref.id);
    if (r) return { url: r.previewUrl, artwork: r.artworkUrl100 };
  }
  const countries = song.country === 'IN' || song.store === 'IN' ? ['IN', 'US'] : ['US'];
  const match = await findTrack(song, { countries });
  if (!match) throw new PreviewError('NOT_FOUND', 'No preview available for this song.');
  return { url: match.previewUrl, artwork: match.artworkUrl100 };
}

/** @returns {Promise<{kind:'url', url:string, artwork?:string} | {kind:'synth', seed:number}>} */
export function resolvePreview(song, { source = 'online' } = {}) {
  if (song.previewUrl) return Promise.resolve({ kind: 'url', url: song.previewUrl, artwork: song.artwork });
  if (source === 'offline') return Promise.resolve({ kind: 'synth', seed: synthSeed(song) });

  const key = cacheKey(song);
  if (fresh(cache[key])) return Promise.resolve({ kind: 'url', ...cache[key] });
  if (inflight.has(key)) return inflight.get(key);

  const promise = lookupOne(song)
    .then(({ url, artwork }) => {
      remember(key, url, artwork);
      savePreviewCache(cache);
      return { kind: 'url', ...cache[key] };
    })
    .catch((err) => {
      throw toPreviewError(err);
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

function synthSeed(song) {
  if (typeof song.id === 'number') return song.id;
  return [...String(song.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
}

/** Artwork to show after a song is revealed: explicit > looked-up > none. */
export function knownArtwork(song) {
  return song.artwork || cache[cacheKey(song)]?.artwork || '';
}

export function forgetPreview(song) {
  delete cache[cacheKey(song)];
  savePreviewCache(cache);
}
