// Turns loose song lists (pasted text or imported playlists) into iTunes tracks with previews.
import { ItunesError, findTrack, toTrack } from './itunes.js';

const SEPARATORS = [' - ', ' – ', ' — ', '\t', ' by '];

/**
 * Parse one-song-per-line text. Accepts "Title - Artist", "Artist - Title", "Title by Artist",
 * tab-separated exports and numbered lists. Order is ambiguous, so both readings are kept.
 */
export function parseTrackList(text) {
  const items = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/^\s*(\d+[.)]\s*|[-*•]\s+)/, '').trim();
    if (!line) continue;
    const sep = SEPARATORS.find((s) => line.includes(s));
    if (sep) {
      const [a, ...rest] = line.split(sep);
      const b = rest.join(sep);
      items.push({ line, title: a.trim(), artist: b.trim(), swappable: sep !== ' by ' });
    } else {
      items.push({ line, title: line, artist: '', swappable: false });
    }
  }
  return items.slice(0, 300);
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });

async function matchOne(item) {
  const attempts = [{ title: item.title, artist: item.artist }];
  if (item.swappable) attempts.push({ title: item.artist, artist: item.title });
  for (const want of attempts) {
    if (!want.title) continue;
    const r = await findTrack(want, { countries: ['US', 'IN'] });
    if (r) return { ...toTrack(r), store: r.country === 'IND' ? 'IN' : 'US' };
  }
  return null;
}

/**
 * Match items one after another (gentle on Apple's rate limit), pausing and retrying when limited.
 * onProgress({ done, total, matched, unmatched, waiting })
 */
export async function matchTracks(items, { onProgress, signal, concurrency = 2 } = {}) {
  const matched = [];
  const unmatched = [];
  let done = 0;
  let waiting = false;
  const queue = items.map((item, index) => ({ item, index }));
  const report = () => onProgress?.({ done, total: items.length, matched: matched.length, unmatched: unmatched.length, waiting });

  async function worker() {
    while (queue.length) {
      if (signal?.aborted) return;
      const { item, index } = queue.shift();
      let tries = 0;
      while (true) {
        try {
          const track = await matchOne(item);
          if (track) matched.push({ index, track });
          else unmatched.push(item);
          break;
        } catch (err) {
          if (err instanceof ItunesError && err.code === 'RATE_LIMITED' && tries++ < 4) {
            waiting = true;
            report();
            await sleep(20000, signal);
            waiting = false;
            continue;
          }
          if (err.name === 'AbortError') return;
          unmatched.push(item);
          break;
        }
      }
      done += 1;
      report();
    }
  }

  report();
  await Promise.all(Array.from({ length: concurrency }, worker));
  matched.sort((a, b) => a.index - b.index);
  return { tracks: matched.map((m) => m.track), unmatched };
}
