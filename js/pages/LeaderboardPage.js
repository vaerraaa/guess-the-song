import { app } from '../app.js';
import { MODES } from '../config.js';
import { getCategory } from '../core/questions.js';
import { TopBar } from '../components/TopBar.js';
import { leaderboardRepository } from '../storage/storage.js';
import { esc, formatNumber, html } from '../utils.js';

const TABS = [{ id: '', name: 'All modes' }, ...Object.values(MODES).map((m) => ({ id: m.id, name: m.name }))];
const MEDALS = ['🥇', '🥈', '🥉'];

export function mount(root) {
  const last = app.getLastResult();
  let activeTab = '';
  let scope = 'local';
  let hasGlobal = false;
  let seq = 0;

  root.append(TopBar());
  const main = html(`
    <main class="container leaderboard">
      <header class="page-head page-head-row">
        <div>
          <h1>Leaderboard</h1>
          <p class="muted" data-scope-note>Top scores saved on this device.</p>
        </div>
        <span class="segmented" role="radiogroup" aria-label="Whose scores" data-scope hidden>
          <label><input type="radio" name="lb-scope" value="global"><span>Everyone</span></label>
          <label><input type="radio" name="lb-scope" value="local" checked><span>This device</span></label>
        </span>
      </header>
      <div class="tabs" role="tablist" aria-label="Filter by mode">
        ${TABS.map((t) => `<button type="button" role="tab" class="tab" data-tab="${t.id}" aria-selected="${t.id === activeTab}" tabindex="${t.id === activeTab ? 0 : -1}">${esc(t.name)}</button>`).join('')}
      </div>
      <div class="board card" role="tabpanel" aria-live="polite"></div>
      <div class="board-cta"><a class="btn btn-primary btn-lg" href="#/play">Play now</a></div>
    </main>`);
  root.append(main);
  const board = main.querySelector('.board');
  const tabs = [...main.querySelectorAll('[role="tab"]')];

  function categoryLabel(e) {
    return e.categoryId === 'custom' ? `🎼 ${e.quizTitle || 'Custom quiz'}` : getCategory(e.categoryId).name;
  }

  async function render() {
    const mySeq = ++seq;
    board.innerHTML = '<p class="muted board-loading">Loading scores…</p>';
    let entries;
    try {
      entries = (await leaderboardRepository.list({ modeId: activeTab || undefined, scope })).slice(0, 50);
    } catch (err) {
      if (mySeq !== seq) return;
      board.innerHTML = `<div class="empty"><p><strong>Couldn’t load the global leaderboard.</strong></p><p class="muted">${esc(err.message)}</p></div>`;
      return;
    }
    if (mySeq !== seq) return;
    const highlightId = scope === 'global' ? last?.globalEntryId : last?.entryId;
    if (entries.length === 0) {
      board.innerHTML = `
        <div class="empty">
          <div class="empty-icon" aria-hidden="true">🏆</div>
          <p><strong>No scores yet.</strong></p>
          <p class="muted">Finish a game and save your score to claim the top spot.</p>
        </div>`;
      return;
    }
    board.innerHTML = `
      <div class="table-scroll">
      <table class="board-table">
        <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col" class="num">Score</th><th scope="col" class="num hide-sm">Accuracy</th><th scope="col">Mode</th></tr></thead>
        <tbody>
          ${entries.map((e, i) => `
            <tr class="${e.id === highlightId ? 'is-you' : ''} ${i < 3 ? 'is-top' : ''}">
              <td class="rank">${MEDALS[i] ? `<span aria-hidden="true">${MEDALS[i]}</span><span class="sr-only">${i + 1}</span>` : i + 1}</td>
              <td class="player">${esc(e.name)}${e.id === highlightId ? ' <span class="you-tag">You</span>' : ''}<span class="sub">${esc(categoryLabel(e))}</span></td>
              <td class="num score">${formatNumber(e.score)}</td>
              <td class="num hide-sm">${e.accuracy}%</td>
              <td>${esc(MODES[e.modeId]?.name ?? e.modeId)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>`;
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

  main.querySelector('.tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  main.querySelector('.tabs').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const nextTab = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    nextTab.focus();
    select(nextTab);
  });

  const scopeToggle = main.querySelector('[data-scope]');
  const setScope = (value) => {
    scope = value;
    scopeToggle.querySelector(`input[value="${value}"]`).checked = true;
    main.querySelector('[data-scope-note]').textContent =
      value === 'global' ? 'Top scores from everyone playing online.' : 'Top scores saved on this device.';
    render();
  };
  scopeToggle.addEventListener('change', (e) => setScope(e.target.value));

  leaderboardRepository.hasGlobal().then((available) => {
    hasGlobal = available;
    scopeToggle.hidden = !hasGlobal;
    setScope(hasGlobal ? 'global' : 'local');
  });

  const onReset = () => render();
  window.addEventListener('gts:data-reset', onReset);
  return { destroy: () => window.removeEventListener('gts:data-reset', onReset) };
}
