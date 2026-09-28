// Actions shared by the quiz list, the editor and the results page.
import { api, appUrl, serverFeatures } from './api.js';
import { app } from './app.js';
import { toast } from './components/Toast.js';
import { navigate } from './router.js';
import { saveLocalQuiz } from './storage/storage.js';

/** Upload (or update) a quiz on the server and return its share link. */
export async function shareQuiz(quiz) {
  if (!(await serverFeatures())?.sharedQuizzes) {
    throw new Error('Sharing needs the online game server.');
  }
  const body = { quiz: { title: quiz.title, tracks: quiz.tracks } };
  if (quiz.remoteId && quiz.editToken) Object.assign(body, { id: quiz.remoteId, editToken: quiz.editToken });
  const saved = await api('quizzes', { method: 'POST', body });
  const updated = saveLocalQuiz({ ...quiz, remoteId: saved.id, editToken: saved.editToken, sharedAt: Date.now() });
  return { quiz: updated, link: appUrl({ quiz: saved.id }) };
}

/** Copy text; returns true on success. Must be called from a click handler. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareQuizFlow(quiz, button) {
  const original = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = 'Sharing…';
  }
  try {
    const { link } = await shareQuiz(quiz);
    const copied = await copyText(link);
    toast(copied ? 'Share link copied. Send it to your friends!' : `Share link: ${link}`, { timeoutMs: copied ? 3200 : 9000 });
    return link;
  } catch (err) {
    toast(err.message);
    return null;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

export function playQuizSolo(quiz) {
  app.pendingSetup = { quizLocalId: quiz.localId };
  navigate('play');
}

export function playQuizWithFriends(quiz) {
  app.pendingHostQuizId = quiz.localId;
  navigate('multiplayer');
}
