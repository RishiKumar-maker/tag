export const PLAYER_COLORS = [
  0xff8c69, // coral
  0x7fdbb6, // mint
  0xb8a6e0, // lavender
  0xf7d774, // butter yellow
  0x7ec8e3, // sky blue
  0xf4a6c6, // blush pink
  0x9fe0c3, // seafoam
  0xf6b895, // peach
]

export function hexToCss(hex) {
  return '#' + hex.toString(16).padStart(6, '0')
}

export const TAG_RADIUS = 2.15
export const CHASER_IMMUNITY_MS = 1400
export const CHASER_SPEED_MULTIPLIER = 1.18 // chaser gets a top-speed + acceleration edge
export const SPEED_DISPLAY_SCALE = 4.5 // world units/sec -> a dashboard-feeling "km/h" number
export const CLASSIC_DURATION_MS = 3 * 60 * 1000
export const INFECTION_DURATION_MS = 4 * 60 * 1000
export const STATE_SEND_HZ = 18
export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L mixups

export function makeRoomCode(length = 5) {
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)]
  }
  return out
}

export function randomPlayerName() {
  return 'Racer' + Math.floor(100 + Math.random() * 900)
}
