// On-screen controls for touch devices, with a layout the player arranges
// themselves: drag any button anywhere, resize each one, set opacity, or start
// from a preset. The layout is saved per orientation in localStorage.
//
// Positions are stored as fractions of the screen (x from the left, y from the
// top, of the button's CENTRE), so a saved layout survives different phone sizes.

const STORE_KEY = 'drift-tag-arena:touch-layout:v1'
const IDS = ['accel', 'reverse', 'left', 'right', 'drift', 'use']
const HOLD_KEYS = { accel: 'forward', reverse: 'reverse', left: 'left', right: 'right', drift: 'drift' }
const SCALE_MIN = 0.6
const SCALE_MAX = 1.7
const EDGE = 6 // px kept clear around the screen edge

/** Read by main.js's readInput() every frame. */
export const touchState = { left: false, right: false, forward: false, reverse: false, drift: false }

// ------------------------------------------------------------------ layouts

const btn = (x, y, s = 1) => ({ x, y, s })

const CLASSIC = {
  // spacing chosen so buttons never touch down to a 568x320 phone (the smallest common landscape size)
  landscape: {
    use: btn(0.07, 0.46), accel: btn(0.07, 0.65), reverse: btn(0.07, 0.87),
    drift: btn(0.9, 0.66), left: btn(0.8, 0.87), right: btn(0.93, 0.87),
  },
  portrait: {
    use: btn(0.17, 0.67), accel: btn(0.17, 0.77), reverse: btn(0.17, 0.89),
    drift: btn(0.78, 0.75), left: btn(0.62, 0.9), right: btn(0.86, 0.9),
  },
}

/** Left-handed / thumb-swapped: steering on the left, pedals on the right.
 * Mirrors every x, then swaps left/right so "left" stays on the left. */
function mirrored(layout) {
  const out = {}
  for (const o of ['landscape', 'portrait']) {
    out[o] = {}
    for (const id of IDS) out[o][id] = btn(1 - layout[o][id].x, layout[o][id].y, layout[o][id].s)
    const lx = out[o].left.x
    out[o].left.x = out[o].right.x
    out[o].right.x = lx
  }
  return out
}

const PRESETS = { classic: CLASSIC, swapped: mirrored(CLASSIC) }
const clone = (v) => JSON.parse(JSON.stringify(v))
const clampNum = (v, lo, hi, fallback) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)

function freshLayout(preset = 'classic') {
  return { opacity: 0.85, ...clone(PRESETS[preset]) }
}

/** Accept only well-formed saved data; anything odd falls back to the default for that button. */
function sanitize(raw) {
  const out = freshLayout()
  if (!raw || typeof raw !== 'object') return out
  out.opacity = clampNum(raw.opacity, 0.35, 1, out.opacity)
  for (const o of ['landscape', 'portrait']) {
    for (const id of IDS) {
      const c = raw[o]?.[id]
      if (!c) continue
      out[o][id] = {
        x: clampNum(c.x, 0, 1, out[o][id].x),
        y: clampNum(c.y, 0, 1, out[o][id].y),
        s: clampNum(c.s, SCALE_MIN, SCALE_MAX, 1),
      }
    }
  }
  return out
}

function loadLayout() {
  try { return sanitize(JSON.parse(localStorage.getItem(STORE_KEY))) } catch (e) { return freshLayout() }
}

function saveLayout() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(layout)) } catch (e) { /* private mode: layout just won't persist */ }
}

// -------------------------------------------------------------------- state

let layout = loadLayout()
let draft = null // working copy while the editor is open
let editing = false
let selectedId = null
let drag = null // { id, pointerId, dx, dy }
let onUse = () => {}
let container = null
const els = {}

const orientation = () => (window.innerHeight > window.innerWidth ? 'portrait' : 'landscape')
const current = () => (editing ? draft : layout)

let probe = null
function safeInsets() {
  if (!probe) {
    probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'
    document.body.appendChild(probe)
  }
  const cs = getComputedStyle(probe)
  return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 }
}

/** Keep a button of size w*h fully on screen, clear of notches and (while editing) the toolbar. */
function clampCentre(cx, cy, w, h) {
  const inset = safeInsets()
  const topLimit = editing ? (els.panel?.getBoundingClientRect().bottom || 0) : 0
  const minY = Math.max(inset.top, topLimit) + h / 2 + EDGE
  return {
    x: Math.min(window.innerWidth - inset.right - w / 2 - EDGE, Math.max(inset.left + w / 2 + EDGE, cx)),
    y: Math.min(window.innerHeight - inset.bottom - h / 2 - EDGE, Math.max(minY, cy)),
  }
}

/** Place every button from the active layout. Needs the container visible to measure. */
export function applyLayout() {
  const set = current()
  const L = set[orientation()]
  container.style.setProperty('--tc-opacity', String(set.opacity))
  for (const id of IDS) {
    const el = els[id]
    el.style.setProperty('--s', String(L[id].s))
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (!w || !h) continue // hidden (not in a game or editor right now)
    const p = clampCentre(L[id].x * window.innerWidth, L[id].y * window.innerHeight, w, h)
    el.style.left = `${p.x}px`
    el.style.top = `${p.y}px`
  }
}

// ------------------------------------------------------------ hold buttons

export function releaseAll() {
  for (const key in touchState) touchState[key] = false
  for (const id of IDS) els[id]?.classList.remove('pressed')
}

function bindButton(id) {
  const el = els[id]
  const key = HOLD_KEYS[id]

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (e.pointerId != null) el.setPointerCapture(e.pointerId)
    if (editing) return beginDrag(e, id)
    if (key) {
      touchState[key] = true
      el.classList.add('pressed')
    } else {
      el.classList.add('pressed')
      onUse()
    }
  })

  const release = (e) => {
    if (editing) {
      if (drag && e.pointerId === drag.pointerId) drag = null
      return
    }
    if (key) touchState[key] = false
    el.classList.remove('pressed')
  }
  el.addEventListener('pointerup', release)
  el.addEventListener('pointercancel', release)
  el.addEventListener('lostpointercapture', release)
  el.addEventListener('pointermove', (e) => { if (editing) moveDrag(e) })
  el.addEventListener('contextmenu', (e) => e.preventDefault())
}

// ------------------------------------------------------------------- editor

function beginDrag(e, id) {
  const r = els[id].getBoundingClientRect()
  drag = { id, pointerId: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) }
  select(id)
}

function moveDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return
  const el = els[drag.id]
  const p = clampCentre(e.clientX - drag.dx, e.clientY - drag.dy, el.offsetWidth, el.offsetHeight)
  el.style.left = `${p.x}px`
  el.style.top = `${p.y}px`
  const c = draft[orientation()][drag.id]
  c.x = p.x / window.innerWidth
  c.y = p.y / window.innerHeight
}

function select(id) {
  selectedId = id
  for (const k of IDS) els[k].classList.toggle('selected', k === id)
  const slider = els.size
  slider.disabled = !id
  els.sizeRow.classList.toggle('disabled', !id)
  if (id) {
    const pct = Math.round(draft[orientation()][id].s * 100)
    slider.value = String(pct)
    els.sizeValue.textContent = `${pct}%`
  } else {
    els.sizeValue.textContent = '—'
  }
}

function refreshEditorLabels() {
  const o = orientation()
  els.orientNote.textContent = o === 'landscape'
    ? 'Editing the landscape layout. Rotate your phone to edit the portrait one.'
    : 'Editing the portrait layout. Rotate your phone to edit the landscape one.'
  const op = Math.round(draft.opacity * 100)
  els.opacity.value = String(op)
  els.opacityValue.textContent = `${op}%`
}

export function openEditor() {
  draft = clone(layout)
  editing = true
  releaseAll()
  document.body.classList.add('editing-controls')
  els.editor.classList.remove('hidden')
  els.panel.classList.remove('hidden')
  select(null)
  refreshEditorLabels()
  requestAnimationFrame(applyLayout)
}

function closeEditor(save) {
  if (save) {
    layout = sanitize(draft)
    saveLayout()
  }
  editing = false
  draft = null
  drag = null
  document.body.classList.remove('editing-controls')
  els.editor.classList.add('hidden')
  els.panel.classList.add('hidden')
  applyLayout()
}

function applyPreset(name) {
  draft = { opacity: draft.opacity, ...clone(PRESETS[name]) }
  select(null)
  applyLayout()
}

// --------------------------------------------------------------------- init

export function initTouchControls({ onUse: useHandler }) {
  onUse = useHandler
  container = document.getElementById('touch-controls')
  for (const id of IDS) els[id] = document.getElementById(`btn-touch-${id}`)
  Object.assign(els, {
    editor: document.getElementById('controls-editor'),
    panel: document.getElementById('controls-editor-panel'),
    size: document.getElementById('ctl-size'),
    sizeValue: document.getElementById('ctl-size-value'),
    sizeRow: document.getElementById('ctl-size-row'),
    opacity: document.getElementById('ctl-opacity'),
    opacityValue: document.getElementById('ctl-opacity-value'),
    orientNote: document.getElementById('ctl-orient-note'),
  })
  IDS.forEach(bindButton)

  els.size.addEventListener('input', () => {
    if (!selectedId) return
    const s = clampNum(Number(els.size.value) / 100, SCALE_MIN, SCALE_MAX, 1)
    draft[orientation()][selectedId].s = s
    els.sizeValue.textContent = `${Math.round(s * 100)}%`
    applyLayout()
  })
  els.opacity.addEventListener('input', () => {
    draft.opacity = clampNum(Number(els.opacity.value) / 100, 0.35, 1, 0.85)
    els.opacityValue.textContent = `${Math.round(draft.opacity * 100)}%`
    applyLayout()
  })
  document.getElementById('btn-ctl-classic').addEventListener('click', () => applyPreset('classic'))
  document.getElementById('btn-ctl-swapped').addEventListener('click', () => applyPreset('swapped'))
  document.getElementById('btn-ctl-reset').addEventListener('click', () => applyPreset('classic'))
  document.getElementById('btn-ctl-cancel').addEventListener('click', () => closeEditor(false))
  document.getElementById('btn-ctl-save').addEventListener('click', () => closeEditor(true))
  els.editor.addEventListener('pointerdown', (e) => { if (e.target === els.editor) select(null) })

  const relayout = () => {
    if (editing) refreshEditorLabels()
    requestAnimationFrame(applyLayout)
  }
  window.addEventListener('resize', relayout)
  window.addEventListener('orientationchange', relayout)
  window.addEventListener('blur', releaseAll)
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll() })
  applyLayout()
}
