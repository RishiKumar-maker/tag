const el = (id) => document.getElementById(id)

const screens = {
  menu: el('screen-menu'),
  lobby: el('screen-lobby'),
  game: el('screen-game'),
  results: el('screen-results'),
}

let currentScreen = 'menu'

export function showScreen(name) {
  currentScreen = name
  for (const key in screens) {
    screens[key].classList.toggle('active', key === name)
  }
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
}

export function setModeUI(mode, isHost) {
  const seg = el('mode-segmented')
  seg.querySelectorAll('.segment').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode)
  })
  seg.classList.toggle('readonly', !isHost)
  el('mode-desc').textContent = MODE_DESCRIPTIONS[mode] || ''
}

export function setStartControls(canStart, isHost) {
  el('btn-start').classList.toggle('hidden', !isHost)
  el('btn-start').disabled = !canStart
  el('lobby-wait-text').classList.toggle('hidden', isHost)
}

export function setHudMode(label) {
  el('hud-mode-badge').textContent = label
}

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
