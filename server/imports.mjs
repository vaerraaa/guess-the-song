// Playlist import: turns a playlist link into a list of { title, artist }.
// The browser then matches each track to an iTunes preview.
//   Deezer   public API, no key needed.
//   Spotify  needs SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET (free developer app) on the server.
// Other services have no public playlist API — the page offers "paste a track list" instead.

export class ImportError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MAX_TRACKS = 300;

export function detectService(link) {
  let url;
  try {
    url = new URL(link);
  } catch {
    throw new ImportError('bad_url', 'That doesn’t look like a link. Copy the playlist’s share link and paste it here.');
  }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'deezer.com' || host.endsWith('.deezer.com') || host === 'deezer.page.link' || host === 'link.deezer.com') {
    return { service: 'deezer', url };
  }
  if (host === 'open.spotify.com') return { service: 'spotify', url };
  if (host === 'music.apple.com') return { service: 'apple', url };
  if (host.endsWith('youtube.com') || host === 'youtu.be') return { service: 'youtube', url };
  return { service: 'unknown', url };
}

async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new ImportError('network', 'Couldn’t reach the music service. Try again in a moment.', 502);
  }
  if (!res.ok) throw new ImportError('upstream', `The music service answered with an error (${res.status}).`, 502);
  return res.json();
}

async function importDeezer(url) {
  let target = url;
  // Short share links redirect to the real playlist URL.
  if (!/\/playlist\/\d+/.test(url.pathname)) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
      target = new URL(res.url);
    } catch {
      throw new ImportError('network', 'Couldn’t open that Deezer link.', 502);
    }
  }
  const id = target.pathname.match(/\/playlist\/(\d+)/)?.[1];
  if (!id) throw new ImportError('bad_url', 'That Deezer link isn’t a playlist. Open the playlist and use Share → Copy link.');

  const meta = await fetchJson(`https://api.deezer.com/playlist/${id}`);
  if (meta.error) throw new ImportError('not_found', 'Deezer couldn’t find that playlist. Make sure it’s public.', 404);
  const tracks = [];
  let next = `https://api.deezer.com/playlist/${id}/tracks?limit=100`;
  while (next && tracks.length < MAX_TRACKS) {
    const page = await fetchJson(next);
    for (const t of page.data ?? []) tracks.push({ title: t.title_short || t.title, artist: t.artist?.name ?? '' });
    next = page.next;
  }
  return { title: meta.title ?? 'Deezer playlist', tracks };
}

let spotifyToken = null;
async function spotifyAccessToken() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) {
    throw new ImportError('not_configured', 'Spotify import isn’t set up on this server yet. Paste the track list instead.', 501);
  }
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 60000) return spotifyToken.value;
  const data = await fetchJson('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  spotifyToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return spotifyToken.value;
}

async function importSpotify(url) {
  const id = url.pathname.match(/\/playlist\/([A-Za-z0-9]+)/)?.[1];
  if (!id) throw new ImportError('bad_url', 'That Spotify link isn’t a playlist.');
  const token = await spotifyAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const meta = await fetchJson(`https://api.spotify.com/v1/playlists/${id}?fields=name`, { headers });
  const tracks = [];
  let next = `https://api.spotify.com/v1/playlists/${id}/tracks?fields=next,items(track(name,artists(name)))&limit=100`;
  while (next && tracks.length < MAX_TRACKS) {
    const page = await fetchJson(next, { headers });
    for (const item of page.items ?? []) {
      if (item.track?.name) tracks.push({ title: item.track.name, artist: item.track.artists?.[0]?.name ?? '' });
    }
    next = page.next;
  }
  return { title: meta.name ?? 'Spotify playlist', tracks };
}

export async function importPlaylist(link) {
  const { service, url } = detectService(String(link).trim());
  let result;
  if (service === 'deezer') result = await importDeezer(url);
  else if (service === 'spotify') result = await importSpotify(url);
  else if (service === 'apple' || service === 'youtube') {
    throw new ImportError('unsupported', `${service === 'apple' ? 'Apple Music' : 'YouTube'} doesn’t offer public playlist access. Copy the song names and use “Paste a list” instead.`, 422);
  } else {
    throw new ImportError('unsupported', 'Only Deezer and Spotify playlist links can be imported. For anything else, use “Paste a list”.', 422);
  }
  result.tracks = result.tracks.filter((t) => t.title).slice(0, MAX_TRACKS);
  if (result.tracks.length === 0) throw new ImportError('empty', 'That playlist has no tracks we can read.', 404);
  return { service, ...result };
}

export function spotifyEnabled() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}
