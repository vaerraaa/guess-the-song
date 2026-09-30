import { api, serverFeatures } from '../api.js';
import { app } from '../app.js';
import { resolvePreview } from '../audio/previewProvider.js';
import { QUIZ_LIMITS, sanitizeQuiz } from '../core/customQuiz.js';
import { searchSongs, toTrack } from '../core/itunes.js';
import { matchTracks, parseTrackList } from '../core/trackMatching.js';
import { confirmDialog } from '../components/Modal.js';
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
    <main class="container editor">
      <header class="page-head">
        <p class="eyebrow"><a href="#/quizzes">Custom quizzes</a></p>
        <h1>${existing ? 'Edit quiz' : 'New quiz'}</h1>
      </header>
      <div class="editor-grid">
        <section class="card editor-add" aria-labelledby="add-title">
          <h2 id="add-title" class="panel-title">Add songs</h2>
          <div class="tabs" role="tablist" aria-label="Ways to add songs">
            ${TABS.map((t) => `<button type="button" role="tab" class="tab" id="tab-${t.id}" data-tab="${t.id}" aria-controls="panel-${t.id}" aria-selected="${t.id === activeTab}" tabindex="${t.id === activeTab ? 0 : -1}">${t.label}</button>`).join('')}
          </div>

          <div class="tab-panel" role="tabpanel" id="panel-search" aria-labelledby="tab-search">
            <label class="sr-only" for="song-search">Search for a song or artist</label>
            <input id="song-search" class="text-input" type="search" placeholder="Search a song or artist…" autocomplete="off">
            <ul class="result-list" aria-live="polite"></ul>
          </div>

          <div class="tab-panel" role="tabpanel" id="panel-link" aria-labelledby="tab-link" hidden>
            <p class="muted small">Paste a public <strong>Deezer</strong> or <strong>Spotify</strong> playlist link. We find each song’s preview on Apple Music.</p>
            <form class="inline-form" data-form="link">
              <label class="sr-only" for="playlist-url">Playlist link</label>
              <input id="playlist-url" class="text-input" type="url" placeholder="https://www.deezer.com/playlist/… or https://open.spotify.com/playlist/…" required>
              <button type="submit" class="btn btn-primary">Import</button>
            </form>
            <p class="muted small link-note"></p>
          </div>

          <div class="tab-panel" role="tabpanel" id="panel-paste" aria-labelledby="tab-paste" hidden>
            <p class="muted small">One song per line, like <code>Blinding Lights - The Weeknd</code>. Works with lists copied from Apple Music, YouTube Music or any export tool.</p>
            <label class="sr-only" for="paste-box">Song list</label>
            <textarea id="paste-box" class="text-input textarea" rows="8" placeholder="Kesariya - Arijit Singh&#10;Levitating - Dua Lipa&#10;Mr. Brightside - The Killers"></textarea>
            <button type="button" class="btn btn-primary" data-find>Find songs</button>
          </div>

          <div class="match-status" hidden aria-live="polite"></div>
        </section>

        <section class="card editor-quiz" aria-labelledby="quiz-title-label">
          <label id="quiz-title-label" class="panel-title" for="quiz-title">Quiz name</label>
          <input id="quiz-title" class="text-input title-input" maxlength="${QUIZ_LIMITS.titleMax}" placeholder="e.g. Road trip 2024" value="${esc(draft.title)}">
          <p class="track-count"></p>
          <ol class="track-list"></ol>
          <div class="editor-footer">
            <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
            <button type="button" class="btn btn-primary" data-save>Save quiz</button>
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
    $('.track-count').innerHTML = `<strong>${n}</strong> song${n === 1 ? '' : 's'}${n < QUIZ_LIMITS.minTracks ? ` <span class="muted">· add at least ${QUIZ_LIMITS.minTracks - n} more</span>` : ''}`;
    $('[data-save]').disabled = n < QUIZ_LIMITS.minTracks;
    if (n === 0) {
      trackList.innerHTML = '<li class="track-empty muted">Songs you add appear here.</li>';
      return;
    }
    trackList.innerHTML = draft.tracks
      .map((t) => `
        <li class="track-row">
          <img src="${esc(t.artwork || generatedArtwork(t.itunesId % 100000))}" alt="" loading="lazy">
          <span class="track-text"><strong>${esc(t.title)}</strong><span>${esc(t.artist)}</span></span>
          <button type="button" class="icon-btn icon-btn-small" data-preview="${t.itunesId}" aria-label="Preview ${esc(t.title)}">${playingId === t.itunesId ? '■' : '▶'}</button>
          <button type="button" class="icon-btn icon-btn-small" data-remove="${t.itunesId}" aria-label="Remove ${esc(t.title)}">✕</button>
        </li>`)
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
        <li class="track-row">
          <img src="${esc(t.artwork)}" alt="" loading="lazy">
          <span class="track-text"><strong>${esc(t.title)}</strong><span>${esc(t.artist)}${t.year ? ` · ${t.year}` : ''}</span></span>
          <button type="button" class="icon-btn icon-btn-small" data-result-preview="${t.itunesId}" aria-label="Preview ${esc(t.title)}">${playingId === t.itunesId ? '■' : '▶'}</button>
          ${have.has(t.itunesId)
            ? '<span class="added-tag">✓ Added</span>'
            : `<button type="button" class="btn btn-ghost btn-small" data-add="${t.itunesId}">+ Add</button>`}
        </li>`)
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
      resultList.innerHTML = '<li class="muted small">Searching…</li>';
      try {
        const results = (await searchSongs(term, { limit: 12 })).map(toTrack);
        if (seq === searchSeq) renderResults(results);
      } catch (err) {
        if (seq === searchSeq) resultList.innerHTML = `<li class="muted small">${err.code === 'RATE_LIMITED' ? 'Too many searches — wait a few seconds and try again.' : 'Search isn’t available right now. Check your connection.'}</li>`;
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
      <p class="match-line"><strong>Finding ${items.length} songs from ${esc(sourceLabel)}…</strong> <span data-progress-text></span></p>
      <div class="progress-track"><div class="progress-fill"></div></div>
      <button type="button" class="btn btn-ghost btn-small" data-stop>Stop</button>`;
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
      <p class="match-line"><strong>${stopped ? 'Stopped. ' : ''}Added ${added} song${added === 1 ? '' : 's'}.</strong>
        ${tracks.length > added ? `<span class="muted">${tracks.length - added} were already in the quiz.</span>` : ''}</p>
      ${unmatched.length ? `
        <details class="unmatched" ${unmatched.length <= 8 ? 'open' : ''}>
          <summary>${unmatched.length} couldn’t be found automatically</summary>
          <ul>${unmatched.map((u) => `<li><span>${esc(u.line ?? `${u.title} - ${u.artist}`)}</span> <button type="button" class="link-btn" data-search-for="${esc(u.title)} ${esc(u.artist)}">Search</button></li>`).join('')}</ul>
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
      status.innerHTML = `<p class="match-line error-text">${esc(err.message)}</p>`;
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
