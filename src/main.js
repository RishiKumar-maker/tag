import { Game } from './game.js'
import * as ui from './ui.js'
import { preloadModels, getCarTypes } from './carLibrary.js'
import { CarPreview } from './carPreview.js'
import { ABILITY_TYPES } from './abilities.js'

const game = new Game()
preloadModels() // fetch the GLB car in the background as early as possible

// ---------------- keyboard input ----------------
const keys = new Set()
const DRIVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE']

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (ui.getCurrentScreen() === 'game' && DRIVE_KEYS.includes(e.code)) e.preventDefault()
  if (e.code === 'KeyE' && ui.getCurrentScreen() === 'game' && !e.repeat) game.useAbility()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

function readInput() {
  const up = keys.has('KeyW') || keys.has('ArrowUp') || touchState.forward
  const down = keys.has('KeyS') || keys.has('ArrowDown') || touchState.reverse
  const left = keys.has('KeyA') || keys.has('ArrowLeft') || touchState.left
  const right = keys.has('KeyD') || keys.has('ArrowRight') || touchState.right
  const drift = keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || touchState.drift
  return {
    throttle: (up ? 1 : 0) - (down ? 1 : 0),
    steer: (left ? 1 : 0) - (right ? 1 : 0),
    drift,
  }
}

// ---------------- touch controls ----------------
const touchState = { left: false, right: false, forward: false, reverse: false, drift: false }

const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
if (hasTouch) document.body.classList.add('has-touch')

function bindHoldButton(id, key) {
  const btn = document.getElementById(id)
  const press = (e) => {
    e.preventDefault()
    if (e.pointerId != null) btn.setPointerCapture(e.pointerId)
    touchState[key] = true
    btn.classList.add('pressed')
  }
  const release = () => {
    touchState[key] = false
    btn.classList.remove('pressed')
  }
  btn.addEventListener('pointerdown', press)
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  btn.addEventListener('pointerleave', release)
}

bindHoldButton('btn-touch-left', 'left')
bindHoldButton('btn-touch-right', 'right')
bindHoldButton('btn-touch-accel', 'forward')
bindHoldButton('btn-touch-reverse', 'reverse')
bindHoldButton('btn-touch-drift', 'drift')

document.getElementById('btn-touch-use').addEventListener('pointerdown', (e) => {
  e.preventDefault()
  game.useAbility()
})

// ---------------- fullscreen ----------------
const fullscreenBtn = document.getElementById('btn-fullscreen')
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {})
  } else {
    document.exitFullscreen?.()
  }
})
document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.textContent = document.fullscreenElement ? '⤢' : '⛶'
})

// ---------------- car picker ----------------
const carTypes = getCarTypes()
let carIndex = 0
const carNameEl = document.getElementById('car-name')
const PREVIEW_COLOR = 0xff8c69

let carPreview = null
try {
  carPreview = new CarPreview(document.getElementById('car-preview-canvas'))
} catch (e) {
  console.warn('Car preview unavailable (no WebGL) -- car selection still works without the live preview.', e)
}

function updateCarPreview() {
  const type = carTypes[carIndex]
  if (!carPreview) {
    carNameEl.textContent = type.name
    return
  }
  carNameEl.textContent = 'Loading…'
  carPreview.setCar(type.id, PREVIEW_COLOR)
    .then(() => { carNameEl.textContent = type.name })
    .catch(() => { carNameEl.textContent = type.name })
}

document.getElementById('btn-car-prev').addEventListener('click', () => {
  carIndex = (carIndex - 1 + carTypes.length) % carTypes.length
  updateCarPreview()
})
document.getElementById('btn-car-next').addEventListener('click', () => {
  carIndex = (carIndex + 1) % carTypes.length
  updateCarPreview()
})
updateCarPreview()

function getSelectedCarType() {
  return carTypes[carIndex].id
}

// ---------------- how to play ----------------
const helpOverlay = document.getElementById('help-overlay')
const helpAbilityList = document.getElementById('help-ability-list')
for (const a of ABILITY_TYPES) {
  const li = document.createElement('li')
  const strong = document.createElement('strong')
  strong.textContent = a.name
  li.appendChild(strong)
  li.appendChild(document.createTextNode(' — ' + a.hint))
  helpAbilityList.appendChild(li)
}

function openHelp() {
  helpOverlay.classList.remove('hidden')
}
function closeHelp() {
  helpOverlay.classList.add('hidden')
}
document.getElementById('btn-how-to-play').addEventListener('click', openHelp)
document.getElementById('btn-how-to-play-lobby').addEventListener('click', openHelp)
document.getElementById('btn-close-help').addEventListener('click', closeHelp)
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay) closeHelp()
})
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !helpOverlay.classList.contains('hidden')) closeHelp()
})

// ---------------- menu screen ----------------
const nameInput = document.getElementById('input-name')
const codeInput = document.getElementById('input-room-code')

document.getElementById('btn-create').addEventListener('click', () => {
  game.createRoom(ui.getNameInput(), getSelectedCarType())
})
document.getElementById('btn-join').addEventListener('click', () => {
  game.joinRoom(ui.getNameInput(), ui.getCodeInput(), getSelectedCarType())
})
document.getElementById('btn-practice').addEventListener('click', () => {
  game.startPractice(ui.getNameInput(), getSelectedCarType())
})
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-create').click()
})
codeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click()
})

// pre-fill room code when opened from a shared invite link
const prefillRoom = new URLSearchParams(location.search).get('room')
if (prefillRoom) {
  codeInput.value = prefillRoom.toUpperCase()
  nameInput.focus()
}

// ---------------- lobby screen ----------------
document.getElementById('btn-copy-link').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?room=${game.roomCode}`
  try {
    await navigator.clipboard.writeText(url)
    ui.toast('Invite link copied!')
  } catch (e) {
    ui.toast(url)
  }
})
document.querySelectorAll('#mode-segmented .segment').forEach((btn) => {
  btn.addEventListener('click', () => game.setMode(btn.dataset.mode))
})
document.getElementById('btn-start').addEventListener('click', () => game.startRound())
document.getElementById('btn-leave-lobby').addEventListener('click', () => game.leaveToMenu())

// ---------------- game screen ----------------
document.getElementById('btn-leave-game').addEventListener('click', () => game.leaveToMenu())

// ---------------- results screen ----------------
document.getElementById('btn-play-again').addEventListener('click', () => game.playAgain())
document.getElementById('btn-leave-results').addEventListener('click', () => game.leaveToMenu())

// ---------------- main loop ----------------
let lastTime = performance.now()
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05)
  lastTime = now
  const screen = ui.getCurrentScreen()
  if (screen === 'game') {
    game.tick(dt, readInput())
  } else if (screen === 'menu' && carPreview) {
    carPreview.render(dt)
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
