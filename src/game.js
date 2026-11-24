import { Car, PHYSICS } from './car.js'
import { GameScene } from './scene.js'
import { SoccerController, buildSoccerResults, assignTeams } from './soccerGame.js'
import { TEAMS } from './soccerLayout.js'
import { DEFAULT_MAP, isMapId, constrainToBounds, resolveColliders } from './maps.js'
import { ParticleSystem } from './particles.js'
import { DriftFx } from './driftFx.js'
import { Minimap } from './minimap.js'
import { Network } from './network.js'
import { buildCar } from './carLibrary.js'
import { loadAbilityModels } from './abilityModels.js'
import { AbilityManager, randomAbilityId, abilityName, SHOCKWAVE_RADIUS } from './abilities.js'
import * as audio from './audio.js'
import * as ui from './ui.js'
import {
  PLAYER_COLORS, hexToCss, TAG_RADIUS, CHASER_IMMUNITY_MS, CHASER_SPEED_MULTIPLIER,
  CLASSIC_DURATION_MS, INFECTION_DURATION_MS, STATE_SEND_HZ, SPEED_DISPLAY_SCALE,
  ITEM_BOX_RADIUS, ITEM_BOX_RESPAWN_MS,
  makeRoomCode, randomPlayerName, SOCCER_DURATION_MS } from './constants.js'

const STATE_SEND_INTERVAL_MS = 1000 / STATE_SEND_HZ
const LOBBY_MODES = ['classic', 'infection', 'soccer']
const SOCCER_MAP = 'stadium' // Car Soccer is only played here
const BUMP_COOLDOWN_MS = 220

export class Game {
  constructor() {
    this.network = new Network()
    this.scene = null
    this.particles = null
    this.driftFx = null
    this.minimap = null
    this.mapId = DEFAULT_MAP // the lobby's chosen map (the host picks)
    this.soccer = null // a SoccerController while Car Soccer (or stadium practice) is running
    this.teams = {} // Car Soccer: { playerId: 0 | 1 }

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
    this._elapsed = 0

    this.abilityManager = null
    this.inventory = null // held ability id, or null
    this.itemBoxState = new Map() // boxIndex -> timestamp when it respawns (absent/past = active)

    this._wasShielded = false
    this._lastTickSecond = -1
    this._lastBump = 0

    this._bindNetwork()
  }

  _bindNetwork() {
    const net = this.network

    net.onPeerJoin = (peerId) => {
      if (this.localId) net.sendPlayerInfo(this._myInfo(), peerId)
      // a late joiner would otherwise see the default mode/map until the host next changes them
      if (net.isHost && !this.roundActive) {
        net.sendModeSelect(this.mode)
        net.sendMapSelect(this.mapId)
      }
    }

    net.onJoinError = ({ error }) => {
      console.error('Connection error:', error)
      ui.toast("Couldn't connect to a peer -- check your internet connection and try again.")
    }

    net.onPeerLeave = (peerId) => {
      const wasHost = peerId === this._hostId()
      this.roster.delete(peerId)
      const car = this.cars.get(peerId)
      if (car && this.scene) this.scene.removeCar(car.mesh)
      this.cars.delete(peerId)

      if (this.roundActive && this.mode === 'soccer') {
        this.roundPlayers = this.roundPlayers.filter((p) => p.id !== peerId)
        if (wasHost) {
          // the host runs the ball and the clock: without them the match can't continue
          ui.toast('The host left, so the match ended.')
          this.leaveToMenu()
          return
        }
        this.soccer?.onPeerLeave(peerId)
        if (this.roundPlayers.length < 2 && this.network.isHost) this._hostEndRound(Date.now(), { soccer: this._soccerFinal() })
      } else if (this.roundActive) {
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

    net.onBallState = (d, peerId) => this.soccer?.onBallState(d, peerId)
    net.onBallHit = (d, peerId) => this.soccer?.onBallHit(d, peerId)
    net.onMatchEvent = (d, peerId) => this.soccer?.onMatchEvent(d, peerId)

    net.onMapSelect = ({ mapId }, peerId) => {
      const host = this._hostId()
      if (!isMapId(mapId) || (host && peerId !== host)) return // unknown map, or not from the host
      this.mapId = mapId
      this._refreshLobbyUI()
    }

    net.onModeSelect = ({ mode }) => {
      if (!LOBBY_MODES.includes(mode)) return // e.g. the retired Traffic Dash from an older copy of the game
      this.mode = mode
      if (mode === 'soccer') this.mapId = SOCCER_MAP
      if (ui.getCurrentScreen() === 'results') ui.showScreen('lobby')
      this._refreshLobbyUI()
    }

    net.onRoundStart = (payload) => {
      if (LOBBY_MODES.includes(payload?.mode)) this._beginRound(payload)
    }

    net.onCarState = (state, peerId) => {
      const car = this.cars.get(peerId)
      if (car) car.setNetworkSnapshot(state.x, state.z, state.h, state.d)
    }

    net.onTagEvent = ({ targetId, timestamp }) => this._applyTag(targetId, timestamp)

    net.onRoundEnd = (payload) => this._finishRound(payload)

    net.onItemPickup = ({ boxId, timestamp }) => {
      this.itemBoxState.set(boxId, timestamp + ITEM_BOX_RESPAWN_MS)
      this.scene?.setItemBoxVisible(boxId, false)
    }

    net.onAbilityUse = (payload) => {
      if (payload.abilityId === 'shockwave') this._resolveShockwave(payload)
      this.abilityManager?.handleUse(payload, this.cars)
      audio.playAt(`ability_use_${payload.abilityId}`, payload.x, payload.z)
    }

    net.onAbilityHit = ({ targetId, effectType, useId, timestamp }) => {
      const car = this.cars.get(targetId)
      if (car && car.applyEffect(effectType, timestamp)) {
        this.particles?.spawnTagBurst(car.position.x, car.position.z, 0xff8c69)
        audio.playAt(effectType === 'slip' ? 'hit_slip' : 'hit_stun', car.position.x, car.position.z)
      }
      if (useId) this.abilityManager?.removeProjectile(useId)
    }
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

  async _enterRoom(code, isHost, name, carType) {
    this.localName = name || randomPlayerName()
    this.roomCode = code
    await this.network.join(code, isHost)
    this.localId = this.network.selfId

    const color = hexToCss(PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)])
    this.roster.clear()
    this.roster.set(this.localId, { id: this.localId, name: this.localName, color, isHost, carType: carType || 'roadster' })
    this.mode = 'classic'
    this.mapId = DEFAULT_MAP

    try {
      history.replaceState(null, '', `${location.pathname}?room=${code}`)
    } catch (e) { /* not fatal if blocked */ }

    ui.setLobbyRoomCode(code)
    ui.showScreen('lobby')
    this._refreshLobbyUI()

    clearInterval(this._diagInterval)
    this._diagInterval = setInterval(() => this.network.logConnectionStates(), 3000)
  }

  async startPractice(name, carType, mapId = DEFAULT_MAP) {
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
    await loadAbilityModels() // before the scene exists, so item boxes can use their model
    this.mapId = isMapId(mapId) ? mapId : DEFAULT_MAP
    this._setupSceneIfNeeded(this.mapId)
    await this._spawnRoundCars()
    ui.setHudMode('Practice')
    ui.setPracticeHud(true)
    ui.setStatusBanner('Free Drive', '')
    this._resetItemsAndAbilities()
    this.soccer?.dispose()
    this.soccer = null
    if (this.mapId === SOCCER_MAP) {
      // the stadium in practice is a training pitch: you, the ball, and both goals
      this.teams = {}
      this.soccer = new SoccerController(this, { practice: true })
      this.soccer.begin()
    }
    audio.play('round_start')
  }

  // ---------------- lobby ----------------

  setMode(mode) {
    if (!this.network.isHost || this.mode === mode) return
    this.mode = mode
    this.network.sendModeSelect(mode)
    if (mode === 'soccer' && this.mapId !== SOCCER_MAP) {
      this.mapId = SOCCER_MAP // Car Soccer only works on the pitch
      this.network.sendMapSelect(this.mapId)
    }
    this._refreshLobbyUI()
  }

  setMap(mapId) {
    if (!this.network.isHost || this.mapId === mapId || !isMapId(mapId) || this.mode === 'soccer') return
    this.mapId = mapId
    this.network.sendMapSelect(mapId)
    this._refreshLobbyUI()
  }

  _refreshLobbyUI() {
    if (ui.getCurrentScreen() !== 'lobby') return
    const players = [...this.roster.values()]
    ui.renderPlayerList(players, this.localId, this._hostId())
    ui.setModeUI(this.mode, this.network.isHost)
    ui.setMapUI(this.mapId, this.network.isHost, this.mode === 'soccer')
    ui.setStartControls(players.length >= 2, this.network.isHost)
  }

  async startRound() {
    if (!this.network.isHost) return
    const players = [...this.roster.values()]
    if (players.length < 2) {
      ui.toast('Need at least 2 players to start.')
      return
    }
    const chaser = players[Math.floor(Math.random() * players.length)]
    const soccer = this.mode === 'soccer'
    const payload = {
      mode: this.mode,
      mapId: soccer ? SOCCER_MAP : this.mapId,
      players,
      chaserId: chaser.id,
      startTime: Date.now(),
      durationMs: soccer ? SOCCER_DURATION_MS : this.mode === 'infection' ? INFECTION_DURATION_MS : CLASSIC_DURATION_MS,
    }
    if (soccer) payload.teams = assignTeams(players.map((p) => p.id))
    this.network.sendRoundStart(payload)
    await this._beginRound(payload)
  }

  // ---------------- round lifecycle ----------------

  async _beginRound(payload) {
    this.mode = payload.mode
    this.roundPlayers = payload.players
    this.roundActive = true
    this.roundEnded = false
    this.roundDurationMs = payload.durationMs
    this.roundStartTime = payload.startTime
    const soccer = this.mode === 'soccer'
    this.chaserSet = new Set(soccer ? [] : [payload.chaserId])
    this.catchOrder = []
    this.chaserIntervals = soccer ? [] : [{ id: payload.chaserId, start: payload.startTime, end: null }]
    this.immunityUntil = new Map(soccer ? [] : [[payload.chaserId, payload.startTime + CHASER_IMMUNITY_MS]])
    this.teams = soccer ? this._validTeams(payload.teams, payload.players) : {}

    this.soccer?.dispose()
    this.soccer = null
    ui.showScreen('game')
    await loadAbilityModels()
    this.mapId = soccer ? SOCCER_MAP : isMapId(payload.mapId) ? payload.mapId : DEFAULT_MAP // the host's choice, never trusted blindly
    this._setupSceneIfNeeded(this.mapId)
    await this._spawnRoundCars()

    ui.setHudMode(soccer ? 'Car Soccer' : this.mode === 'infection' ? 'Infection' : 'Classic')
    this._resetItemsAndAbilities()
    if (soccer) {
      this.soccer = new SoccerController(this, { teams: this.teams, durationMs: payload.durationMs })
      this.soccer.begin()
    } else {
      this._updateStatusBanner()
      audio.play('round_start')
    }
  }

  _resetItemsAndAbilities() {
    this._wasShielded = false
    this._lastTickSecond = -1
    this.driftFx?.clear()
    this.inventory = null
    ui.setInventory(null)
    this.itemBoxState.clear()
    this.abilityManager?.clear()
    if (this.scene) for (let i = 0; i < this.scene.itemBoxes.length; i++) this.scene.setItemBoxVisible(i, true)
  }

  _setupSceneIfNeeded(mapId) {
    if (this.scene && this.scene.mapId === mapId) return
    if (this.scene) {
      for (const car of this.cars.values()) this.scene.removeCar(car.mesh)
      this.driftFx?.dispose()
      this.scene.dispose()
      this.scene = null
    }
    try {
      this.scene = new GameScene(ui.getGameCanvas(), mapId)
      this.particles = new ParticleSystem(this.scene.scene)
      this.driftFx = new DriftFx(this.scene.scene, this.particles)
      this.minimap = new Minimap(ui.getMinimapCanvas(), this.scene.bounds, this.scene.colliders)
      this.abilityManager = new AbilityManager(this.scene)
    } catch (e) {
      console.error('Could not start the 3D renderer:', e)
      ui.showScreen('menu')
      ui.setMenuHint("This browser/device couldn't create a 3D (WebGL) context. Try updating Chrome, or check whether hardware acceleration is disabled in browser settings.")
      throw e
    }
  }

  /** Teams come from the host: keep only real players on team 0 or 1, and
   * fall back to alternating by id (the same on every machine) if it's junk. */
  _validTeams(teams, players) {
    const ok = teams && typeof teams === 'object' && players.every((p) => teams[p.id] === 0 || teams[p.id] === 1)
    if (ok) return Object.fromEntries(players.map((p) => [p.id, teams[p.id]]))
    return Object.fromEntries([...players].sort((a, b) => a.id.localeCompare(b.id)).map((p, i) => [p.id, i % 2]))
  }

  /** Cars take their team's colour in Car Soccer, whatever the player picked. */
  _carColorFor(p) {
    const t = this.mode === 'soccer' ? TEAMS[this.teams[p.id]] : null
    return t ? t.color : parseInt(p.color.slice(1), 16)
  }

  async _spawnRoundCars() {
    for (const car of this.cars.values()) this.scene.removeCar(car.mesh)
    this.cars.clear()

    const n = this.roundPlayers.length
    const built = await Promise.all(
      this.roundPlayers.map((p) => buildCar(p.carType || 'roadster', this._carColorFor(p)))
    )

    this.roundPlayers.forEach((p, i) => {
      const { vehicle, wheels, dims } = built[i]
      const car = new Car({ color: this._carColorFor(p), isLocal: p.id === this.localId, vehicle, wheels, dims, name: p.name })

      const spawn = this.scene.spawnPoint(i, n) // each map says where its cars start
      car.position.set(spawn.x, 0, spawn.z)
      car.heading = spawn.heading
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
    this._elapsed += dt

    const localCar = this.cars.get(this.localId)

    if (localCar) {
      localCar.applyInput(this.soccer ? this.soccer.filterInput(input) : input) // frozen during kickoff countdowns
      localCar.step(dt)
      this._resolveCollisions(localCar)

      if (localCar.isBoosted() && Math.random() < 0.7) {
        this.particles.spawnDriftSmoke(
          localCar.position.x - Math.sin(localCar.heading) * 1.3,
          localCar.position.z - Math.cos(localCar.heading) * 1.3,
          localCar.velocity.x,
          localCar.velocity.z
        )
      }
      this._updateSpeedometer(localCar)
      this._checkItemPickup(localCar)
      this._updateLocalAudio(localCar)
    }

    for (const [id, car] of this.cars) {
      if (id !== this.localId) car.stepRemote(dt)
    }

    // tyre marks, smoke and sparks for every car, so other players' drifts look right too
    for (const car of this.cars.values()) this.driftFx.updateCar(car, dt)
    this.driftFx.update()
    this.particles.update(dt)

    this.soccer?.update(dt, localCar)

    this.scene.animateItemBoxes(dt, this._elapsed)
    this.abilityManager?.update(dt, this.cars)
    this._checkAbilityHits(localCar)

    if (localCar) this.scene.updateCamera(localCar, dt)
    this.scene.render()

    this._maybeSendState()

    if (this.mode !== 'soccer') {
      this._checkTagging()
      this._updateTimerUI()
    }
    this._updateMinimap()
  }

  _updateLocalAudio(car) {
    audio.setListener(car.position.x, car.position.z, car.heading)
    audio.updateDriving({ speedFraction: car.speedFraction, skid: car.animator.skid, boosted: car.isBoosted() })
    if (car.animator.consumeLevelUp()) audio.play('drift_charge')
    const shielded = car.isShielded()
    if (this._wasShielded && !shielded) audio.play('shield_end')
    this._wasShielded = shielded
  }

  _checkItemPickup(localCar) {
    if (this.inventory || !this.scene) return
    const now = Date.now()
    this.scene.itemBoxes.forEach((box, i) => {
      const respawnAt = this.itemBoxState.get(i) || 0
      if (now < respawnAt) return
      const dist = Math.hypot(localCar.position.x - box.x, localCar.position.z - box.z)
      if (dist > ITEM_BOX_RADIUS + PHYSICS.carRadius) return
      this.inventory = randomAbilityId()
      audio.play('item_pickup')
      ui.setInventory(abilityName(this.inventory))
      this.itemBoxState.set(i, now + ITEM_BOX_RESPAWN_MS)
      this.scene.setItemBoxVisible(i, false)
      this.network.sendItemPickup({ boxId: i, timestamp: now })
    })
  }

  _checkAbilityHits(localCar) {
    if (!localCar || !this.abilityManager) return
    const hits = this.abilityManager.checkLocalHits(localCar, this.localId)
    for (const hit of hits) {
      if (hit.useId) this.abilityManager.removeProjectile(hit.useId)
      const applied = localCar.applyEffect(hit.effectType)
      if (applied && this.particles) this.particles.spawnTagBurst(localCar.position.x, localCar.position.z, 0xff8c69)
      audio.play(!applied ? 'shield_block' : hit.effectType === 'slip' ? 'hit_slip' : 'hit_stun')
      if (hit.useId) {
        this.network.sendAbilityHit({ targetId: this.localId, effectType: hit.effectType, useId: hit.useId, casterId: hit.casterId, timestamp: Date.now() })
      }
    }
  }

  /** Activate whatever's in the local player's inventory slot. */
  useAbility() {
    if (!this.roundActive || !this.inventory) return
    const localCar = this.cars.get(this.localId)
    if (!localCar) return

    const abilityId = this.inventory
    const behind = abilityId === 'oilslick'
    const payload = {
      abilityId,
      useId: `${this.localId}-${Date.now()}`,
      casterId: this.localId,
      x: localCar.position.x - (behind ? Math.sin(localCar.heading) * 1.4 : 0),
      z: localCar.position.z - (behind ? Math.cos(localCar.heading) * 1.4 : 0),
      heading: localCar.heading,
      timestamp: Date.now(),
    }

    this.network.sendAbilityUse(payload)
    audio.play(`ability_use_${abilityId}`)
    if (abilityId === 'shockwave') this._resolveShockwave(payload)
    this.abilityManager?.handleUse(payload, this.cars)

    this.inventory = null
    ui.setInventory(null)
  }

  _resolveShockwave({ casterId, x, z, timestamp, useId }) {
    const localCar = this.cars.get(this.localId)
    if (!localCar || this.localId === casterId) return
    const dist = Math.hypot(localCar.position.x - x, localCar.position.z - z)
    if (dist > SHOCKWAVE_RADIUS) return
    const applied = localCar.applyEffect('stun', timestamp)
    if (applied && this.particles) this.particles.spawnTagBurst(localCar.position.x, localCar.position.z, 0xff8c69)
    audio.play(applied ? 'hit_stun' : 'shield_block')
    this.network.sendAbilityHit({ targetId: this.localId, effectType: 'stun', casterId, useId, timestamp: Date.now() })
  }

  _updateSpeedometer(car) {
    const maxSpeed = PHYSICS.maxForwardSpeed * (car.isChaser ? CHASER_SPEED_MULTIPLIER : 1)
    const speed = Math.abs(car.speed)
    ui.setSpeedometer(speed / maxSpeed, speed * SPEED_DISPLAY_SCALE)
  }

  _resolveCollisions(car) {
    const onImpact = (speed) => this._bump('bump_wall', speed)
    constrainToBounds(this.scene.bounds, car.position, car.velocity, PHYSICS.carRadius, onImpact)
    resolveColliders(this.scene.colliders, car.position, car.velocity, PHYSICS.carRadius, onImpact)

    for (const [, other] of this.cars) {
      if (other === car) continue
      const dx = car.position.x - other.position.x
      const dz = car.position.z - other.position.z
      const dist = Math.hypot(dx, dz)
      const minDist = PHYSICS.carRadius * 1.7
      if (dist < minDist && dist > 0.0001) {
        const push = (minDist - dist) * 0.5
        car.position.x += (dx / dist) * push
        car.position.z += (dz / dist) * push
        const closing = -((car.velocity.x - other.velocity.x) * (dx / dist) + (car.velocity.z - other.velocity.z) * (dz / dist))
        this._bump('bump_car', closing)
      }
    }
  }

  /** Impact sound, louder with harder hits; a cooldown stops a car grinding along a wall from machine-gunning it. */
  _bump(soundId, impactSpeed) {
    const now = performance.now()
    if (impactSpeed < 3 || now - this._lastBump < BUMP_COOLDOWN_MS) return
    this._lastBump = now
    audio.play(soundId, { volume: Math.min(1, impactSpeed / 14) })
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
      if (!otherCar || otherCar.isShielded()) continue
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
    if (targetCar) audio.playAt('tag_hit', targetCar.position.x, targetCar.position.z)
    if (targetId === this.localId) audio.play('tag_you_are_it')

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
    if (!this.roundActive || this.roundEnded || this.isPractice || this.mode === 'soccer') return
    const remaining = this.roundDurationMs - (Date.now() - this.roundStartTime)
    ui.setHudTimer(Math.max(0, remaining))
    const secsLeft = Math.ceil(remaining / 1000)
    if (secsLeft <= 10 && secsLeft > 0 && secsLeft !== this._lastTickSecond) {
      this._lastTickSecond = secsLeft
      audio.play('timer_tick')
    }
    if (remaining <= 0 && this.network.isHost) this._hostEndRound(Date.now())
  }

  _updateMinimap() {
    const soccer = this.mode === 'soccer'
    const players = this.roundPlayers.map((p) => {
      const car = this.cars.get(p.id)
      return {
        id: p.id,
        x: car ? car.position.x : 0,
        z: car ? car.position.z : 0,
        color: soccer ? TEAMS[this.teams[p.id]]?.css || p.color : p.color,
        isChaser: this.chaserSet.has(p.id),
      }
    })
    const extras = this.soccer ? [{ x: this.soccer.ball.x, z: this.soccer.ball.z, color: '#ffffff', size: 4 }] : []
    this.minimap.render(players, this.localId, extras)
  }

  // ---------------- round end ----------------

  /** The score so far, as a final result (used if a match has to stop early). */
  _soccerFinal() {
    const m = this.soccer?.match
    const scores = m ? [...m.scores] : [0, 0]
    return { scores, winner: scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1, goals: this.soccer?.goalsBy || {}, own: this.soccer?.ownGoalsBy || {} }
  }

  _hostEndRound(timestamp, extra = {}) {
    if (this.roundEnded) return
    this.roundEnded = true
    const payload = { endTime: timestamp, ...extra }
    this.network.sendRoundEnd(payload)
    this._finishRound(payload)
  }

  _finishRound({ endTime, soccer }) {
    if (!this.roundActive) return
    this.roundActive = false
    this.roundEnded = true
    audio.stopDriving()
    audio.play('round_end')

    let results
    let title
    if (this.mode === 'soccer') {
      const final = this._validSoccerFinal(soccer)
      ;({ title, rows: results } = buildSoccerResults(final, this.roundPlayers, this.teams))
      this.soccer?.dispose()
      this.soccer = null
    } else {
      const last = this.chaserIntervals[this.chaserIntervals.length - 1]
      if (last && last.end === null) last.end = endTime
      results = this.mode === 'infection' ? this._computeInfectionResults() : this._computeClassicResults(endTime)
      title = this.mode === 'infection' ? 'Infection Results' : 'Round Results'
    }

    ui.setResults({ title, rows: results, isHost: this.network.isHost })
    ui.showScreen('results')
  }

  /** The host's final score, checked before we show it (it arrives over the network). */
  _validSoccerFinal(raw) {
    const num = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
    const book = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).map(([k, v]) => [k, num(v)]))
    const scores = Array.isArray(raw?.scores) ? [num(raw.scores[0]), num(raw.scores[1])] : [0, 0]
    const winner = scores[0] === scores[1] ? null : scores[0] > scores[1] ? 0 : 1
    return { scores, winner, goals: book(raw?.goals), own: book(raw?.own) }
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
    this.network.sendMapSelect(this.mapId)
    ui.showScreen('lobby')
    ui.setLobbyRoomCode(this.roomCode)
    this._refreshLobbyUI()
  }

  leaveToMenu() {
    clearInterval(this._diagInterval)
    this.network.leave()
    this.roundActive = false
    this.isPractice = false
    this.roster.clear()
    if (this.scene) {
      for (const car of this.cars.values()) this.scene.removeCar(car.mesh)
    }
    this.driftFx?.clear()
    this.cars.clear()
    this.abilityManager?.clear()
    this.soccer?.dispose()
    this.soccer = null
    audio.stopDriving()
    this.inventory = null
    ui.setInventory(null)
    ui.setPracticeHud(false)
    try {
      history.replaceState(null, '', location.pathname)
    } catch (e) { /* not fatal */ }
    ui.showScreen('menu')
  }
}
