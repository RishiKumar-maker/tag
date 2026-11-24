import { MAPS } from './maps.js'
import { TEAMS } from './soccerLayout.js'
const el = (id) => document.getElementById(id)

const screens = {
  menu: el('screen-menu'),
  lobby: el('screen-lobby'),
  game: el('screen-game'),
  results: el('screen-results'),
}

let currentScreen = 'menu'
const screenListeners = []
document.body.dataset.screen = currentScreen // CSS hooks (touch layer, sound button) key off this

export function showScreen(name) {
  currentScreen = name
  document.body.dataset.screen = name
  for (const key in screens) {
    screens[key].classList.toggle('active', key === name)
  }
  screenListeners.forEach((fn) => fn(name))
}

/** Run `fn(screenName)` after every screen change. */
export function onScreenChange(fn) {
  screenListeners.push(fn)
}

export function getCurrentScreen() {
  return currentScreen
}

let toastTimer = null
export function toast(msg, ms = 2400) {
  const t = el('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), ms)
}

export function getNameInput() {
  return el('input-name').value.trim().slice(0, 16)
}
export function getCodeInput() {
  return el('input-room-code').value.trim().toUpperCase()
}
export function setMenuHint(msg) {
  el('menu-hint').textContent = msg || ''
}

export function setLobbyRoomCode(code) {
  el('lobby-room-code').textContent = code
}

export function renderPlayerList(players, localId, hostId) {
  const list = el('player-list')
  list.innerHTML = ''
  for (const p of players) {
    const row = document.createElement('div')
    row.className = 'player-chip'

    const dot = document.createElement('span')
    dot.className = 'player-dot'
    dot.style.background = p.color

    const name = document.createElement('span')
    name.className = 'player-name'
    name.textContent = p.name

    row.appendChild(dot)
    row.appendChild(name)

    if (p.id === hostId) {
      const tag = document.createElement('span')
      tag.className = 'player-host-tag'
      tag.textContent = 'HOST'
      row.appendChild(tag)
    }
    if (p.id === localId) {
      const tag = document.createElement('span')
      tag.className = 'player-you-tag'
      tag.textContent = 'YOU'
      row.appendChild(tag)
    }
    list.appendChild(row)
  }
}

const MODE_DESCRIPTIONS = {
  classic: "One chaser. Get tagged, you're it.",
  infection: 'Tagged players join the chase. Last one standing wins.',
  soccer: 'Two teams, one big ball. Knock it into their goal. 3 minutes, then sudden-death overtime. Played on the Stadium.',
}

export function setModeUI(mode, isHost) {
  const seg = el('mode-segmented')
  seg.querySelectorAll('.segment').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode)
  })
  seg.classList.toggle('readonly', !isHost)
  el('mode-desc').textContent = MODE_DESCRIPTIONS[mode] || ''
}

export function setMapUI(mapId, isHost, locked = false) {
  const seg = el('map-segmented')
  seg.querySelectorAll('.segment').forEach((btn) => btn.classList.toggle('active', btn.dataset.map === mapId))
  seg.classList.toggle('readonly', !isHost || locked) // locked: Car Soccer only plays on the stadium
  el('map-desc').textContent = MAPS[mapId] ? `${MAPS[mapId].name}. ${MAPS[mapId].blurb}` : ''
}

/** The menu's practice-map picker (local only; nothing to sync). */
export function setPracticeMapUI(mapId) {
  el('practice-map-segmented').querySelectorAll('.segment').forEach((btn) => btn.classList.toggle('active', btn.dataset.map === mapId))
}

export function setStartControls(canStart, isHost) {
  el('btn-start').classList.toggle('hidden', !isHost)
  el('btn-start').disabled = !canStart
  el('lobby-wait-text').classList.toggle('hidden', isHost)
}

export function setHudMode(label) {
  el('hud-mode-badge').textContent = label
}

const SPEEDO_ARC_LENGTH = 125.7
export function setSpeedometer(fraction, displayValue) {
  const clamped = Math.max(0, Math.min(1, fraction))
  el('speedo-fill').style.strokeDashoffset = String(SPEEDO_ARC_LENGTH * (1 - clamped))
  el('speedo-number').textContent = String(Math.round(displayValue))
}

export function setInventory(name) {
  const slot = el('inventory-slot')
  el('inventory-label').textContent = name || 'No item'
  slot.classList.toggle('has-item', !!name)
}

/** Practice has no timer and no minimap, since there's no round and no one else. */
export function setPracticeHud(isPractice) {
  el('hud-timer').classList.toggle('hidden', isPractice)
  el('minimap').parentElement.classList.toggle('hidden', isPractice)
}

let lastTimerText = ''
export function setHudTimer(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  const text = `${m}:${s.toString().padStart(2, '0')}`
  if (text !== lastTimerText) {
    el('hud-timer').textContent = text
    lastTimerText = text
  }
}

let lastBannerText = ''
export function setStatusBanner(text, variant) {
  const b = el('status-banner')
  if (text !== lastBannerText) {
    b.textContent = text
    lastBannerText = text
  }
  b.className = 'status-banner' + (text ? ' show' : '') + (variant ? ' ' + variant : '')
}

export function setResults({ title, rows, isHost }) {
  el('results-title').textContent = title
  const list = el('results-list')
  list.innerHTML = ''
  rows.forEach((r, i) => {
    const row = document.createElement('div')
    row.className = 'result-row'

    const rank = document.createElement('span')
    rank.className = 'result-rank'
    rank.textContent = '#' + (i + 1)

    const dot = document.createElement('span')
    dot.className = 'player-dot'
    dot.style.background = r.color

    const name = document.createElement('span')
    name.className = 'result-name'
    name.textContent = r.name

    const detail = document.createElement('span')
    detail.className = 'result-detail'
    detail.textContent = r.detail || ''

    row.appendChild(rank)
    row.appendChild(dot)
    row.appendChild(name)
    row.appendChild(detail)
    list.appendChild(row)
  })
  el('btn-play-again').classList.toggle('hidden', !isHost)
  el('results-wait-text').classList.toggle('hidden', isHost)
}

export function getMinimapCanvas() {
  return el('minimap')
}
export function getGameCanvas() {
  return el('game-canvas')
}

// ---------------------------------------------------------------- Car Soccer HUD

/** Turn the soccer HUD (scoreboard, ball-cam button) on or off. */
export function setSoccerHud(on, { practice = false } = {}) {
  document.body.classList.toggle('mode-soccer', on)
  el('scoreboard').classList.toggle('hidden', !on)
  if (on) {
    el('sb-dot-a').style.background = TEAMS[0].css
    el('sb-dot-b').style.background = TEAMS[1].css
    lastScoreboard = ''
  }
}

let lastScoreboard = ''
export function setScoreboard({ a, b, clock, mine }) {
  const key = `${a}|${b}|${clock}|${mine}`
  if (key === lastScoreboard) return
  lastScoreboard = key
  el('sb-score-a').textContent = String(a)
  el('sb-score-b').textContent = String(b)
  el('sb-clock').textContent = clock
  el('sb-team-a').classList.toggle('mine', mine === 0)
  el('sb-team-b').classList.toggle('mine', mine === 1)
}

export function setBallCamActive(on) {
  const b = el('btn-ballcam')
  b.classList.toggle('active', on)
  b.setAttribute('aria-pressed', String(on))
}

let bannerTimer = null
/** The big message in the middle of the screen: countdown digits, GOAL!, OVERTIME.
 * Pass ms to have it clear itself; '' clears it now. */
export function setCenterBanner(text, variant, sub = '', ms = 0) {
  const b = el('center-banner')
  clearTimeout(bannerTimer)
  el('center-banner-text').textContent = text
  el('center-banner-sub').textContent = sub
  b.className = 'center-banner' + (text ? ' show ' + (variant || '') : '')
  if (text && ms) bannerTimer = setTimeout(() => setCenterBanner('', ''), ms)
}
