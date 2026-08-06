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
- A **How to Play** button on the menu and lobby screens opens an in-game
  reference for controls, tag rules, and what each ability does — so new
  players don't need to read this file to get going.
- **Pick your car** on the menu screen — a live rotating preview with
  arrows to cycle through it. Three low-poly procedural cars (Roadster,
  Sport Coupe, Big Truck) plus a detailed Police Cruiser model. Your choice
  applies whether you create, join, or practice.
- The **chaser drives faster** than everyone else (top speed and
  acceleration both boosted) — it passes to whoever is "it" automatically,
  in both Classic and Infection.
- A **speedometer** in the bottom-left HUD shows your live speed, always
  relative to your own current top speed (so it still reads sensibly
  whether or not you're currently boosted as the chaser).
- Every car shows a **name tag** floating above it, so you can tell who's
  who at a glance without checking the minimap.
- **Touch controls** appear automatically on phones/tablets — accelerate
  and reverse on the bottom-left, steering on the bottom-right, with drift
  and item-use as smaller buttons above each cluster. Keyboard and touch
  both work at once, so a touchscreen Chromebook gets both for free.
  Desktop/laptop browsers never see the touch buttons. A fullscreen button
  appears in the top HUD when a touch device is in landscape.
- **Power-ups**: floating item boxes are scattered around the arena.
  Driving over one grants a random ability (one at a time) — press **E**
  (or the on-screen **USE** button) to activate it:
  - *Oil Slick* — drops a hazard behind you; driving over it costs grip.
  - *Shockwave* — briefly stuns everyone near your own car.
  - *Boost* — a few seconds of extra speed.
  - *Homing Shot* — a slow seeking shot that briefly stuns on a hit.
  - *Shield* — blocks the next hostile effect, and doubles as
    tag-immunity — you can't be tagged while it's active.

  Item boxes are just part of the arena's data (`scene.js`), the same way
  obstacles are, so a future map can simply define a different set — or
  none at all — without touching any of the ability logic.

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

**Cross-network connectivity**: two peers on the same device or same LAN
can usually connect with just STUN (which is all Trystero configures by
default). Two peers on genuinely different networks — different homes,
one on WiFi and one on mobile data, behind a school/office firewall — often
can't with STUN alone, because at least one side is behind a NAT type it
can't traverse; that needs a TURN relay server as a fallback.

`src/network.js` computes free TURN credentials at connect time (an HMAC
scheme against Metered's `staticauth.openrelay.metered.ca`, no signup, no
backend). Worth knowing honestly: **free, no-signup TURN service is a
genuinely fragile category** — the previous static username/password this
project used got deprecated industry-wide, which is likely why it wasn't
enough on its own. If multiplayer across real networks is still unreliable
after this:

1. Open the browser console (F12) on both devices while stuck in the
   lobby — `src/network.js` now logs each peer's actual connection state
   every few seconds. If a peer never appears in that log at all,
   signaling isn't finding them (rare). If it appears but sits on
   `checking` or reaches `failed`, that's ICE/TURN not completing.
2. **For guaranteed reliability**, get your own free TURN credentials —
   takes about 2 minutes, no credit card: sign up at
   [Metered.ca's TURN server tool](https://dashboard.metered.ca/signup?tool=turnserver),
   grab the API key from your dashboard, and swap it into the
   `TURN_STATIC_AUTH_SECRET`/`TURN_STATIC_AUTH_HOST` constants at the top
   of `src/network.js` (or use their REST credential endpoint directly —
   their dashboard shows the exact snippet). The free tier is 20GB/month,
   far more than a casual game needs.

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
  car.js                    car physics (drift model) + mesh assembly
  carLibrary.js             car registry: 3 procedural cars + GLB loading/caching/recoloring
  carPreview.js             the menu's live rotating car preview (own tiny 3D scene)
  abilities.js              ability registry + hazard/projectile simulation and hit detection
  scene.js                  Three.js scene, chase camera, arena, lighting, item box spawns
  particles.js              drift smoke / tag-burst effects
  minimap.js                top-down minimap overlay
  ui.js                     all DOM manipulation, isolated from game logic
  constants.js              tunables — colors, tag radius, round durations
lib/
  three.module.min.js       vendored Three.js r185 (MIT)
  three.core.min.js         Three.js's core module (r185 splits into two files)
  trystero-nostr.min.js     vendored Trystero, nostr strategy (MIT), bundled
                            with esbuild so there's nothing to npm install
  GLTFLoader.min.js         vendored Three.js's GLTF loader addon (MIT),
                            bundled the same way, sharing the same THREE
                            instance as everything else (no duplicated code)
assets/
  models/police_car.glb     the Police Cruiser model
```

## Adding more cars

Two ways, both live in `src/carLibrary.js`:

- **Procedural** (cheapest, zero load time): add a new `buildXxx(colorHex)`
  function following the pattern of `buildRoadster`/`buildSport`/`buildTruck`
  — build a `THREE.Group` from primitives, return `{ vehicle, wheels }`.
- **GLB model**: drop the file in `assets/models/`, follow the
  `loadPoliceTemplate`/`buildPolice` pattern — point it at the new file,
  adjust `POLICE_SCALE`/body material name for your model's proportions and
  material naming. Keep models small and low-poly (the police car is ~180KB,
  ~3k triangles — a good target) so load time and frame rate stay solid on
  weak hardware. Then add an entry to `CAR_TYPES` and `BUILDERS`.

## Tuning

Everything gameplay-relevant is centralized so it's easy to nudge:

- `src/car.js` → the `PHYSICS` object: top speed, acceleration, drift grip,
  turn rate, how boosted rotation feels mid-drift.
- `src/constants.js`: player color palette, tag radius, post-tag immunity
  window, round durations, network update rate, `CHASER_SPEED_MULTIPLIER`
  (how much faster the chaser is), `SPEED_DISPLAY_SCALE` (speedometer units),
  and the ability block (`STUN_MS`, `SLIP_MS`, `BOOST_MULTIPLIER`,
  `SHIELD_MS`, `SHOCKWAVE_RADIUS`, `PROJECTILE_SPEED`, `ITEM_BOX_RESPAWN_MS`,
  and friends).

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
