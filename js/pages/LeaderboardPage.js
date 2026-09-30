import { app } from '../app.js';
import { MODES } from '../config.js';
import { getCategory } from '../core/questions.js';
import { avatar } from '../components/ln.js';
import { TopBar } from '../components/TopBar.js';
import { leaderboardRepository } from '../storage/storage.js';
import { esc, formatNumber, html } from '../utils.js';

const TABS = [{ id: '', name: 'All formats' }, ...Object.values(MODES).map((m) => ({ id: m.id, name: m.name }))];

export function mount(root) {
  const last = app.getLastResult();
  let activeTab = '';
  let scope = 'local';
  let seq = 0;

  root.append(TopBar());
  const main = html(`
    <main class="gts-page">
      <header class="gts-head">
        <span class="ln-label-caps ln-muted" data-scope-note>Credits · this device</span>
        <h1 class="ln-headline-lg">Leaderboard</h1>
      </header>
      <div class="gts-stack">
        <div class="ln-btn-row" style="justify-content:space-between">
          <div class="gts-tabs" role="tablist" aria-label="Filter by format">
            ${TABS.map((t) => `<button type="button" role="tab" class="ln-chip" data-tab="${t.id}" aria-selected="${t.id === activeTab}" tabindex="${t.id === activeTab ? 0 : -1}">${esc(t.name)}</button>`).join('')}
          </div>
          <span class="ln-segment" role="radiogroup" aria-label="Whose scores" data-scope hidden>
            <label><input type="radio" name="lb-scope" value="global"><span>Everyone</span></label>
            <label><input type="radio" name="lb-scope" value="local" checked><span>This device</span></label>
          </span>
        </div>
        <div class="ln-board-wrap" role="tabpanel" aria-live="polite" data-board></div>
        <div><a class="ln-btn ln-btn--primary" href="#/play">Play a round</a></div>
      </div>
    </main>`);
  root.append(main);
  const board = main.querySelector('[data-board]');
  const tabs = [...main.querySelectorAll('[role="tab"]')];

  const recordLabel = (e) => (e.categoryId === 'custom' ? `GTS-Q ${e.quizTitle || 'Custom quiz'}` : `${getCategory(e.categoryId).code} ${getCategory(e.categoryId).name}`);

  async function render() {
    const mySeq = ++seq;
    board.innerHTML = '<p class="ln-label-caps ln-muted" style="padding:24px 0">Loading scores…</p>';
    let entries;
    try {
      entries = (await leaderboardRepository.list({ modeId: activeTab || undefined, scope })).slice(0, 50);
    } catch (err) {
      if (mySeq !== seq) return;
      board.innerHTML = `<div class="gts-empty"><p class="ln-title-md">Couldn’t load the global leaderboard.</p><p class="ln-body-md ln-muted">${esc(err.message)}</p></div>`;
      return;
    }
    if (mySeq !== seq) return;
    const highlightId = scope === 'global' ? last?.globalEntryId : last?.entryId;
    if (entries.length === 0) {
      board.innerHTML = `
        <div class="gts-empty">
          <p class="ln-title-md">No scores yet.</p>
          <p class="ln-body-md ln-muted">Finish a round and sign the leaderboard to take the top line.</p>
        </div>`;
      return;
    }
    board.innerHTML = `
      <table class="ln-board">
        <thead><tr><th scope="col">No.</th><th scope="col">Player</th><th scope="col" class="num">Score</th><th scope="col" class="num hide-sm">Accuracy</th><th scope="col" class="hide-sm">Format</th></tr></thead>
        <tbody>
          ${entries.map((e, i) => `
            <tr class="${e.id === highlightId ? 'is-you' : ''}">
              <td class="ln-board__rank ${i < 3 ? 'is-top' : ''}">${String(i + 1).padStart(2, '0')}</td>
              <td>
                <span class="ln-board__who">${avatar(e.name)}
                  <span><span class="ln-board__name">${esc(e.name)}</span>${e.id === highlightId ? '<span class="ln-board__you">You</span>' : ''}
                  <span class="ln-board__sub">${esc(recordLabel(e))}</span></span>
                </span>
              </td>
              <td class="ln-board__score">${formatNumber(e.score)}</td>
              <td class="ln-board__data num hide-sm">${e.accuracy}%</td>
              <td class="ln-label-caps hide-sm">${esc(MODES[e.modeId]?.name ?? e.modeId)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  function select(tab) {
    activeTab = tab.dataset.tab;
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    render();
  }

  main.querySelector('.gts-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  main.querySelector('.gts-tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    select(next);
  });

  const scopeToggle = main.querySelector('[data-scope]');
  const setScope = (value) => {
    scope = value;
    scopeToggle.querySelector(`input[value="${value}"]`).checked = true;
    main.querySelector('[data-scope-note]').textContent = value === 'global' ? 'Credits · everyone online' : 'Credits · this device';
    render();
  };
  scopeToggle.addEventListener('change', (e) => setScope(e.target.value));
  leaderboardRepository.hasGlobal().then((available) => {
    scopeToggle.hidden = !available;
    setScope(available ? 'global' : 'local');
  });

  const onReset = () => render();
  window.addEventListener('gts:data-reset', onReset);
  return { destroy: () => window.removeEventListener('gts:data-reset', onReset) };
}
