// Every sound slot the game knows about. The game already calls all of these;
// a slot with no file in assets/audio/ is just silent. See SOUND_GUIDE.md.
//
//   type    'sfx'   one-shot, plays once each time it happens
//           'loop'  loops while its condition is true (volume/pitch follow the car)
//           'music' background loop, one at a time, cross-faded
//   volume  base loudness 0..1 for this sound, before the player's volume settings
//   pitch   random +-pitch variation per play, so repeats don't sound identical
//   where   true = the sound is positional: quieter and panned by how far/which
//           side the event is from your car (events from other players)

/** File extension for every sound. Change this one line if you use .ogg or .wav. */
export const AUDIO_EXTENSION = 'mp3'
export const AUDIO_DIR = './assets/audio/'

export const SOUNDS = {
  // ---- music ----
  music_menu: { type: 'music', volume: 0.5, when: 'Menu, lobby and results screens', length: '60–120 s, seamless loop', mood: 'Cozy, chill, unhurried' },
  music_game: { type: 'music', volume: 0.4, when: 'During a round', length: '60–120 s, seamless loop', mood: 'Upbeat but not busy, it plays under the engine' },

  // ---- loops ----
  engine_loop: { type: 'loop', volume: 0.45, when: 'Your engine. Pitch rises with speed', length: '1–3 s, seamless loop', mood: 'Steady mid-rev hum, no changes in pitch inside the file' },
  drift_loop: { type: 'loop', volume: 0.5, when: 'Tyre squeal while you slide', length: '1–2 s, seamless loop', mood: 'Steady screech/skid, fades in and out with the slide' },
  boost_loop: { type: 'loop', volume: 0.45, when: 'While Boost is active', length: '1–2 s, seamless loop', mood: 'Rushing flame / jet whoosh' },

  // ---- interface and round flow ----
  ui_click: { type: 'sfx', volume: 0.5, pitch: 0.04, when: 'Any button press', length: '< 0.2 s', mood: 'Soft pop or tick' },
  round_start: { type: 'sfx', volume: 0.8, when: 'A round begins', length: '1–2 s', mood: 'Short "go!" sting' },
  round_end: { type: 'sfx', volume: 0.8, when: 'The results screen appears', length: '1–3 s', mood: 'Finish sting' },
  timer_tick: { type: 'sfx', volume: 0.6, when: 'Each second of the last 10 seconds', length: '< 0.3 s', mood: 'Clock tick / blip' },

  // ---- items and abilities ----
  item_pickup: { type: 'sfx', volume: 0.7, pitch: 0.03, when: 'You drive through an item box', length: '< 0.6 s', mood: 'Bright sparkle / coin' },
  ability_use_oilslick: { type: 'sfx', volume: 0.7, pitch: 0.05, where: true, when: 'Anyone drops an Oil Slick', length: '< 1 s', mood: 'Wet splat' },
  ability_use_shockwave: { type: 'sfx', volume: 0.9, where: true, when: 'Anyone fires a Shockwave', length: '< 1.5 s', mood: 'Deep thump with a rising ring' },
  ability_use_boost: { type: 'sfx', volume: 0.7, where: true, when: 'Anyone activates Boost', length: '< 1 s', mood: 'Ignition whoosh' },
  ability_use_homingshot: { type: 'sfx', volume: 0.7, pitch: 0.04, where: true, when: 'Anyone fires a Homing Shot', length: '< 1 s', mood: 'Missile launch' },
  ability_use_shield: { type: 'sfx', volume: 0.7, where: true, when: 'Anyone raises a Shield', length: '< 1 s', mood: 'Energy bubble up' },
  hit_stun: { type: 'sfx', volume: 0.9, when: 'You get stunned (Shockwave or Homing Shot)', length: '< 1 s', mood: 'Zap / dizzy impact' },
  hit_slip: { type: 'sfx', volume: 0.7, when: 'You drive over an Oil Slick', length: '< 1 s', mood: 'Slippery skid-squelch' },
  shield_block: { type: 'sfx', volume: 0.8, when: 'Your Shield absorbs a hit', length: '< 0.7 s', mood: 'Glassy deflect' },
  shield_end: { type: 'sfx', volume: 0.6, when: 'Your Shield wears off', length: '< 0.7 s', mood: 'Fizzle / power-down' },

  // ---- tag and driving ----
  tag_hit: { type: 'sfx', volume: 0.9, where: true, when: 'Anyone gets tagged', length: '< 1 s', mood: 'Bonk / tag impact' },
  tag_you_are_it: { type: 'sfx', volume: 0.9, when: 'You become the chaser', length: '1–2 s', mood: 'Alarm-y warning sting' },
  bump_car: { type: 'sfx', volume: 0.6, pitch: 0.06, when: 'You bump another car', length: '< 0.6 s', mood: 'Light metal thud' },
  bump_wall: { type: 'sfx', volume: 0.6, pitch: 0.06, when: 'You hit the fence or an obstacle', length: '< 0.6 s', mood: 'Dull crunch / thump' },
  drift_charge: { type: 'sfx', volume: 0.5, when: 'Your drift sparks level up', length: '< 0.5 s', mood: 'Rising "ching"' },
}
