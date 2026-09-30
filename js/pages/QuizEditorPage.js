import { api, serverFeatures } from '../api.js';
import { app } from '../app.js';
import { resolvePreview } from '../audio/previewProvider.js';
import { QUIZ_LIMITS, sanitizeQuiz } from '../core/customQuiz.js';
import { searchSongs, toTrack } from '../core/itunes.js';
import { matchTracks, parseTrackList } from '../core/trackMatching.js';
import { confirmDialog } from '../components/Modal.js';
import { mark } from '../components/ln.js';
import { toast } from '../components/Toast.js';
import { TopBar } from '../components/TopBar.js';
import { navigate } from '../router.js';
import { getLocalQuiz, saveLocalQuiz } from '../storage/storage.js';
import { esc, generatedArtwork, html } from '../utils.js';

const TABS = [
  { id: 'search', label: 'Search songs' },
  { id: 'link', label: 'Playlist link' },
  { id: 'paste', label: 'Paste a list' },
];

export function mount(root) {
  const existing = app.editingQuizLocalId ? getLocalQuiz(app.editingQuizLocalId) : null;
  const draft = {
    localId: existing?.localId,
    title: existing?.title ?? '',
    tracks: existing ? [...existing.tracks] : [],
    remoteId: existing?.remoteId,
    editToken: existing?.editToken,
    sharedFrom: existing?.sharedFrom,
  };
  let dirty = false;
  let saved = false;
  let activeTab = 'search';
  let matchAbort = null;
  const previewPlayer = new Audio();
  let playingId = null;

  root.append(TopBar());
  const main = html(`
    <main class="gts-page">
      <header class="gts-head">
        <span class="ln-label-caps ln-muted"><a href="#/quizzes">GTS-Q · Your quizzes</a></span>
        <h1 class="ln-headline-lg">${existing ? 'Edit the pressing.' : 'Press a new quiz.'}</h1>
      </header>
      <div class="gts-split" style="padding-top:0">
        <section class="gts-stack" aria-labelledby="add-title">
          <h2 id="add-title" class="ln-section-label">Add songs</h2>
          <div class="gts-tabs tabs" role="tablist" aria-label="Ways to add songs">
            ${TABS.map((t) => `<button type="button" role="tab" class="ln-chip" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel-${t.id}" aria-selected="${t.id === activeTab}" tabindex="${t.id === activeTab ? 0 : -1}">${t.label}</button>`).join('')}
          </div>

          <div class="tab-panel gts-stack-sm" role="tabpanel" id="panel-search" aria-labelledby="tab-search">
            <div class="ln-field">
              <label class="ln-field__label" for="song-search">Search a song or artist</label>
              <input id="song-search" class="ln-input" type="search" placeholder="Kesariya, Dua Lipa, Mr. Brightside…" autocomplete="off">
            </div>
            <div class="result-list" aria-live="polite"></div>
          </div>

          <div class="tab-panel gts-stack-sm" role="tabpanel" id="panel-link" aria-labelledby="tab-link" hidden>
            <p class="ln-body-sm ln-muted">Paste a public <strong>Deezer</strong> or <strong>Spotify</strong> playlist link. Each song is matched to its Apple Music preview.</p>
            <form class="ln-inline-form" data-form="link">
              <div class="ln-field">
                <label class="ln-field__label" for="playlist-url">Playlist link</label>
                <input id="playlist-url" class="ln-input" type="url" placeholder="https://www.deezer.com/playlist/…" required>
              </div>
              <button type="submit" class="ln-btn ln-btn--primary">Import</button>
            </form>
            <p class="ln-body-sm ln-muted link-note"></p>
          </div>

          <div class="tab-panel gts-stack-sm" role="tabpanel" id="panel-paste" aria-labelledby="tab-paste" hidden>
            <p class="ln-body-sm ln-muted">One song per line, like <span class="ln-data-sm">Blinding Lights - The Weeknd</span>. Lists copied from Apple Music, YouTube Music or any export tool work.</p>
            <label class="ln-field__label" for="paste-box">Song list</label>
            <textarea id="paste-box" class="ln-input" rows="8" placeholder="Kesariya - Arijit Singh&#10;Levitating - Dua Lipa&#10;Mr. Brightside - The Killers"></textarea>
            <div><button type="button" class="ln-btn ln-btn--primary" data-find>Find songs</button></div>
          </div>

          <div class="match-status ln-sleeve gts-stack-sm" hidden aria-live="polite"></div>
        </section>

        <section class="gts-stack" aria-labelledby="quiz-title-label">
          <div class="ln-field">
            <label id="quiz-title-label" class="ln-field__label" for="quiz-title">Quiz name</label>
            <input id="quiz-title" class="ln-input ln-title-md" maxlength="${QUIZ_LIMITS.titleMax}" placeholder="Road trip 2024" value="${esc(draft.title)}">
          </div>
          <p class="track-count ln-label-caps"></p>
          <div class="track-list gts-scroll ln-list"></div>
          <div class="ln-btn-row">
            <button type="button" class="ln-btn ln-btn--primary" data-save>Save quiz</button>
            <button type="button" class="ln-btn ln-btn--secondary" data-cancel>Cancel</button>
          </div>
        </section>
      </div>
    </main>`);
  root.append(main);

  const $ = (sel) => main.querySelector(sel);
  const trackList = $('.track-list');
  const resultList = $('.result-list');
  const status = $('.match-status');

  // ── Track list ────────────────────────────────────────────────────
  function renderTracks() {
    const n = draft.tracks.length;
    $('.track-count').innerHTML = `${n} track${n === 1 ? '' : 's'}${n < QUIZ_LIMITS.minTracks ? ` <span class="ln-muted">· add at least ${QUIZ_LIMITS.minTracks - n} more</span>` : ''}`;
    $('[data-save]').disabled = n < QUIZ_LIMITS.minTracks;
    if (n === 0) {
      trackList.innerHTML = '<p class="ln-body-md ln-italic ln-muted" style="padding:24px 0">Songs you add are listed here, in order.</p>';
      return;
    }
    trackList.innerHTML = draft.tracks
      .map((t) => `
        <div class="gts-song-row">
          <img src="${esc(t.artwork || generatedArtwork(t.itunesId % 100000))}" alt="" loading="lazy">
          <span class="ln-credit ln-credit--sm"><span class="ln-credit__title">${esc(t.title)}</span><span class="ln-credit__artist">${esc(t.artist)}</span></span>
          <span class="gts-song-row__actions">
            <button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-preview="${t.itunesId}" aria-label="${playingId === t.itunesId ? 'Stop' : 'Play'} preview of ${esc(t.title)}">${playingId === t.itunesId ? 'Stop' : 'Play'}</button>
            <button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-remove="${t.itunesId}" aria-label="Remove ${esc(t.title)}">Remove</button>
          </span>
        </div>`)
      .join('');
  }

  function addTracks(tracks) {
    const have = new Set(draft.tracks.map((t) => t.itunesId));
    let added = 0;
    for (const t of tracks) {
      if (have.has(t.itunesId) || draft.tracks.length >= QUIZ_LIMITS.maxTracks) continue;
      have.add(t.itunesId);
      draft.tracks.push({ itunesId: t.itunesId, title: t.title, artist: t.artist, album: t.album, artwork: t.artwork, genre: t.genre, year: t.year, store: t.store ?? 'US' });
      added++;
    }
    if (added) dirty = true;
    renderTracks();
    renderResults(lastResults);
    return added;
  }

  trackList.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    const preview = e.target.closest('[data-preview]');
    if (remove) {
      draft.tracks = draft.tracks.filter((t) => t.itunesId !== Number(remove.dataset.remove));
      dirty = true;
      renderTracks();
      renderResults(lastResults);
    } else if (preview) {
      const track = draft.tracks.find((t) => t.itunesId === Number(preview.dataset.preview));
      togglePreview(track);
    }
  });

  async function togglePreview(track) {
    if (playingId === track.itunesId) {
      previewPlayer.pause();
      playingId = null;
      renderTracks();
      renderResults(lastResults);
      return;
    }
    try {
      const url = track.previewUrl || (await resolvePreview({ id: `it${track.itunesId}`, itunesId: track.itunesId, store: track.store, title: track.title, artist: track.artist })).url;
      previewPlayer.src = url;
      previewPlayer.currentTime = 0;
      await previewPlayer.play();
      playingId = track.itunesId;
    } catch {
      toast('Couldn’t play that preview.');
      playingId = null;
    }
    renderTracks();
    renderResults(lastResults);
  }
  previewPlayer.addEventListener('ended', () => {
    playingId = null;
    renderTracks();
    renderResults(lastResults);
  });

  // ── Search ────────────────────────────────────────────────────────
  let lastResults = [];
  let searchTimer = null;
  let searchSeq = 0;

  function renderResults(results) {
    lastResults = results;
    if (activeTab !== 'search') return;
    const have = new Set(draft.tracks.map((t) => t.itunesId));
    resultList.innerHTML = results
      .map((t) => `
        <div class="gts-song-row">
          <img src="${esc(t.artwork)}" alt="" loading="lazy">
          <span class="ln-credit ln-credit--sm"><span class="ln-credit__title">${esc(t.title)}</span><span class="ln-credit__artist">${esc(t.artist)}</span>${t.year ? `<span class="ln-credit__meta">${esc(t.album)} · ${t.year}</span>` : ''}</span>
          <span class="gts-song-row__actions">
            <button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-result-preview="${t.itunesId}" aria-label="${playingId === t.itunesId ? 'Stop' : 'Play'} preview of ${esc(t.title)}">${playingId === t.itunesId ? 'Stop' : 'Play'}</button>
            ${have.has(t.itunesId)
              ? `<span class="ln-mark ln-mark--correct">Added</span>`
              : `<button type="button" class="ln-btn ln-btn--secondary ln-btn--small" data-add="${t.itunesId}">Add</button>`}
          </span>
        </div>`)
      .join('');
  }

  $('#song-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const term = e.target.value.trim();
    if (term.length < 2) {
      renderResults([]);
      return;
    }
    searchTimer = setTimeout(async () => {
      const seq = ++searchSeq;
      resultList.innerHTML = '<p class="ln-label-caps ln-muted">Searching…</p>';
      try {
        const results = (await searchSongs(term, { limit: 12 })).map(toTrack);
        if (seq === searchSeq) renderResults(results);
      } catch (err) {
        if (seq === searchSeq) resultList.innerHTML = `<p class="ln-error-text">${err.code === 'RATE_LIMITED' ? 'Too many searches. Wait a few seconds and try again.' : 'Search isn’t available right now. Check your connection.'}</p>`;
      }
    }, 350);
  });

  resultList.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    const preview = e.target.closest('[data-result-preview]');
    if (add) addTracks(lastResults.filter((t) => t.itunesId === Number(add.dataset.add)));
    if (preview) togglePreview(lastResults.find((t) => t.itunesId === Number(preview.dataset.resultPreview)));
  });

  // ── Bulk matching (playlist link / pasted list) ───────────────────
  async function runMatching(items, sourceLabel) {
    matchAbort?.abort();
    matchAbort = new AbortController();
    status.hidden = false;
    status.innerHTML = `
      <p class="ln-body-md"><strong>Finding ${items.length} songs from ${esc(sourceLabel)}…</strong></p>
      <p class="ln-data-sm ln-muted" data-progress-text></p>
      <div class="gts-progress"><div class="progress-fill"></div></div>
      <div><button type="button" class="ln-btn ln-btn--secondary ln-btn--small" data-stop>Stop</button></div>`;
    status.querySelector('[data-stop]').addEventListener('click', () => matchAbort.abort());
    const { tracks, unmatched } = await matchTracks(items, {
      signal: matchAbort.signal,
      onProgress: ({ done, total, matched, waiting }) => {
        status.querySelector('.progress-fill').style.width = `${(done / total) * 100}%`;
        status.querySelector('[data-progress-text]').textContent = waiting
          ? 'Apple asked us to slow down. Resuming shortly…'
          : `${done} / ${total} checked · ${matched} found`;
      },
    });
    const added = addTracks(tracks);
    const stopped = matchAbort.signal.aborted;
    status.innerHTML = `
      <p class="ln-body-md">${mark('correct', `${stopped ? 'Stopped · ' : ''}Added ${added} song${added === 1 ? '' : 's'}`)}
        ${tracks.length > added ? `<span class="ln-muted"> ${tracks.length - added} were already in the quiz.</span>` : ''}</p>
      ${unmatched.length ? `
        <details ${unmatched.length <= 8 ? 'open' : ''}>
          <summary class="ln-label-caps" style="cursor:pointer">${mark('wrong', `${unmatched.length} not found automatically`)}</summary>
          <div>${unmatched.map((u) => `<div class="gts-opt" style="cursor:default"><span class="ln-body-sm">${esc(u.line ?? `${u.title} - ${u.artist}`)}</span><button type="button" class="ln-btn ln-btn--quiet ln-btn--small" data-search-for="${esc(u.title)} ${esc(u.artist)}">Search</button></div>`).join('')}</div>
        </details>` : ''}`;
  }

  status.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-search-for]');
    if (!btn) return;
    selectTab('search');
    const input = $('#song-search');
    input.value = btn.dataset.searchFor.trim();
    input.dispatchEvent(new Event('input'));
    input.focus();
  });

  $('[data-find]').addEventListener('click', () => {
    const items = parseTrackList($('#paste-box').value);
    if (!items.length) {
      toast('Paste at least one song first.');
      return;
    }
    runMatching(items, 'your list');
  });

  $('[data-form="link"]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.target.querySelector('button');
    const link = $('#playlist-url').value.trim();
    button.disabled = true;
    button.textContent = 'Loading…';
    try {
      const playlist = await api(`import?url=${encodeURIComponent(link)}`);
      if (!$('#quiz-title').value.trim()) {
        $('#quiz-title').value = playlist.title.slice(0, QUIZ_LIMITS.titleMax);
        dirty = true;
      }
      await runMatching(playlist.tracks.map((t) => ({ ...t, line: `${t.title} - ${t.artist}`, swappable: false })), `“${playlist.title}”`);
    } catch (err) {
      status.hidden = false;
      status.innerHTML = `<p class="ln-error-text">${esc(err.message)}</p>`;
    } finally {
      button.disabled = false;
      button.textContent = 'Import';
    }
  });

  serverFeatures().then((features) => {
    const note = $('.link-note');
    if (!features) {
      note.textContent = 'Playlist links need the online game server. You can still paste a list or search.';
      $('[data-form="link"] button').disabled = true;
    } else if (!features.spotifyImport) {
      note.textContent = 'Spotify links aren’t enabled on this server yet — Deezer links work, or paste the song list.';
    }
  });

  // ── Tabs ──────────────────────────────────────────────────────────
  const tabs = [...main.querySelectorAll('[role="tab"]')];
  function selectTab(id) {
    activeTab = id;
    tabs.forEach((t) => {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    main.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== `panel-${id}`));
    renderResults(lastResults);
  }
  main.querySelector('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) selectTab(tab.dataset.tab);
  });
  main.querySelector('.tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    selectTab(next.dataset.tab);
  });

  // ── Save / cancel ─────────────────────────────────────────────────
  $('#quiz-title').addEventListener('input', () => (dirty = true));
  $('[data-cancel]').addEventListener('click', () => navigate('quizzes'));
  $('[data-save]').addEventListener('click', () => {
    const { quiz, error } = sanitizeQuiz({ title: $('#quiz-title').value, tracks: draft.tracks });
    if (error) {
      toast(error);
      return;
    }
    saveLocalQuiz({ ...draft, ...quiz });
    saved = true;
    toast(`Saved “${quiz.title}”.`);
    navigate('quizzes');
  });

  renderTracks();

  return {
    async beforeLeave() {
      if (saved || !dirty) return true;
      return confirmDialog({
        title: 'Discard changes?',
        message: 'Your quiz hasn’t been saved yet.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        danger: true,
      });
    },
    destroy() {
      matchAbort?.abort();
      previewPlayer.pause();
    },
  };
}
