// Shared app context: settings, the active game session and cross-page helpers.
import { SONGS } from './data/songs.js';
import { audioManager } from './audio/audioManager.js';
import { ambient, sfx, unlockAudio } from './audio/synth.js';
import { loadSettings, saveSettings } from './storage/storage.js';

let lastResultMemory = null;

export const app = {
  songs: SONGS,
  settings: loadSettings(),
  /** { engine, setup } while a game is running */
  session: null,
  route: null,

  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    applySettings();
  },

  setLastResult(result) {
    lastResultMemory = result;
    try {
      sessionStorage.setItem('gts:lastResult', JSON.stringify(result));
    } catch {
      /* memory copy is enough */
    }
  },

  getLastResult() {
    if (lastResultMemory) return lastResultMemory;
    try {
      return JSON.parse(sessionStorage.getItem('gts:lastResult') ?? 'null');
    } catch {
      return null;
    }
  },

  /** Menu music only plays outside of gameplay. */
  syncAmbient() {
    const shouldPlay = this.settings.music && this.route !== 'game';
    if (shouldPlay && !ambient.playing) ambient.start();
    if (!shouldPlay && ambient.playing) ambient.stop();
  },
};

export function applySettings() {
  const { theme, animations, sound, audioSource } = app.settings;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.animations = animations ? 'on' : 'off';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#F8F4EC' : '#13100D');
  sfx.enabled = sound;
  audioManager.setSource(audioSource);
  app.syncAmbient();
}

// Browsers only allow audio after a user gesture — unlock on the first one.
export function installAudioUnlock() {
  const unlock = async () => {
    await unlockAudio();
    app.syncAmbient();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
