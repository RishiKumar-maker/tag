# Adding sounds to Drift Tag Arena

The game has **29 named sound slots** already wired into the code: engine, tyre squeal, every power-up, tags, bumps, Car Soccer (ball hits, goals, kickoff beeps), menu clicks, music. A slot with no file is simply silent, so you can add sounds one at a time, in any order, and **never need to touch the code**.

## The 5-step version

1. **Get a sound** (see [Where to find sounds](#where-to-find-sounds)).
2. **Trim and convert** it to MP3 (see [Preparing a file](#preparing-a-file)).
3. **Name it exactly** like a slot in the tables below: all lowercase, underscores, `.mp3`. Example: `item_pickup.mp3`.
4. **Drop it in** `assets/audio/`.
5. **Hard-refresh the game** (Ctrl+Shift+R, or clear the cache on mobile) and open the browser console (F12). You'll see a line like:

   ```
   [audio] 3/29 sounds loaded. Not added yet: music_menu, music_game, ...
   ```

   That list is your to-do list. If a file you added is in the "not added yet" list, its name is wrong (see [Troubleshooting](#troubleshooting)).

> **Expected noise:** until all 29 are added, the console shows red `404` lines for the missing files. That's normal; those are the empty slots being checked, not errors.

If you have Node installed, `node tools/check-sounds.mjs` prints every slot with a tick or a dot and points out misspelled files.

## Start with these six

If you only add a few, these change the feel the most:

| Slot | Why |
|---|---|
| `engine_loop.mp3` | Makes the car feel alive; its pitch rises with your speed |
| `drift_loop.mp3` | The tyre squeal; its volume follows how hard you're sliding |
| `item_pickup.mp3` | Instant reward feedback |
| `tag_hit.mp3` | The core moment of the game |
| `ui_click.mp3` | Makes every menu feel responsive |
| `music_game.mp3` | Ties the round together |

## All 29 slots

Every file lives in `assets/audio/` and is named exactly as shown.

### Music

| File | Plays when | Length | Feel |
|---|---|---|---|
| `music_menu.mp3` | Menu, lobby and results screens | 60–120 s, seamless loop | Cozy, chill, unhurried |
| `music_game.mp3` | During a round | 60–120 s, seamless loop | Upbeat but not busy, it plays under the engine |

### Looping sounds

| File | Plays when | Length | Feel |
|---|---|---|---|
| `engine_loop.mp3` | Your engine. Pitch rises with speed | 1–3 s, seamless loop | Steady mid-rev hum, no changes in pitch inside the file |
| `drift_loop.mp3` | Tyre squeal while you slide | 1–2 s, seamless loop | Steady screech/skid, fades in and out with the slide |
| `boost_loop.mp3` | While Boost is active | 1–2 s, seamless loop | Rushing flame / jet whoosh |

### One-shot effects

| File | Plays when | Length | Feel |
|---|---|---|---|
| `ui_click.mp3` | Any button press | < 0.2 s | Soft pop or tick |
| `round_start.mp3` | A round begins | 1–2 s | Short "go!" sting |
| `round_end.mp3` | The results screen appears | 1–3 s | Finish sting |
| `timer_tick.mp3` | Each second of the last 10 seconds | < 0.3 s | Clock tick / blip |
| `item_pickup.mp3` | You drive through an item box | < 0.6 s | Bright sparkle / coin |
| `ability_use_oilslick.mp3` | Anyone drops an Oil Slick | < 1 s | Wet splat |
| `ability_use_shockwave.mp3` | Anyone fires a Shockwave | < 1.5 s | Deep thump with a rising ring |
| `ability_use_boost.mp3` | Anyone activates Boost | < 1 s | Ignition whoosh |
| `ability_use_homingshot.mp3` | Anyone fires a Homing Shot | < 1 s | Missile launch |
| `ability_use_shield.mp3` | Anyone raises a Shield | < 1 s | Energy bubble up |
| `hit_stun.mp3` | You get stunned (Shockwave or Homing Shot) | < 1 s | Zap / dizzy impact |
| `hit_slip.mp3` | You drive over an Oil Slick | < 1 s | Slippery skid-squelch |
| `shield_block.mp3` | Your Shield absorbs a hit | < 0.7 s | Glassy deflect |
| `shield_end.mp3` | Your Shield wears off | < 0.7 s | Fizzle / power-down |
| `tag_hit.mp3` | Anyone gets tagged | < 1 s | Bonk / tag impact |
| `tag_you_are_it.mp3` | You become the chaser | 1–2 s | Alarm-y warning sting |
| `bump_car.mp3` | You bump another car | < 0.6 s | Light metal thud |
| `bump_wall.mp3` | You hit the fence or an obstacle | < 0.6 s | Dull crunch / thump |
| `drift_charge.mp3` | Your drift sparks level up | < 0.5 s | Rising "ching" |
| `ball_hit.mp3` | A car hits the ball (louder for harder hits) | < 0.5 s | Solid thump / kick |
| `ball_wall.mp3` | The ball bounces off a wall | < 0.4 s | Soft boing / thud |
| `goal_scored.mp3` | A goal is scored | 2–4 s | Stadium horn plus a crowd cheer |
| `kickoff_beep.mp3` | Each 3, 2, 1 of the kickoff countdown | < 0.3 s | Short clean beep |
| `overtime.mp3` | The match goes to overtime | 1–2 s | Tense rising sting |

**Car Soccer sounds** (`ball_hit`, `ball_wall`, `goal_scored`, `kickoff_beep`, `overtime`) only play in that mode. `ball_hit` gets louder with harder kicks, and, like the power-up sounds, `ball_hit` and `ball_wall` are positional, so you hear other players' kicks quieter and panned toward where they happen. Good starting points: a dull *thump* for `ball_hit`, a soft rubbery *boing* for `ball_wall`, and an air-horn plus crowd roar for `goal_scored` (it plays for every goal, so keep it under about 3 seconds).

**How the types behave**

- **Music** plays one track at a time and cross-fades when you go between menu and game.
- **Looping sounds** run for as long as their condition is true, and the game adjusts them live: `engine_loop` speeds up and gets louder with your speed, `drift_loop` fades in and out with the slide, `boost_loop` is on while boosting. Because the game changes their pitch, record them at a **steady** pitch.
- **One-shots** play once per event, each with a tiny random pitch variation so repeats don't sound identical.
- Events from **other players** (their power-ups and tags) are **positional**: quieter the farther away they are, and panned left or right depending on where they are relative to your car. Beyond about 32 world units they're silent.

## Preparing a file

**Format.** The game expects `.mp3` by default; MP3 plays on every browser including all iPhones. To use `.wav` or `.ogg` for everything instead, change one line in `src/soundManifest.js`:

```js
export const AUDIO_EXTENSION = 'mp3'   // change to 'wav' or 'ogg', and rename your files to match
```

Older iPhones can't play OGG, so stick with MP3 (or WAV) if mobile players matter. To mix formats, give one slot its own file name in `src/soundManifest.js`, for example `engine_loop: { file: 'engine_loop.wav', type: 'loop', ... }`.

**Size.** The whole `assets/audio/` folder downloads when the game loads, so keep it light:

| Kind | Suggested settings | Rough size |
|---|---|---|
| Sound effects | mono, 44.1 kHz, 64–96 kbps | 5–40 KB each |
| Engine / drift / boost loops | mono, 44.1 kHz, 96 kbps | 20–60 KB each |
| Music | stereo, 44.1 kHz, 96–128 kbps | 1–2 MB each |

**Converting with ffmpeg** (free, command line):

```bash
# any sound -> small mono MP3 for effects and loops
ffmpeg -i input.wav -ac 1 -b:a 96k item_pickup.mp3

# music: keep stereo
ffmpeg -i song.wav -b:a 128k music_game.mp3

# trim to the first 0.5 s and fade the end so it doesn't click
ffmpeg -i input.wav -t 0.5 -af "afade=t=out:st=0.4:d=0.1" -ac 1 -b:a 96k tag_hit.mp3

# even out loudness across your sounds (do this to all of them)
ffmpeg -i input.wav -af loudnorm=I=-16:TP=-1.5 -ac 1 -b:a 96k out.mp3
```

Prefer a visual tool? **Audacity** (free) can trim, fade, normalise and export MP3.

**Loudness.** Try to make all your sounds roughly equally loud, then use the `volume` numbers in `src/soundManifest.js` (0 to 1) to balance them, rather than re-exporting files.

**Seamless loops** (`engine_loop`, `drift_loop`, `boost_loop`, both music tracks). A loop must start and end on the same point in the waveform or you'll hear a tick every repeat. In Audacity, cut at zero-crossings and test with *Transport, Loop*. Know that **MP3 files can leave a tiny gap at the loop point** because of how MP3 is encoded. If you hear one, export that single loop as `.wav` and point its slot at it with the `file:` option above.

## Where to find sounds

Always check the licence, and keep a note of what you used in `assets/audio/CREDITS.txt`.

- **Kenney.nl** (Interface Sounds, Impact Sounds, Sci-fi Sounds packs): CC0, no credit needed. Great for clicks, bumps and power-ups.
- **freesound.org**: huge library; filter by *Creative Commons 0* to avoid credit requirements. Search terms: "engine loop", "tire screech loop", "whoosh", "zap".
- **OpenGameArt.org**: check each item, licences vary.
- **Pixabay Sound Effects / Music**: free to use under Pixabay's licence; read it for your use.
- **Make your own:** **jsfxr** (a free in-browser tool; search for "jsfxr") generates retro blips and zaps in a click, ideal for `ui_click`, `item_pickup`, `timer_tick`, `drift_charge`.
- **Music:** CC0 tracks on OpenGameArt or itch.io asset packs; look for ones marked loopable.

Don't rip sounds from other games, films or songs; they're copyrighted.

## Adjusting the mix

- **Per-sound loudness / pitch randomness:** the `volume` and `pitch` numbers in `src/soundManifest.js`.
- **Overall balance:** `MASTER_VOLUME`, `SFX_VOLUME`, `MUSIC_VOLUME` at the top of `src/audio.js`.
- **How far away you can hear other players:** `HEARING_DISTANCE` in `src/audio.js`.
- **How the engine pitch tracks speed:** the numbers in `updateDriving()` in `src/audio.js` (`0.75 + speedFraction * 1.0` is the playback rate).

## The mute button

A speaker button appears (top-right on menus, in the top row during a round) **as soon as at least one sound file loads**, and not before. The choice is remembered on that device.

## Good to know

- Browsers don't allow sound until the player has tapped, clicked or pressed a key once. That's handled automatically; the first interaction wakes the audio up.
- On iPhones, the **silent switch also silences web games**. That's an iOS rule, not a bug.
- Sounds are only loaded once, when the page opens. After adding or replacing a file, hard-refresh.
- The game pauses audio when the tab is in the background.

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| A file I added is still listed as "not added yet" | The name doesn't match exactly. Names are **lowercase** with **underscores**, and GitHub Pages and most servers are **case-sensitive** (`Tag_Hit.MP3` fails, `tag_hit.mp3` works). Check the extension matches `AUDIO_EXTENSION`. Run `node tools/check-sounds.mjs` for hints. |
| The console says a file "couldn't be decoded" | The file is corrupt, or isn't really the format its extension says (renaming `.wav` to `.mp3` doesn't convert it). Re-export it. |
| Nothing plays at all | Tap or click the game once first. Check the device isn't muted or on silent. If you opened `index.html` straight from a folder, browsers block loading the sounds; serve it instead (`python3 -m http.server`, then open `localhost:8000`). |
| Old sounds after replacing a file | Browser cache. Hard-refresh (Ctrl+Shift+R). |
| A tick or gap at each repeat of a loop | See *Seamless loops* above; try a `.wav` for that slot. |
| Engine sounds weird at high speed | The pitch is shifted up to about 1.9 times the original; record the engine loop at a low-to-mid rev so it has room to climb. |
| Too loud or quiet | Lower or raise that slot's `volume` in `src/soundManifest.js`. |

## Adding a brand-new sound slot (optional, a little code)

1. Add a line to `SOUNDS` in `src/soundManifest.js`, for example `my_new_sound: { type: 'sfx', volume: 0.7, when: '...', length: '< 1 s', mood: '...' }`.
2. Drop `my_new_sound.mp3` into `assets/audio/`.
3. In `src/game.js` (or wherever the event happens), add `import * as audio from './audio.js'` if it isn't there, then call `audio.play('my_new_sound')` or, for something happening at a map position, `audio.playAt('my_new_sound', x, z)`.
