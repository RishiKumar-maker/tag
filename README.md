# Drift Tag Arena

A cozy low-poly 3D multiplayer car tag game. No server, no build step, no
npm install required to run it — just static files you can deploy straight
to GitHub Pages.

## Play

- **WASD** or **Arrow keys** — drive
- **Space** or **Shift** — drift (hold it while turning)
- One player creates a room and shares the invite link/code; friends open
  it and join. 2–8 players works best.
- Three modes: **Classic** (one chaser, tag passes on), **Infection**
  (tagged players join the chase, last survivor wins) and **Car Soccer**
  (below). The host picks the mode each round from the lobby.
- **Car Soccer**: two teams (Coral and Sky, assigned at random and kept
  balanced) drive a big ball into the other team's goal on the Soccer
  Stadium. Three minutes, then sudden-death overtime if it's level; each
  goal is followed by a celebration and a 3-2-1 kickoff where everyone
  returns to their half. Cars are painted in their team colour with a team
  ring, and a scoreboard shows the score, the clock and which team is
  yours. There's a **ball cam** (button in the HUD or the `B` key; on by
  default) that swings the camera to keep the ball in view. Mint **boost
  pads** around the pitch give a short speed burst and recharge after six
  seconds. No power-ups or tagging in this mode. The ball rolls on the
  ground: this is a flat drive-around game, so there are no jumps or
  aerials. The results screen shows the winning team first, with goals
  (and own goals) per player. **Practice Solo on the Stadium** is a
  training pitch: you, the ball and both goals, with goals counted and the
  ball re-spotted after each.
- **Three maps.** The host picks one in the lobby (every player loads the
  host's choice with the round; Car Soccer forces the Stadium):
  - **Meadow Arena**: a wide-open round field with trees and rocks. Big,
    sweeping drifts.
  - **Harbor Yard**: a golden-hour container port, 96 x 68 with a
    rectangular boundary. Sixteen shipping containers make lanes and tight
    slots (all at least 4.75 wide) around a central roundabout, with cranes,
    a moored ship, lamps and barrels for scenery. It's mirror-symmetric, so
    neither end favours the chaser. Built for cutting corners and flicking
    drifts through gaps.
  - **Soccer Stadium**: a floodlit 104 x 64 pitch with rounded corners, a
    goal at each end (framed in its team's colour), stands with a crowd,
    floodlight towers and eight boost pads. Home of Car Soccer, but tag
    modes can be played here too (a big open pitch, no items).
- **Practice Solo**, on the menu screen, drops you straight into a map of
  your choice alone, no room or second player needed. No timer, no chaser,
  just the map and your car. Good for testing drift feel or your
  connection/specs before inviting anyone.
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
- **Touch controls** appear automatically on phones/tablets, and **players
  arrange them themselves**: **Edit controls** on the menu/lobby opens a
  layout editor where you drag any button anywhere, resize each one,
  change opacity, or start from a *Classic* (pedals left, steering right)
  or *Swapped* (steering left, pedals right) preset. Layouts are saved on
  the device, separately for landscape and portrait. Keyboard and touch
  both work at once, so a touchscreen Chromebook gets both for free.
  Desktop browsers never see the buttons (add `?touch` to the URL to force
  them on for testing). A fullscreen button appears in the top HUD in
  landscape.
- **Drift animations**: the body rolls out of turns and pitches under
  braking/acceleration, wheels roll (rear wheels over-spin mid-drift),
  front wheels counter-steer into the slide, tyres leave fading skid
  marks, and smoke plus colour-changing sparks build the longer you hold a
  drift (cosmetic only, no gameplay effect). The camera widens its FOV with
  speed and swings toward the direction of travel while sliding. Other
  players' cars animate the same way, inferred from their network
  positions. Players with `prefers-reduced-motion` get a toned-down version.
- **Sound** is fully wired in but ships with no audio files: 24 named
  slots (engine, tyre squeal, power-ups, tags, bumps, UI, music) that stay
  silent until you drop files into `assets/audio/`. **See
  `SOUND_GUIDE.md`.**
- **Power-ups**: floating item boxes are scattered around the arena.
  Driving over one grants a random ability (one at a time) — press **E**
  (or the on-screen **USE** button) to activate it:
  - *Oil Slick* — drops a hazard behind you; driving over it costs grip.
  - *Shockwave* — briefly stuns everyone near your own car.
  - *Boost* — a few seconds of extra speed.
  - *Homing Shot* — a slow seeking shot that briefly stuns on a hit.
  - *Shield* — blocks the next hostile effect, and doubles as
    tag-immunity — you can't be tagged while it's active.

  Every power-up has its own 3D model in `assets/models/abilities/`
  (generated by `tools/make_ability_models.py`): a puddle, an expanding
  shockwave ring, twin exhaust flames, a homing missile, a faceted shield
  bubble that blinks before it expires, and the "?" item box.

  Item boxes are part of each map's data (a map calls `scene._addItemBox(x, z)`
  for each one), so a map can define any set, or none at all, without
  touching the ability logic.

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

### How Car Soccer stays in sync

There's no server, so the **host referees**: it runs the match clock and decides
goals, and it broadcasts the ball's position and velocity about 15 times a
second. Every player also runs their own copy of the ball between those
updates and eases it toward the host's. Your own kicks are applied instantly on
your screen and reported to the host, so hitting the ball feels immediate
instead of waiting on a round trip. The host checks a reported kick (your car
has to be near the ball, the ball has to be where the host sees it, and the
speed is capped) before adopting it. Like the rest of the game this assumes
friends: a modified client could cheat, and nothing here tries to stop it.

If the host leaves mid-match the match ends for everyone, since the ball and
the clock live there.

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
index.html                  entry point: menu/lobby/game/results screens, touch layer, controls editor
style.css                   all UI styling
SOUND_GUIDE.md              how to add sounds by hand
src/
  main.js                   keyboard input, button wiring, audio unlock, the render loop
  game.js                   core game state, tag logic, round flow, collisions
  network.js                Trystero networking wrapper
  car.js                    car physics (drift model) + mesh assembly + animation hookup
  carAnimation.js           visual-only drift animation: roll, pitch, wheel spin, counter-steer, drift charge
  carLibrary.js             car registry: 3 procedural cars + GLB loading/caching/recoloring
  carPreview.js             the menu's live rotating car preview (own tiny 3D scene)
  driftFx.js                skid marks (one instanced mesh), tyre smoke, drift sparks, for every car
  abilities.js              ability registry + hazard/projectile/shockwave simulation and hit detection
  abilityModels.js          loads the ability GLBs; shield + boost-flame visuals (falls back to plain shapes)
  scene.js                  Three.js scene + shared renderer, chase/drift camera, Meadow Arena, item boxes, map builders
  maps.js                   map registry (names) + boundary and collision maths for circle and box shapes
  harborMap.js              builds Harbor Yard: quay, containers, roundabout, cranes, ship, sky
  harborLayout.js           Harbor Yard's positions as plain data (shared with the tests)
  stadiumMap.js             builds the Soccer Stadium (canvas-drawn pitch, walls, goals, stands) and the ball model
  soccerLayout.js           stadium dimensions, teams, kickoff spots, boost pads (plain data)
  ballPhysics.js            the ball: rolling drag, wall and goal-net bounces, car hits, goal detection (pure)
  soccerMatch.js            Car Soccer's rules as a state machine: countdown, play, goal, overtime (pure)
  soccerGame.js             runs a match in the game: ball, referee, host/guest sync, HUD, boost pads, results
  particles.js              smoke, sparks and tag-burst particle pool
  touchControls.js          on-screen buttons + the drag-to-arrange layout editor and its saved layouts
  audio.js                  Web Audio engine: one-shots, positional sounds, engine/drift loops, music, mute
  soundManifest.js          every sound slot: file name, loudness, when it plays
  minimap.js                top-down minimap overlay
  ui.js                     all DOM manipulation, isolated from game logic
  constants.js              tunables: colors, tag radius, round durations
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
  models/abilities/*.glb    the six power-up models
  audio/                    drop your sound files here (see SOUND_GUIDE.md)
tools/
  make_ability_models.py    regenerates the ability GLBs (Python: trimesh, shapely, mapbox-earcut)
  check-sounds.mjs          lists which sound slots have files; flags misnamed ones (Node)
  test-maps.mjs             checks Harbor Yard's geometry and the collision helpers (Node, no browser)
  test-soccer.mjs           checks the ball physics, goals and match rules incl. overtime (Node, no browser)
```

## Adding more cars

Two ways, both live in `src/carLibrary.js`:

- **Procedural** (cheapest, zero load time): add a new `buildXxx(colorHex)`
  function following the pattern of `buildRoadster`/`buildSport`/`buildTruck`
  — build a `THREE.Group` from primitives and return
  `{ vehicle, wheels, dims }`. Make `wheels` with `buildWheelPivots` so
  they can steer and roll, and give `dims` (via `carDims`) the rear tyre
  positions and exhaust mount so skid marks and boost flames line up.
- **GLB model**: drop the file in `assets/models/`, follow the
  `loadPoliceTemplate`/`buildPolice` pattern — point it at the new file,
  adjust `POLICE_SCALE`/body material name for your model's proportions and
  material naming. Keep models small and low-poly (the police car is ~180KB,
  ~3k triangles — a good target) so load time and frame rate stay solid on
  weak hardware. Name wheel nodes so the pivot code picks them up (see
  `loadPoliceTemplate`). Then add an entry to `CAR_TYPES` and `BUILDERS`.

## Adding a map

1. **Register it** in `MAPS` in `src/maps.js` (id, display name, one-line
   description). The lobby and menu pickers are the only places that list
   maps by hand: add a `data-map` button to the `#map-segmented` and
   `#practice-map-segmented` groups in `index.html`.
2. **Write a builder**, `buildMyMap(scene)`, and register it in
   `MAP_BUILDERS` in `src/scene.js`. See `harborMap.js` for a full example.
   The builder receives the `GameScene` and fills in:
   - `scene.scene`: the three.js scene (background, fog, lights, props)
   - `scene.bounds`: `{ shape: 'circle', radius }`, `{ shape: 'rect', halfX, halfZ }`
     or `{ shape: 'rrect', halfX, halfZ, radius }` (rounded corners)
   - `scene.colliders`: `{ x, z, radius }` circles or `{ x, z, hx, hz }`
     axis-aligned boxes. Cars slide along both.
   - `scene._addItemBox(x, z)`, once per pickup
   - `scene.spawnPoint = (index, count) => ({ x, z, heading })`
   - optionally `followHeight`, `followDistance` and `cameraBounds` (keeps the
     camera inside the walls so one can't hide your car)
3. **Keep it deterministic**: no `Math.random()` while building, since every
   player builds their own copy and they must match exactly. Use fixed
   positions, or the seeded helper the Meadow uses.
4. Put positions in a plain-data module (like `harborLayout.js`) and copy
   `tools/test-maps.mjs` to check that nothing overlaps, every pickup and
   spawn is clear, and the whole map is connected so nobody can be sealed in.

Skid marks use multiply blending, so they work on any ground colour, and the
minimap draws any bounds shape plus box colliders automatically.

## Debugging

- `?debug` in the URL exposes the running game as `window.__game` in the
  console (cars, animator values, ability manager).
- `?touch` forces the on-screen controls on a desktop browser.
- The console's `[audio]` line says which sound slots still have no file.
- In Car Soccer, `__game.soccer` exposes the ball (`.ball`) and the match (`.match`).

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
  can't start a new round until everyone jumps into a fresh room. In Car
  Soccer the match ends immediately, since the host owns the ball. Fine for
  a casual session, worth knowing.
- **Car Soccer ball feel online.** A guest's own kicks feel instant, but a
  kick by someone else shows up after the host's update reaches you (about
  a tenth of a second on a good connection), so balls can nudge slightly
  as the two copies agree.
- **No audio files ship with the game.** The sound system is complete but
  the slots are empty until you add your own (`SOUND_GUIDE.md`). The
  console shows harmless `404` lines for each empty slot.
- Car-vs-car bumps are a light local approximation rather than physically
  synced, so a collision may look very slightly different on two players'
  screens. Tag detection itself doesn't depend on this and is unaffected.
- Remote players' drift visuals (skid marks, roll, sparks) are inferred
  from their ~10 Hz position updates, so they're a touch less crisp than
  your own car's.

## Ideas for next steps

- A fourth map (the registry and the checks in `tools/test-maps.mjs` are ready for it); ideas: a low-grip frozen lake, a multi-level car park
- Car Soccer extras: replays after goals, a kickoff boost-meter, more team sizes and a 2v2 / 3v3 chooser, a ball that can pop up off ramps
- Shrinking-arena power-up
- A "spectate until next round" view for mid-round joiners
- Mini-turbo reward for long drifts (the drift charge levels already exist, cosmetic for now)
