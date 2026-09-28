import { animateNumber, html } from '../utils.js';

/** Compact in-game header: quit, question counter / lives, score, streak and a timer slot. */
export function ScoreDisplay({ totalQuestions, lives, modeName, onQuit }) {
  const endless = !Number.isFinite(totalQuestions);
  const element = html(`
    <header class="game-header">
      <button type="button" class="icon-btn quit-btn" aria-label="Quit game">✕</button>
      <div class="hud">
        <div class="hud-item">
          <span class="hud-label">${endless ? 'Song' : 'Question'}</span>
          <span class="hud-value"><span data-q>1</span>${endless ? '' : `<span class="hud-dim"> / ${totalQuestions}</span>`}</span>
        </div>
        ${lives != null ? `
        <div class="hud-item">
          <span class="hud-label">Lives</span>
          <span class="hud-value lives" data-lives aria-label="${lives} lives left">${'<span class="life">♥</span>'.repeat(lives)}</span>
        </div>` : ''}
        <div class="hud-item">
          <span class="hud-label">Score</span>
          <span class="hud-value score" data-score data-value="0">0</span>
        </div>
        <div class="hud-item">
          <span class="hud-label">Streak</span>
          <span class="hud-value streak" data-streak><span aria-hidden="true">🔥</span> <span data-streak-n>0</span></span>
        </div>
        ${endless ? `
        <div class="hud-item hud-optional">
          <span class="hud-label">Best</span>
          <span class="hud-value" data-best>0</span>
        </div>` : ''}
      </div>
      <div class="timer-slot"></div>
      ${endless ? "" : `
      <div class="progress" role="progressbar" aria-label="${modeName} progress" aria-valuemin="0" aria-valuemax="${totalQuestions}" aria-valuenow="0">
        <div class="progress-fill"></div>
      </div>`}
    </header>`);

  element.querySelector('.quit-btn').addEventListener('click', onQuit);
  const $ = (sel) => element.querySelector(sel);

  return {
    element,
    timerSlot: $('.timer-slot'),
    setQuestion(n) {
      $('[data-q]').textContent = String(n);
    },
    setProgress(done) {
      const bar = $('.progress');
      if (!bar) return;
      const max = Number(bar.getAttribute('aria-valuemax'));
      bar.setAttribute('aria-valuenow', String(done));
      $('.progress-fill').style.width = `${Math.min(100, (done / max) * 100)}%`;
    },
    setScore(score, gained = 0) {
      const el = $('[data-score]');
      animateNumber(el, score);
      if (gained > 0) {
        const pop = html(`<span class="score-pop" aria-hidden="true">+${gained}</span>`);
        el.parentElement.append(pop);
        setTimeout(() => pop.remove(), 1100);
      }
    },
    setStreak(streak, best) {
      const streakEl = $('[data-streak]');
      const prev = Number($('[data-streak-n]').textContent);
      $('[data-streak-n]').textContent = String(streak);
      streakEl.classList.toggle('streak-hot', streak >= 2);
      if (streak > prev) {
        streakEl.classList.remove('bump');
        void streakEl.offsetWidth;
        streakEl.classList.add('bump');
      }
      const bestEl = $('[data-best]');
      if (bestEl) bestEl.textContent = String(best);
    },
    setLives(left, total) {
      const el = $('[data-lives]');
      if (!el) return;
      el.setAttribute('aria-label', `${left} lives left`);
      el.innerHTML = Array.from({ length: total }, (_, i) => `<span class="life ${i < left ? '' : 'lost'}">♥</span>`).join('');
    },
  };
}
