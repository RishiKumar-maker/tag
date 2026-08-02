import { Game } from './game.js'
import * as ui from './ui.js'

const game = new Game()

// ---------------- keyboard input ----------------
const keys = new Set()
const DRIVE_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']

window.addEventListener('keydown', (e) => {
  keys.add(e.code)
  if (ui.getCurrentScreen() === 'game' && DRIVE_KEYS.includes(e.code)) e.preventDefault()
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => keys.clear())

function readInput() {
  const up = keys.has('KeyW') || keys.has('ArrowUp')
  const down = keys.has('KeyS') || keys.has('ArrowDown')
  const left = keys.has('KeyA') || keys.has('ArrowLeft')
  const right = keys.has('KeyD') || keys.has('ArrowRight')
  const drift = keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight')
  return {
    throttle: (up ? 1 : 0) - (down ? 1 : 0),
    steer: (left ? 1 : 0) - (right ? 1 : 0),
    drift,
  }
}

// ---------------- menu screen ----------------
const nameInput = document.getElementById('input-name')
const codeInput = document.getElementById('input-room-code')

document.getElementById('btn-create').addEventListener('click', () => {
  game.createRoom(ui.getNameInput())
})
document.getElementById('btn-join').addEventListener('click', () => {
  game.joinRoom(ui.getNameInput(), ui.getCodeInput())
})
document.getElementById('btn-practice').addEventListener('click', () => {
  game.startPractice(ui.getNameInput())
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
  if (ui.getCurrentScreen() === 'game') {
    game.tick(dt, readInput())
  }
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
