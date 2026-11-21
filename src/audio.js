import { SOUNDS, AUDIO_DIR, AUDIO_EXTENSION } from './soundManifest.js'

// Overall mix. Per-sound loudness lives in soundManifest.js.
const MASTER_VOLUME = 0.9
const SFX_VOLUME = 1
const MUSIC_VOLUME = 1
const HEARING_DISTANCE = 32 // world units; positional sounds are silent beyond this
const STORE_KEY = 'drift-tag-arena:audio:v1'

let ctx = null
let masterGain = null
let sfxBus = null
let musicBus = null
let loadStarted = false
let muted = readStoredMute()
let wantedMusic = null // 'menu' | 'game' | null
let currentMusic = null // { id, source, gain }
let availableCount = 0

const buffers = new Map() // sound id -> AudioBuffer (only files that exist)
const loops = new Map() // sound id -> { source, gain }
const listener = { x: 0, z: 0, heading: 0 }
const readyCallbacks = []

function readStoredMute() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}').muted === true } catch (e) { return false }
}

/** Must run inside a user gesture (browsers block audio until the player
 * taps/clicks/presses something). Safe to call repeatedly. */
export function unlock() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    ctx = new Ctx()
    masterGain = ctx.createGain()
    masterGain.gain.value = muted ? 0 : MASTER_VOLUME
    masterGain.connect(ctx.destination)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = SFX_VOLUME
    sfxBus.connect(masterGain)
    musicBus = ctx.createGain()
    musicBus.gain.value = MUSIC_VOLUME
    musicBus.connect(masterGain)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  if (!loadStarted) {
    loadStarted = true
    loadAll()
  }
}

document.addEventListener('visibilitychange', () => {
  if (!ctx) return
  if (document.hidden) ctx.suspend().catch(() => {})
  else ctx.resume().catch(() => {})
})

async function loadOne(id) {
  const def = SOUNDS[id]
  const url = `${AUDIO_DIR}${def.file || `${id}.${AUDIO_EXTENSION}`}`
  try {
    const res = await fetch(url)
    if (!res.ok) return false // not added yet: that's fine, the slot stays silent
    const data = await res.arrayBuffer()
    buffers.set(id, await ctx.decodeAudioData(data))
    return true
  } catch (e) {
    console.warn(`[audio] "${url}" exists but couldn't be decoded (wrong format or corrupt file?)`, e)
    return false
  }
}

async function loadAll() {
  const ids = Object.keys(SOUNDS)
  const results = await Promise.all(ids.map(loadOne))
  availableCount = results.filter(Boolean).length
  const missing = ids.filter((_, i) => !results[i])
  console.info(`[audio] ${availableCount}/${ids.length} sounds loaded.` + (missing.length ? ` Not added yet: ${missing.join(', ')}` : ''))
  if (availableCount > 0) readyCallbacks.forEach((cb) => cb())
  applyMusic() // music may have been requested before it finished loading
}

/** Called once, when at least one sound file has actually loaded (used to
 * reveal the mute button only when there's something to mute). */
export function onAudioAvailable(cb) {
  if (availableCount > 0) cb()
  else readyCallbacks.push(cb)
}

// ---------------------------------------------------------------- one-shots

function startOneShot(id, { volume = 1, rate = 1, pan = 0 } = {}) {
  const buffer = buffers.get(id)
  if (!ctx || !buffer || muted) return null
  const def = SOUNDS[id]
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * (def.pitch || 0))
  const gain = ctx.createGain()
  gain.gain.value = def.volume * volume
  source.connect(gain)
  if (pan !== 0 && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    gain.connect(panner)
    panner.connect(sfxBus)
  } else {
    gain.connect(sfxBus)
  }
  source.start()
  return source
}

export function play(id, opts) {
  startOneShot(id, opts)
}

/** Positional version for events that happen at (x, z): quieter with
 * distance, panned left/right relative to the way your car faces. */
export function playAt(id, x, z, opts = {}) {
  const dx = x - listener.x
  const dz = z - listener.z
  const dist = Math.hypot(dx, dz)
  if (dist > HEARING_DISTANCE) return
  const falloff = Math.pow(1 - dist / HEARING_DISTANCE, 1.5)
  // screen-right for a car at `heading` is (-cos h, +sin h) in world x/z
  const rightComponent = dist > 0.01 ? (dx * -Math.cos(listener.heading) + dz * Math.sin(listener.heading)) / dist : 0
  startOneShot(id, { ...opts, volume: (opts.volume ?? 1) * Math.max(falloff, 0.12), pan: rightComponent * Math.min(dist / 8, 1) * 0.8 })
}

export function setListener(x, z, heading) {
  listener.x = x
  listener.z = z
  listener.heading = heading
}

// -------------------------------------------------------------------- loops

function ensureLoop(id) {
  let loop = loops.get(id)
  if (loop) return loop
  const buffer = buffers.get(id)
  if (!ctx || !buffer) return null
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(gain)
  gain.connect(sfxBus)
  source.start()
  loop = { source, gain }
  loops.set(id, loop)
  return loop
}

function setLoop(id, level, rate = 1) {
  const loop = level > 0.01 ? ensureLoop(id) : loops.get(id)
  if (!loop) return
  const def = SOUNDS[id]
  const now = ctx.currentTime
  loop.gain.gain.setTargetAtTime(muted ? 0 : level * def.volume, now, 0.06)
  loop.source.playbackRate.setTargetAtTime(rate, now, 0.08)
}

/** Call every frame while you're driving. */
export function updateDriving({ speedFraction, skid, boosted }) {
  if (!ctx) return
  setLoop('engine_loop', 0.35 + 0.65 * speedFraction, 0.75 + speedFraction * 1.0 + (boosted ? 0.15 : 0))
  setLoop('drift_loop', skid, 0.92 + skid * 0.16)
  setLoop('boost_loop', boosted ? 1 : 0, 1)
}

/** Silence the driving loops (round over, left the game). */
export function stopDriving() {
  for (const [id, loop] of loops) {
    loop.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
    const { source } = loop
    setTimeout(() => { try { source.stop() } catch (e) { /* already stopped */ } }, 300)
    loops.delete(id)
  }
}

// -------------------------------------------------------------------- music

/** 'menu' | 'game' | null. Cross-fades; if the file isn't loaded yet it
 * starts as soon as it is. */
export function setMusicScene(scene) {
  wantedMusic = scene
  applyMusic()
}

function applyMusic() {
  if (!ctx) return
  const id = wantedMusic ? `music_${wantedMusic}` : null
  if ((currentMusic?.id || null) === (buffers.has(id) ? id : null)) return

  if (currentMusic) {
    const old = currentMusic
    old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.25)
    setTimeout(() => { try { old.source.stop() } catch (e) { /* already stopped */ } }, 1200)
    currentMusic = null
  }
  if (!id || !buffers.has(id)) return

  const source = ctx.createBufferSource()
  source.buffer = buffers.get(id)
  source.loop = true
  const gain = ctx.createGain()
  gain.gain.value = 0
  source.connect(gain)
  gain.connect(musicBus)
  source.start()
  gain.gain.setTargetAtTime(SOUNDS[id].volume, ctx.currentTime, 0.4)
  currentMusic = { id, source, gain }
}

// --------------------------------------------------------------------- mute

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = !!value
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, ctx.currentTime, 0.05)
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ muted })) } catch (e) { /* private mode */ }
}

export function toggleMuted() {
  setMuted(!muted)
  return muted
}
