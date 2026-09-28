import { AUDIO } from '../config.js';
import { randomBetween } from '../utils.js';
import { PreviewError, resolvePreview } from './previewProvider.js';
import { getAudioContext, playPlaceholderTune, unlockAudio } from './synth.js';

/**
 * Plays short song previews. One instance for the whole app.
 *   await load(song)       resolve + buffer the preview (throws PreviewError)
 *   await play(seconds)    start playback (throws PreviewError 'AUTOPLAY_BLOCKED')
 *   stop(), setMuted()
 */
class AudioManager {
  constructor() {
    this.element = new Audio();
    this.element.preload = 'auto';
    this.prefetchElement = new Audio();
    this.prefetchElement.preload = 'auto';
    this.muted = false;
    this.source = 'online';
    this.prepared = null;
    this.synthHandle = null;
    this.stopTimer = null;
    this.fadeTimer = null;
    this.loadToken = 0;
  }

  setSource(source) {
    this.source = source;
  }

  async load(song) {
    this.stop();
    const token = ++this.loadToken;
    const resolved = await resolvePreview(song, { source: this.source });
    if (token !== this.loadToken) throw new PreviewError('CANCELLED', 'Superseded by a newer load');
    return this.#prepare(resolved, token);
  }

  /** Load an already-known source: { kind: 'url', url } or { kind: 'synth', seed } (multiplayer). */
  async loadResolved(resolved) {
    this.stop();
    const token = ++this.loadToken;
    return this.#prepare(resolved, token);
  }

  async #prepare(resolved, token) {
    if (resolved.kind === 'synth') {
      this.prepared = { kind: 'synth', seed: resolved.seed };
      return this.prepared;
    }
    await this.#bufferElement(resolved.url, token);
    this.prepared = { kind: 'url' };
    return this.prepared;
  }

  #bufferElement(url, token) {
    const el = this.element;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error', onError);
      };
      const onReady = () => {
        cleanup();
        token === this.loadToken ? resolve() : reject(new PreviewError('CANCELLED', 'Superseded'));
      };
      const onError = () => {
        cleanup();
        reject(new PreviewError('LOAD_FAILED', "Couldn't load this preview."));
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new PreviewError('LOAD_FAILED', 'Preview took too long to load.'));
      }, AUDIO.loadTimeoutMs);

      el.addEventListener('canplay', onReady);
      el.addEventListener('error', onError);
      el.muted = this.muted;
      el.volume = 1;
      el.src = url;
      el.load();
    });
  }

  /** Start the prepared preview and stop it automatically after `durationSec`. */
  async play(durationSec, { onEnd, offsetSec } = {}) {
    const prepared = this.prepared;
    if (!prepared) throw new PreviewError('LOAD_FAILED', 'Nothing loaded');
    clearTimeout(this.stopTimer);

    if (prepared.kind === 'synth') {
      await unlockAudio();
      try {
        this.synthHandle = playPlaceholderTune(prepared.seed, durationSec, { muted: this.muted });
      } catch {
        throw new PreviewError('AUTOPLAY_BLOCKED', 'Tap to play the preview.');
      }
    } else {
      const el = this.element;
      const [minStart, maxStart] = AUDIO.previewStartRange;
      const latestStart = Number.isFinite(el.duration) ? Math.max(0, el.duration - durationSec - 0.5) : 0;
      el.currentTime = Math.min(offsetSec ?? randomBetween(minStart, maxStart), latestStart);
      el.volume = 1;
      el.muted = this.muted;
      try {
        await el.play();
      } catch (err) {
        if (err?.name === 'NotAllowedError') throw new PreviewError('AUTOPLAY_BLOCKED', 'Tap to play the preview.');
        throw new PreviewError('LOAD_FAILED', "Couldn't play this preview.");
      }
    }

    this.onEnd = onEnd;
    this.#scheduleEnd(durationSec * 1000);
  }

  #scheduleEnd(ms) {
    clearTimeout(this.stopTimer);
    this.endsAt = performance.now() + ms;
    this.stopTimer = setTimeout(() => {
      this.endsAt = null;
      this.stop({ fade: true });
      this.onEnd?.();
    }, ms);
  }

  /** Pause mid-preview (e.g. while a quit dialog is open or the tab is hidden). */
  pause() {
    if (this.endsAt == null) return;
    this.pausedRemainingMs = Math.max(0, this.endsAt - performance.now());
    this.endsAt = null;
    clearTimeout(this.stopTimer);
    if (this.synthHandle) getAudioContext()?.suspend();
    else this.element.pause();
  }

  async resume() {
    if (this.pausedRemainingMs == null) return;
    const remaining = this.pausedRemainingMs;
    this.pausedRemainingMs = null;
    try {
      if (this.synthHandle) await getAudioContext()?.resume();
      else await this.element.play();
    } catch {
      /* if resuming fails the countdown still continues */
    }
    this.#scheduleEnd(remaining);
  }

  stop({ fade = false } = {}) {
    clearTimeout(this.stopTimer);
    this.endsAt = null;
    this.pausedRemainingMs = null;
    if (getAudioContext()?.state === 'suspended' && this.synthHandle) getAudioContext().resume();
    clearInterval(this.fadeTimer);
    if (this.synthHandle) {
      this.synthHandle.stop();
      this.synthHandle = null;
    }
    const el = this.element;
    if (el.paused) return;
    if (!fade) {
      el.pause();
      return;
    }
    this.fadeTimer = setInterval(() => {
      if (el.volume <= 0.1) {
        clearInterval(this.fadeTimer);
        el.pause();
        el.volume = 1;
      } else {
        el.volume = Math.max(0, el.volume - 0.1);
      }
    }, 30);
  }

  setMuted(muted) {
    this.muted = muted;
    this.element.muted = muted;
    this.synthHandle?.setMuted(muted);
  }

  /** Warm up the next song so the following question starts instantly. Errors are ignored. */
  prefetch(song) {
    resolvePreview(song, { source: this.source })
      .then((resolved) => {
        if (resolved.kind === 'url') {
          this.prefetchElement.src = resolved.url;
          this.prefetchElement.load();
        }
      })
      .catch(() => {});
  }

  get contextRunning() {
    return getAudioContext()?.state === 'running';
  }
}

export const audioManager = new AudioManager();
