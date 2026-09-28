// End-to-end tests against a real server process (multiplayer, quizzes, leaderboard, static files).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let server;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'gts-'));
  server = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, GTS_TIMING_SCALE: '0.05' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => d.toString().includes('http://') && resolve());
    server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
});

after(async () => {
  server?.kill();
  await rm(dataDir, { recursive: true, force: true });
});

async function post(path, body) {
  const res = await fetch(`${BASE}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

/** Subscribe to a room's event stream; returns helpers to await matching states. */
function stream(code, seat) {
  const controller = new AbortController();
  const states = [];
  const waiters = [];
  (async () => {
    const res = await fetch(`${BASE}/api/rooms/${code}/stream?player=${seat.playerId}&token=${seat.token}`, { signal: controller.signal });
    const reader = res.body.getReader();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += new TextDecoder().decode(value);
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const state = JSON.parse(line.slice(6));
        states.push(state);
        for (const w of [...waiters]) if (w.match(state)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(state);
        }
      }
    }
  })().catch(() => {});
  return {
    states,
    until(match, timeoutMs = 15000) {
      const found = states.findLast?.(match) ?? [...states].reverse().find(match);
      if (found && !found.__used) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timed out; last state: ' + JSON.stringify(states.at(-1) && { phase: states.at(-1).phase, q: states.at(-1).question?.number, players: states.at(-1).players.map((p) => [p.name, p.connected]) }))), timeoutMs);
        waiters.push({ match, resolve: (s) => { clearTimeout(t); resolve(s); } });
      });
    },
    close: () => controller.abort(),
  };
}

test('config reports online features', async () => {
  const res = await fetch(`${BASE}/api/config`);
  const data = await res.json();
  assert.equal(data.multiplayer, true);
});

test('private files are never served', async () => {
  const dataFile = await fetch(`${BASE}/data/leaderboard.json`);
  assert.ok(!(await dataFile.text()).trim().startsWith('['), 'data dir must not be served');
  assert.equal((await fetch(`${BASE}/server/index.mjs`)).status, 404);
  assert.equal((await fetch(`${BASE}/package.json`)).status, 404);
  assert.equal((await fetch(`${BASE}/js/main.js`)).status, 200);
});

test('multiplayer: full game with two players', { timeout: 90000 }, async () => {
  const host = (await post('rooms', { name: 'Aarav', settings: { modeId: 'classic', categoryId: 'pop', questionCount: 5 } })).data;
  assert.match(host.code, /^[A-Z]{4}$/);
  const guest = (await post(`rooms/${host.code}/join`, { name: 'Aarav' })).data; // duplicate name gets a suffix
  const hostStream = stream(host.code, host);
  const guestStream = stream(host.code, guest);

  const lobby = await guestStream.until((s) => s.phase === 'lobby' && s.players.length === 2 && s.players.every((p) => p.connected));
  assert.deepEqual(lobby.players.map((p) => p.name).sort(), ['Aarav', 'Aarav 2']);
  assert.equal(lobby.hostId, host.playerId);

  // Only the host can start.
  assert.equal((await post(`rooms/${host.code}/start`, guest)).status, 403);
  assert.equal((await post(`rooms/${host.code}/start`, host)).status, 200);

  for (let n = 1; n <= 5; n++) {
    const q = await hostStream.until((s) => s.phase === 'question' && s.question.number === n);
    assert.equal(q.question.options.length, 4);
    assert.equal(q.question.correctIndex, undefined, 'answer must not leak before reveal');
    assert.equal(q.question.song, undefined);
    // Wait for the synchronized start, then both answer.
    await new Promise((r) => setTimeout(r, Math.max(0, q.question.startsAt - q.now) + 20));
    assert.equal((await post(`rooms/${host.code}/answer`, { ...host, questionNumber: n, choice: 0 })).status, 200);
    const dup = await post(`rooms/${host.code}/answer`, { ...host, questionNumber: n, choice: 1 });
    assert.equal(dup.data.duplicate, true, 'second answer is ignored');
    assert.equal((await post(`rooms/${host.code}/answer`, { ...guest, questionNumber: n + 5, choice: 1 })).status, 409);
    await post(`rooms/${host.code}/answer`, { ...guest, questionNumber: n, choice: 1 });

    const reveal = await guestStream.until((s) => s.phase === 'reveal' && s.question.number === n);
    const correct = reveal.question.correctIndex;
    assert.ok(correct >= 0 && correct < 4);
    assert.ok(reveal.question.song.title);
    const hostResult = reveal.players.find((p) => p.id === host.playerId).lastResult;
    const guestResult = reveal.players.find((p) => p.id === guest.playerId).lastResult;
    assert.equal(hostResult.correct, correct === 0);
    assert.equal(guestResult.correct, correct === 1);
    assert.equal(hostResult.choice, 0, 'first answer counts');
  }

  const final = await hostStream.until((s) => s.phase === 'final');
  const scores = final.players.map((p) => p.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'standings are sorted');
  assert.ok(final.players.every((p) => p.answeredCount === 5));

  // Back to lobby resets scores; leaving hands host to the guest.
  await post(`rooms/${host.code}/lobby`, host);
  await guestStream.until((s) => s.phase === 'lobby' && s.players.every((p) => p.score === 0));
  await post(`rooms/${host.code}/leave`, host);
  const after = await guestStream.until((s) => s.players.length === 1);
  assert.equal(after.hostId, guest.playerId);
  hostStream.close();
  guestStream.close();
});

test('multiplayer: bad codes and tokens are rejected', async () => {
  assert.equal((await fetch(`${BASE}/api/rooms/ZZZZ`)).status, 404);
  const host = (await post('rooms', { name: 'Host' })).data;
  const res = await fetch(`${BASE}/api/rooms/${host.code}/stream?player=${host.playerId}&token=wrong`);
  assert.equal(res.status, 403);
  assert.equal((await post('rooms', { name: '   ' })).status, 400);
});

test('shared quizzes: save, load, and owner-only updates', async () => {
  const tracks = [1, 2, 3, 4, 5].map((i) => ({ itunesId: 1000 + i, title: `Song ${i}`, artist: `Artist ${i}`, album: 'A', artwork: 'https://evil.example/x.png' }));
  const saved = await post('quizzes', { quiz: { title: 'Road trip', tracks } });
  assert.equal(saved.status, 201);
  const loaded = await (await fetch(`${BASE}/api/quizzes/${saved.data.id}`)).json();
  assert.equal(loaded.title, 'Road trip');
  assert.equal(loaded.tracks.length, 5);
  assert.equal(loaded.editToken, undefined, 'edit token stays private');
  assert.equal(loaded.tracks[0].artwork, '', 'non-Apple artwork URLs are dropped');

  const hijack = await post('quizzes', { id: saved.data.id, editToken: '0'.repeat(32), quiz: { title: 'Mine now', tracks } });
  assert.equal(hijack.status, 403);
  const update = await post('quizzes', { id: saved.data.id, editToken: saved.data.editToken, quiz: { title: 'Road trip 2', tracks } });
  assert.equal(update.data.id, saved.data.id);

  assert.equal((await post('quizzes', { quiz: { title: 'Tiny', tracks: tracks.slice(0, 2) } })).status, 400);
});

test('global leaderboard validates scores', async () => {
  const bad = await post('leaderboard', { name: 'Cheater', score: 999999, correct: 10, answered: 10, modeId: 'classic' });
  assert.equal(bad.status, 400);
  const good = await post('leaderboard', { name: 'Aarav', score: 2500, correct: 9, answered: 10, modeId: 'classic', categoryId: 'pop' });
  assert.equal(good.status, 201);
  assert.equal(good.data.record.accuracy, 90);
  const list = await (await fetch(`${BASE}/api/leaderboard?mode=classic`)).json();
  assert.equal(list[0].name, 'Aarav');
});
