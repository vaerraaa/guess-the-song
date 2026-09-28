// iTunes Search API helpers shared by the browser and the Node server (uses global fetch).
// Apple's public API: free, no key, returns legal 30-second previews and artwork.

const SEARCH_URL = 'https://itunes.apple.com/search';
const LOOKUP_URL = 'https://itunes.apple.com/lookup';

export class ItunesError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'NETWORK' | 'RATE_LIMITED' | 'NOT_FOUND'
  }
}

export function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\s-\s.*$/, '') // "Song - Remastered 2011"
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function primaryArtist(artist = '') {
  return String(artist).split(/\s+(?:ft\.?|feat\.?|featuring|&|x|with)\s+|,/i)[0].trim();
}

const UNWANTED_VERSION = /\b(remix|live|karaoke|instrumental|cover|sped up|slowed|acoustic|unplugged|reprise|mashup|female version|tribute|made famous|8d|lofi|lo fi)\b/;

/** How well an iTunes result matches a wanted title/artist. >= 8 is a confident match. */
export function matchScore(want, result) {
  if (!result?.previewUrl || result.kind !== 'song') return -Infinity;
  const wantTitle = normalizeText(want.title);
  const gotTitle = normalizeText(result.trackName);
  const wantArtist = normalizeText(primaryArtist(want.artist));
  const gotArtist = normalizeText(result.artistName);
  let score = 0;
  if (gotTitle === wantTitle) score += 6;
  else if (gotTitle.startsWith(wantTitle) || wantTitle.startsWith(gotTitle)) score += 3;
  if (wantArtist && (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist))) score += 5;
  const versionText = `${result.trackName ?? ''} ${result.collectionName ?? ''}`.toLowerCase();
  if (UNWANTED_VERSION.test(versionText) && !UNWANTED_VERSION.test(String(want.title).toLowerCase())) score -= 6;
  return score;
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ItunesError('NETWORK', `iTunes request failed: ${err.message}`);
  }
  if (res.status === 403 || res.status === 429) throw new ItunesError('RATE_LIMITED', 'Too many requests to iTunes. Wait a moment.');
  if (!res.ok) throw new ItunesError('NETWORK', `iTunes responded ${res.status}`);
  return res.json();
}

/** Convert an iTunes track result into the app's track shape. */
export function toTrack(result) {
  return {
    itunesId: result.trackId,
    title: result.trackName,
    artist: result.artistName,
    album: result.collectionName ?? '',
    artwork: result.artworkUrl100?.replace('100x100bb', '600x600bb') ?? '',
    previewUrl: result.previewUrl ?? '',
    genre: result.primaryGenreName ?? '',
    year: result.releaseDate ? new Date(result.releaseDate).getFullYear() : undefined,
  };
}

export async function searchSongs(term, { limit = 15, country = 'US' } = {}) {
  const params = new URLSearchParams({ term, media: 'music', entity: 'song', limit: String(limit), country });
  const data = await getJson(`${SEARCH_URL}?${params}`);
  return (data.results ?? []).filter((r) => r.kind === 'song' && r.previewUrl);
}

/** Best confident match for a title/artist pair, or null. */
export async function findTrack({ title, artist }, { countries = ['US'] } = {}) {
  const term = `${title} ${primaryArtist(artist)}`.trim();
  for (const country of countries) {
    const results = await searchSongs(term, { limit: 15, country });
    let best = null;
    for (const r of results) {
      const score = matchScore({ title, artist }, r);
      if (score >= 8 && (!best || score > best.score)) best = { score, r };
    }
    if (best) return best.r;
  }
  return null;
}

/** Look up many tracks by iTunes id in as few requests as possible. Returns Map<id, result>. */
export async function lookupTracks(ids, { country = 'US' } = {}) {
  const unique = [...new Set(ids.filter(Boolean).map(Number))];
  const found = new Map();
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150);
    const data = await getJson(`${LOOKUP_URL}?${new URLSearchParams({ id: chunk.join(','), country })}`);
    for (const r of data.results ?? []) {
      if (r.kind === 'song' && r.previewUrl) found.set(r.trackId, r);
    }
  }
  return found;
}
