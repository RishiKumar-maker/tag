# Drift Tag Arena

A cozy low-poly 3D multiplayer car tag game. No server, no build step, no
npm install required to run it — just static files you can deploy straight
to GitHub Pages.

## Play

- **WASD** or **Arrow keys** — drive
- **Space** or **Shift** — drift (hold it while turning)
- One player creates a room and shares the invite link/code; friends open
  it and join. 2–8 players works best.
- Two modes: **Classic** (one chaser, tag passes on) and **Infection**
  (tagged players join the chase, last survivor wins). The host picks the
  mode each round from the lobby.
- **Practice Solo**, on the menu screen — drops you straight into the arena
  alone, no room or second player needed. No timer, no chaser, just the
  arena and your car. Good for testing drift feel or your connection/specs
  before inviting anyone.

## How multiplayer works (no backend)

GitHub Pages only serves static files, so there's no game server. Instead,
players connect directly to each other over **WebRTC**, using a small
library called [Trystero](https://github.com/dmotz/trystero) to handle the
initial handshake (it uses public Nostr relays just to help players find
each other — no account, no config). Once connected, all game state
(positions, tags, timers) flows peer-to-peer. Actual gameplay traffic is
encrypted by WebRTC (DTLS) by default.

One thing worth knowing: every copy of this game that hasn't changed the
`APP_ID` in `src/network.js` shares the same signaling namespace. Room
codes are random 5-character codes (millions of combinations) so collisions
are very unlikely, but if you want a fully private namespace for your
deployment, change `APP_ID` to something unique before sharing it around.

## Local testing

Opening `index.html` directly (`file://`) won't work — browsers block ES
module imports from the filesystem. Serve it over local HTTP instead, from
this folder:

```bash
python3 -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000` in two browser tabs (or two devices on
the same network) to test multiplayer against yourself before sharing it.

## Deploy to GitHub Pages

1. Create a new GitHub repo and push everything in this folder to it
   (keep the folder structure exactly as-is — `index.html` at the root,
   `src/` and `lib/` beside it).
2. On GitHub: **Settings → Pages → Source → Deploy from a branch**, pick
   your branch and `/ (root)`, then **Save**.
3. GitHub gives you a URL like `https://yourname.github.io/reponame/`.
   That's the game.
4. Share that link. Anyone who opens it can create or join a room —
   nothing else to set up.

## Project structure

```
index.html                  entry point, all 4 screens (menu/lobby/game/results)
style.css                   all UI styling
src/
  main.js                   keyboard input, button wiring, the render loop
  game.js                   core game state, tag logic, round flow
  network.js                Trystero networking wrapper
  car.js                    car physics (drift model) + low-poly 3D model
  scene.js                  Three.js scene, chase camera, arena, lighting
  particles.js              drift smoke / tag-burst effects
  minimap.js                top-down minimap overlay
  ui.js                     all DOM manipulation, isolated from game logic
  constants.js              tunables — colors, tag radius, round durations
lib/
  three.module.min.js       vendored Three.js r185 (MIT)
  trystero-nostr.min.js     vendored Trystero, nostr strategy (MIT), bundled
                            with esbuild so there's nothing to npm install
```

## Tuning

Everything gameplay-relevant is centralized so it's easy to nudge:

- `src/car.js` → the `PHYSICS` object: top speed, acceleration, drift grip,
  turn rate, how boosted rotation feels mid-drift.
- `src/constants.js`: player color palette, tag radius, post-tag immunity
  window, round durations, network update rate.

## Known limitations (v1)

- **No host migration.** If the host leaves the lobby, remaining players
  can't start a new round until everyone jumps into a fresh room. Fine for
  a casual session, worth knowing.
- **Keyboard only.** No on-screen touch controls yet — great on a
  Chromebook/laptop, less so on a phone.
- **No audio yet.**
- Car-vs-car bumps are a light local approximation rather than physically
  synced, so a collision may look very slightly different on two players'
  screens. Tag detection itself doesn't depend on this and is unaffected.
- I built and syntax-checked everything carefully, including a DOM test
  against the real HTML, but couldn't test actual gameplay in a live
  browser from this environment (no browser/WebGL/WebRTC runtime here).
  Steering follows the standard convention and should feel right, but if
  left/right ever feels swapped, it's a one-line fix: flip the sign in the
  `steer` line inside `readInput()` in `src/main.js`.

## Ideas for next steps

- Touch controls for mobile/tablet
- Power-ups (speed boost, shrinking arena)
- More arenas
- Sound effects and music
- A "spectate until next round" view for mid-round joiners
