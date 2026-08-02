import { Car, PHYSICS } from './car.js'
import { GameScene, ARENA_RADIUS } from './scene.js'
import { ParticleSystem } from './particles.js'
import { Minimap } from './minimap.js'
import { Network } from './network.js'
import { buildCar } from './carLibrary.js'
import * as ui from './ui.js'
import {
  PLAYER_COLORS, hexToCss, TAG_RADIUS, CHASER_IMMUNITY_MS,
  CLASSIC_DURATION_MS, INFECTION_DURATION_MS, STATE_SEND_HZ,
  makeRoomCode, randomPlayerName,
} from './constants.js'

const STATE_SEND_INTERVAL_MS = 1000 / STATE_SEND_HZ

export class Game {
  constructor() {
    this.network = new Network()
    this.scene = null
    this.particles = null
    this.minimap = null

    this.localName = ''
    this.roomCode = ''
    this.localId = null

    this.roster = new Map() // id -> {id, name, color, isHost}

    this.mode = 'classic'
    this.isPractice = false
    this.roundActive = false
    this.roundEnded = false
    this.roundPlayers = []
    this.chaserSet = new Set()
    this.immunityUntil = new Map()
    this.chaserIntervals = []
    this.catchOrder = []
    this.roundStartTime = 0
    this.roundDurationMs = CLASSIC_DURATION_MS

    this.cars = new Map()
    this._lastStateSend = 0

    this._bindNetwork()
  }

  _bindNetwork() {
    const net = this.network

    net.onPeerJoin = (peerId) => {
      if (this.localId) net.sendPlayerInfo(this._myInfo(), peerId)
    }

    net.onPeerLeave = (peerId) => {
      this.roster.delete(peerId)
      const car = this.cars.get(peerId)
      if (car && this.scene) this.scene.removeCar(car.mesh)
      this.cars.delete(peerId)

      if (this.roundActive) {
        this.roundPlayers = this.roundPlayers.filter((p) => p.id !== peerId)
        this.chaserSet.delete(peerId)

        if (this.chaserSet.size === 0 && this.roundPlayers.length > 0) {
          // deterministic so every peer promotes the same replacement without any extra messages
          const next = [...this.roundPlayers].sort((a, b) => a.id.localeCompare(b.id))[0]
          this.chaserSet.add(next.id)
          this.immunityUntil.set(next.id, Date.now() + CHASER_IMMUNITY_MS)
          if (this.mode === 'classic') {
            const last = this.chaserIntervals[this.chaserIntervals.length - 1]
            if (last && last.end === null) last.end = Date.now()
            this.chaserIntervals.push({ id: next.id, start: Date.now(), end: null })
          }
          this._updateChaserVisuals()
          this._updateStatusBanner()
        }

        if (this.roundPlayers.length < 2 && this.network.isHost) {
          this._hostEndRound(Date.now())
        }
      }
      this._refreshLobbyUI()
    }

    net.onPlayerInfo = (info, peerId) => {
      this.roster.set(peerId, { id: peerId, name: info.name, color: info.color, isHost: !!info.isHost, carType: info.carType || 'roadster' })
      this._refreshLobbyUI()
    }

    net.onModeSelect = ({ mode }) => {
      this.mode = mode
      if (ui.getCurrentScreen() === 'results') ui.showScreen('lobby')
      this._refreshLobbyUI()
    }

    net.onRoundStart = (payload) => { this._beginRound(payload) }

    net.onCarState = (state, peerId) => {
      const car = this.cars.get(peerId)
      if (car) car.setNetworkSnapshot(state.x, state.z, state.h, state.d)
    }

    net.onTagEvent = ({ targetId, timestamp }) => this._applyTag(targetId, timestamp)

    net.onRoundEnd = (payload) => this._finishRound(payload)
  }

  _myInfo() {
    const me = this.roster.get(this.localId)
    return { name: me.name, color: me.color, isHost: this.network.isHost, carType: me.carType }
  }

  _hostId() {
    for (const p of this.roster.values()) if (p.isHost) return p.id
    return null
  }

  // ---------------- menu ----------------

  createRoom(name, carType) {
    this._enterRoom(makeRoomCode(), true, name, carType)
  }

  joinRoom(name, code, carType) {
    if (!code) {
      ui.setMenuHint('Enter a room code first.')
      return
    }
    this._enterRoom(code.toUpperCase(), false, name, carType)
  }

  _enterRoom(code, isHost, name, carType) {
    this.localName = name || randomPlayerName()
    this.roomCode = code
    this.network.join(code, isHost)
    this.localId = this.network.selfId

    const color = hexToCss(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)])
    this.roster.clear()
    this.roster.set(this.localId, { id: this.localId, name: this.localName, color, isHost, carType: carType || 'roadster' })
    this.mode = 'classic'

    try {
      history.replaceState(null, '', `${location.pathname}?room=${code}`)
    } catch (e) { /* not fatal if blocked */ }

    ui.setLobbyRoomCode(code)
    ui.showScreen('lobby')
    this._refreshLobbyUI()
  }

  async startPractice(name, carType) {
    this.network.leave() // in case a previous room connection is still open
    this.isPractice = true
    this.roundActive = true
    this.roundEnded = false
    this.mode = 'practice'
    this.localName = name || randomPlayerName()
    this.localId = 'practice-solo'

    const color = hexToCss(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)])
    this.roundPlayers = [{ id: this.localId, name: this.localName, color, carType: carType || 'roadster' }]
    this.chaserSet = new Set()

    ui.showScreen('game')
    this._setupSceneIfNeeded()
    await this._spawnRoundCars()
    ui.setHudMode('Practice')
    ui.setPracticeHud(true)
    ui.setStatusBanner('Free Drive', '')
  }

  // ---------------- lobby ----------------

  setMode(mode) {
    if (!this.network.isHost || this.mode === mode) return
    this.mode = mode
    this.network.sendModeSelect(mode)
    this._refreshLobbyUI()
  }

  _refreshLobbyUI() {
    if (ui.getCurrentScreen() !== 'lobby') return
    const players = [...this.roster.values()]
    ui.renderPlayerList(players, this.localId, this._hostId())
    ui.setModeUI(this.mode, this.network.isHost)
    ui.setStartControls(players.length >= 2, this.network.isHost)
  }

  startRound() {
    if (!this.network.isHost) return
    const players = [...this.roster.values()]
    if (players.length < 2) {
      ui.toast('Need at least 2 players to start.')
      return
    }
    const chaser = players[Math.floor(Math.random() * players.length)]
    const payload = {
      mode: this.mode,
      players,
      chaserId: chaser.id,
      startTime: Date.now(),
      durationMs: this.mode === 'infection' ? INFECTION_DURATION_MS : CLASSIC_DURATION_MS,
    }
    this.network.sendRoundStart(payload)
    this._beginRound(payload)
  }

  // ---------------- round lifecycle ----------------

  _beginRound(payload) {
    this.mode = payload.mode
    this.roundPlayers = payload.players
    this.roundDurationMs = payload.durationMs
    this.roundStartTime = payload.startTime
    this.roundActive = true
    this.roundEnded = false
    this.chaserSet = new Set([payload.chaserId])
    this.catchOrder = []
    this.chaserIntervals = [{ id: payload.chaserId, start: payload.startTime, end: null }]
    this.immunityUntil = new Map([[payload.chaserId, payload.startTime + CHASER_IMMUNITY_MS]])

    ui.showScreen('game')
    this._setupSceneIfNeeded()
    this._spawnRoundCars()
    ui.setHudMode(this.mode === 'infection' ? 'Infection' : 'Classic')
    this._updateStatusBanner()
  }

  _setupSceneIfNeeded() {
    if (this.scene) return
    try {
      this.scene = new GameScene(ui.getGameCanvas())
      this.particles = new ParticleSystem(this.scene.scene)
      this.minimap = new Minimap(ui.getMinimapCanvas(), ARENA_RADIUS)
    } catch (e) {
      console.error('Could not start the 3D renderer:', e)
      ui.showScreen('menu')
      ui.setMenuHint("This browser/device couldn't create a 3D (WebGL) context. Try updating Chrome, or check whether hardware acceleration is disabled in browser settings.")
      throw e
    }
  }

  _spawnRoundCars() {
    for (const car of this.cars.values()) this.scene.removeCar(car.mesh)
    this.cars.clear()

    const n = this.roundPlayers.length
    this.roundPlayers.forEach((p, i) => {
      const angle = (i / n) * Math.PI * 2
      const radius = 6
      const car = new Car({ color: parseInt(p.color.slice(1), 16), isLocal: p.id === this.localId })
      car.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
      car.heading = angle + Math.PI
      car.mesh.position.copy(car.position)
      car.mesh.rotation.y = car.heading
      this.scene.addCar(car.mesh)
      this.cars.set(p.id, car)
    })
    this._updateChaserVisuals()
  }

  _updateChaserVisuals() {
    const ringColor = this.mode === 'infection' ? 0xb8a6e0 : 0xff8c69
    for (const [id, car] of this.cars) {
      car.setChaserVisual(this.chaserSet.has(id), ringColor)
    }
  }

  _updateStatusBanner() {
    const amChaser = this.chaserSet.has(this.localId)
    if (this.mode === 'infection') {
      ui.setStatusBanner(amChaser ? "You're infected — get them!" : 'Survive!', amChaser ? 'infected' : 'runner')
    } else {
      ui.setStatusBanner(amChaser ? "YOU'RE IT!" : 'Run!', amChaser ? 'chaser' : 'runner')
    }
  }

  // ---------------- per-frame update, called from main.js's RAF loop ----------------

  tick(dt, input) {
    if (!this.roundActive || !this.scene) return

    const localCar = this.cars.get(this.localId)
    if (localCar) {
      localCar.applyInput(input)
      localCar.step(dt)
      this._resolveCollisions(localCar)

      if (localCar.isDrifting && Math.random() < 0.6) {
        this.particles.spawnDriftSmoke(
          localCar.position.x - Math.sin(localCar.heading) * 1.1,
          localCar.position.z - Math.cos(localCar.heading) * 1.1,
          localCar.velocity.x,
          localCar.velocity.z
        )
      }
    }

    for (const [id, car] of this.cars) {
      if (id !== this.localId) car.stepRemote(dt)
    }

    this.particles.update(dt)

    if (localCar) this.scene.updateCamera(localCar, dt)
    this.scene.render()

    this._maybeSendState()
    this._checkTagging()
    this._updateTimerUI()
    this._updateMinimap()
  }

  _resolveCollisions(car) {
    const distFromCenter = Math.hypot(car.position.x, car.position.z)
    const maxDist = ARENA_RADIUS - PHYSICS.carRadius
    if (distFromCenter > maxDist) {
      const scale = maxDist / distFromCenter
      car.position.x *= scale
      car.position.z *= scale
      const nx = car.position.x / maxDist
      const nz = car.position.z / maxDist
      const vDotN = car.velocity.x * nx + car.velocity.z * nz
      if (vDotN > 0) {
        car.velocity.x -= vDotN * nx
        car.velocity.z -= vDotN * nz
      }
    }

    for (const c of this.scene.colliders) {
      const dx = car.position.x - c.x
      const dz = car.position.z - c.z
      const dist = Math.hypot(dx, dz)
      const minDist = c.radius + PHYSICS.carRadius
      if (dist < minDist && dist > 0.0001) {
        const push = minDist - dist
        const nx = dx / dist
        const nz = dz / dist
        car.position.x += nx * push
        car.position.z += nz * push
        const vDotN = car.velocity.x * nx + car.velocity.z * nz
        if (vDotN < 0) {
          car.velocity.x -= vDotN * nx
          car.velocity.z -= vDotN * nz
        }
      }
    }

    for (const [id, other] of this.cars) {
      if (other === car) continue
      const dx = car.position.x - other.position.x
      const dz = car.position.z - other.position.z
      const dist = Math.hypot(dx, dz)
      const minDist = PHYSICS.carRadius * 1.7
      if (dist < minDist && dist > 0.0001) {
        const push = (minDist - dist) * 0.5
        car.position.x += (dx / dist) * push
        car.position.z += (dz / dist) * push
      }
    }
  }

  _checkTagging() {
    if (!this.roundActive || this.roundEnded) return
    const localCar = this.cars.get(this.localId)
    if (!localCar || !this.chaserSet.has(this.localId)) return
    const now = Date.now()
    if (now < (this.immunityUntil.get(this.localId) || 0)) return

    for (const p of this.roundPlayers) {
      if (p.id === this.localId || this.chaserSet.has(p.id)) continue
      const otherCar = this.cars.get(p.id)
      if (!otherCar) continue
      if (localCar.position.distanceTo(otherCar.position) < TAG_RADIUS) {
        const timestamp = Date.now()
        this.network.sendTagEvent({ targetId: p.id, timestamp })
        this._applyTag(p.id, timestamp)
        break
      }
    }
  }

  _applyTag(targetId, timestamp) {
    if (!this.roundActive || this.roundEnded || this.chaserSet.has(targetId)) return

    const targetCar = this.cars.get(targetId)
    if (targetCar && this.particles) {
      this.particles.spawnTagBurst(targetCar.position.x, targetCar.position.z, 0xffffff)
    }

    if (this.mode === 'infection') {
      this.chaserSet.add(targetId)
      this.catchOrder.push(targetId)
      this.immunityUntil.set(targetId, timestamp + CHASER_IMMUNITY_MS)
      this._updateChaserVisuals()
      this._updateStatusBanner()

      const survivorCount = this.roundPlayers.length - this.chaserSet.size
      if (survivorCount <= 1 && this.network.isHost) this._hostEndRound(timestamp)
    } else {
      const prevChaserId = [...this.chaserSet][0]
      this.chaserSet = new Set([targetId])
      this.immunityUntil.set(targetId, timestamp + CHASER_IMMUNITY_MS)

      const last = this.chaserIntervals[this.chaserIntervals.length - 1]
      if (last && last.id === prevChaserId && last.end === null) last.end = timestamp
      this.chaserIntervals.push({ id: targetId, start: timestamp, end: null })

      this._updateChaserVisuals()
      this._updateStatusBanner()
    }
  }

  _maybeSendState() {
    if (this.isPractice) return
    const now = performance.now()
    if (now - this._lastStateSend < STATE_SEND_INTERVAL_MS) return
    this._lastStateSend = now
    const car = this.cars.get(this.localId)
    if (!car) return
    this.network.sendCarState({ x: car.position.x, z: car.position.z, h: car.heading, d: car.isDrifting })
  }

  _updateTimerUI() {
    if (!this.roundActive || this.roundEnded || this.isPractice) return
    const remaining = this.roundDurationMs - (Date.now() - this.roundStartTime)
    ui.setHudTimer(Math.max(0, remaining))
    if (remaining <= 0 && this.network.isHost) this._hostEndRound(Date.now())
  }

  _updateMinimap() {
    const players = this.roundPlayers.map((p) => {
      const car = this.cars.get(p.id)
      return {
        id: p.id,
        x: car ? car.position.x : 0,
        z: car ? car.position.z : 0,
        color: p.color,
        isChaser: this.chaserSet.has(p.id),
      }
    })
    this.minimap.render(players, this.localId)
  }

  // ---------------- round end ----------------

  _hostEndRound(timestamp) {
    if (this.roundEnded) return
    this.roundEnded = true
    const payload = { endTime: timestamp }
    this.network.sendRoundEnd(payload)
    this._finishRound(payload)
  }

  _finishRound({ endTime }) {
    if (!this.roundActive) return
    this.roundActive = false
    this.roundEnded = true

    const last = this.chaserIntervals[this.chaserIntervals.length - 1]
    if (last && last.end === null) last.end = endTime

    const results = this.mode === 'infection'
      ? this._computeInfectionResults()
      : this._computeClassicResults(endTime)

    ui.setResults({
      title: this.mode === 'infection' ? 'Infection Results' : 'Round Results',
      rows: results,
      isHost: this.network.isHost,
    })
    ui.showScreen('results')
  }

  _computeClassicResults(endTime) {
    const totals = new Map(this.roundPlayers.map((p) => [p.id, 0]))
    for (const interval of this.chaserIntervals) {
      const end = interval.end ?? endTime
      const dur = Math.max(0, end - interval.start)
      totals.set(interval.id, (totals.get(interval.id) || 0) + dur)
    }
    return this.roundPlayers
      .map((p) => ({ ...p, ms: totals.get(p.id) || 0 }))
      .sort((a, b) => a.ms - b.ms)
      .map((p) => ({ name: p.name, color: p.color, detail: this._fmtDuration(p.ms) + ' as it' }))
  }

  _computeInfectionResults() {
    const survivors = this.roundPlayers.filter((p) => !this.chaserSet.has(p.id))
    const caughtOrderDesc = [...this.catchOrder].reverse()
    const caught = caughtOrderDesc.map((id) => this.roundPlayers.find((p) => p.id === id)).filter(Boolean)
    return [
      ...survivors.map((p) => ({ name: p.name, color: p.color, detail: 'Survived' })),
      ...caught.map((p, i) => ({ name: p.name, color: p.color, detail: `Caught #${caughtOrderDesc.length - i}` })),
    ]
  }

  _fmtDuration(ms) {
    const s = Math.round(ms / 1000)
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  }

  playAgain() {
    if (!this.network.isHost) return
    this.network.sendModeSelect(this.mode)
    ui.showScreen('lobby')
    ui.setLobbyRoomCode(this.roomCode)
    this._refreshLobbyUI()
  }

  leaveToMenu() {
    this.network.leave()
    this.roundActive = false
    this.isPractice = false
    this.roster.clear()
    if (this.scene) {
      for (const car of this.cars.values()) this.scene.removeCar(car.mesh)
    }
    this.cars.clear()
    ui.setPracticeHud(false)
    try {
      history.replaceState(null, '', location.pathname)
    } catch (e) { /* not fatal */ }
    ui.showScreen('menu')
  }
}
