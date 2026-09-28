import { esc, html } from '../utils.js';
import { Waveform } from './Waveform.js';

/**
 * The "listening stage": mystery disc, waveform, countdown and status line.
 * Never renders song details until reveal() is called after the player answers.
 */
export function QuestionCard({ onToggleMute, muted }) {
  const element = html(`
    <section class="stage" aria-label="Song preview">
      <div class="stage-disc" data-state="hidden">
        <div class="disc" aria-hidden="true">
          <div class="disc-grooves"></div>
          <div class="disc-label"><span class="disc-count">--</span></div>
        </div>
        <img class="disc-art" alt="" hidden>
      </div>
      <div class="stage-body">
        <div class="stage-wave"></div>
        <p class="stage-status" aria-live="polite">Loading preview…</p>
        <div class="stage-reveal" hidden></div>
        <div class="stage-actions">
          <button type="button" class="btn btn-primary play-preview" hidden>▶ Play preview</button>
          <button type="button" class="icon-btn mute-btn" aria-pressed="${muted}" aria-keyshortcuts="M"></button>
        </div>
        <div class="stage-error"></div>
      </div>
    </section>`);

  const $ = (sel) => element.querySelector(sel);
  const waveform = Waveform({ bars: 32 });
  $('.stage-wave').append(waveform.element);

  const muteBtn = $('.mute-btn');
  const renderMute = (m) => {
    muteBtn.setAttribute('aria-pressed', String(m));
    muteBtn.setAttribute('aria-label', m ? 'Unmute preview' : 'Mute preview');
    muteBtn.textContent = m ? '🔇' : '🔊';
  };
  renderMute(muted);
  muteBtn.addEventListener('click', onToggleMute);

  let playHandler = null;
  $('.play-preview').addEventListener('click', () => playHandler?.());

  return {
    element,
    setMuted: renderMute,

    /** state: 'loading' | 'playing' | 'ended' | 'blocked' | 'error' | 'answered' */
    setStatus(state, text) {
      element.dataset.state = state;
      waveform.setState(state === 'playing' ? 'playing' : state === 'loading' ? 'loading' : 'idle');
      $('.stage-disc').classList.toggle('spinning', state === 'playing');
      if (text != null) $('.stage-status').textContent = text;
    },

    setCountdown(seconds) {
      $('.disc-count').textContent = seconds == null ? '--' : String(seconds).padStart(2, '0');
      $('.disc-count').classList.toggle('low', seconds != null && seconds <= 3);
    },

    showPlayButton(onClick) {
      playHandler = onClick;
      const btn = $('.play-preview');
      btn.hidden = false;
      btn.focus();
    },

    hidePlayButton() {
      playHandler = null;
      $('.play-preview').hidden = true;
    },

    showError(errorElement) {
      $('.stage-error').replaceChildren(errorElement);
      element.classList.add('has-error');
    },

    clearError() {
      $('.stage-error').replaceChildren();
      element.classList.remove('has-error');
    },

    reveal(song, artworkUrl) {
      const art = $('.disc-art');
      art.src = artworkUrl;
      art.alt = `${song.album} cover`;
      art.hidden = false;
      $('.stage-disc').dataset.state = 'revealed';
      const reveal = $('.stage-reveal');
      reveal.innerHTML = `
        <p class="reveal-title">${esc(song.title)}</p>
        <p class="reveal-artist">${esc(song.artist)}</p>
        <p class="reveal-meta">${esc(song.album)} · ${song.year}</p>`;
      reveal.hidden = false;
      $('.stage-status').hidden = true;
    },

    reset() {
      const art = $('.disc-art');
      art.hidden = true;
      art.removeAttribute('src');
      $('.stage-disc').dataset.state = 'hidden';
      $('.stage-reveal').hidden = true;
      $('.stage-reveal').replaceChildren();
      $('.stage-status').hidden = false;
      this.hidePlayButton();
      this.clearError();
      this.setCountdown(null);
    },
  };
}
