# Guess the Song

A fast-paced music guessing game: solo modes, real-time multiplayer rooms, and custom quizzes built from your own playlists. Plain HTML/CSS/JavaScript and a small Node server, with no dependencies, no build step, and no AI APIs.

## Run it locally

```bash
npm start        # http://localhost:5173
npm test         # game logic + server end-to-end tests
```

Needs Node 18.17 or newer.

## Features

| | |
|---|---|
| **Solo** | Classic (10 songs × 10s), Speed (5s), Endless (3 lives). 310 songs in 16 categories. |
| **Multiplayer** | Host a room, share the 4-letter code or invite link, up to 12 players. Everyone hears the same clip at the same moment, and the server does the scoring. |
| **Custom quizzes** | Build a quiz by importing a Deezer/Spotify playlist link, pasting a song list, or searching. Play it solo or in a room, and share it with a link. |
| **Leaderboards** | Global (on the server) plus a per-device board. |

## Deploy it online

The game is one Node process that serves the site and the API, so it runs on any host that runs Node.

### Render (free tier)

1. Push this folder to a GitHub repository.
2. On [render.com](https://render.com) choose **New → Blueprint** and pick the repo. `render.yaml` sets everything up.
3. Share the `https://<name>.onrender.com` URL.

Free-tier caveats: the service sleeps after 15 minutes idle (the first visit then takes ~50s to wake), and there's no persistent disk, so shared quizzes and the global leaderboard reset when it restarts. A paid instance with a disk (`DATA_DIR=/var/data`) fixes both.

### Anything else

A `Dockerfile` is included for Fly.io, Railway, Cloud Run or a VPS. Mount a volume at `/data` to keep quizzes and scores.

### Environment variables (all optional)

| Variable | Purpose |
|---|---|
| `PORT` | Port to listen on (hosts usually set this). |
| `DATA_DIR` | Where `quizzes.json` and `leaderboard.json` are stored. |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Enables Spotify playlist import. Create a free app at developer.spotify.com. Without these, Deezer links and pasted lists still work. |

## Audio

For each song the game tries, in order:

1. `previewUrl` in the song database (your own licensed files).
2. The song's **iTunes preview**: Apple's free public 30-second previews, no key needed. Built-in songs are pinned to exact tracks in `js/data/itunesIds.js`, so a whole game's previews load in one request.
3. An offline placeholder tune (Settings → Song previews → Offline).

Playlist imports read track names from Deezer/Spotify and then match each song to its iTunes preview. Apple Music and YouTube have no public playlist API, so for those, copy the song names and use **Paste a list**.

## Adding songs

1. Add entries to `js/data/songs.js`. Fields are documented at the top of the file.
2. Run `npm run resolve-songs` to pin them to iTunes tracks. It prints any it can't match; fix the title/artist, or put a track id in `js/data/itunesIds.js` by hand.

A category appears once it has at least 12 songs. Categories are just filter functions in `js/config.js`.

## Tuning

Everything lives in `js/config.js`: scoring (`SCORING`), modes (`MODES`), difficulty (`DIFFICULTIES`), categories (`CATEGORIES`) and audio (`AUDIO`). Multiplayer timings (lead-in, reveal length) are at the top of `server/rooms.mjs`.

## Project layout

```
index.html, css/                 the site
js/
  config.js                      tunable settings
  data/songs.js, itunesIds.js    song database + pinned iTunes tracks
  core/                          pure logic shared by browser and server (unit-tested)
    scoring.js, questions.js, gameEngine.js, customQuiz.js, itunes.js, trackMatching.js
  audio/                         preview resolution, playback, sound effects
  storage/storage.js             local settings/scores/quizzes + global leaderboard client
  api.js                         game server client
  components/, pages/            UI
server/
  index.mjs                      HTTP server: static files + API
  rooms.mjs                      multiplayer rooms (server-authoritative, Server-Sent Events)
  imports.mjs                    Deezer/Spotify playlist import
  previews.mjs                   server-side preview cache
  store.mjs                      JSON-file storage for quizzes and the leaderboard
scripts/resolve-songs.mjs        pins songs to iTunes tracks
tests/                           node --test suites
```

## Multiplayer design

- The server picks each song, sends every player the options plus a start time a few seconds ahead, and all clients start the clip together (clocks are synced from the event stream).
- Answers are timed by the server, so scores can't be faked from the browser. The correct answer isn't sent until the reveal.
- Refreshing the page rejoins the same seat. If the host leaves, the longest-connected player takes over.
- Rooms live in memory and close after 5 minutes with nobody connected.

## Keyboard

`1`–`4` or `A`–`D` answer · `Enter` next · `M` mute · `Esc` closes dialogs.
