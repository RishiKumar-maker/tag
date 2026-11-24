import * as THREE from '../lib/three.module.min.js'
import { PHYSICS } from './car.js'
import { createBall, resetBall, stepBall, collideCarBall, ballSpeed, BALL_PHYSICS } from './ballPhysics.js'
import { SoccerMatch, PHASE } from './soccerMatch.js'
import { FIELD, BALL_RADIUS, TEAMS, kickoffSpot, slotFor, assignTeams, BOOST_PAD_RADIUS, BOOST_PAD_COOLDOWN_MS, BOOST_PAD_BURST_MS } from './soccerLayout.js'
import { createBallMesh } from './stadiumMap.js'
import { SOCCER_DURATION_MS } from './constants.js'
import * as audio from './audio.js'
import * as ui from './ui.js'

const FROZEN_INPUT = { throttle: 0, steer: 0, drift: false }
const STATE_SEND_MS = 66 // the host broadcasts the ball ~15 times a second

/** Car Soccer for one match (or one practice session). Game owns one of these
 * while the mode is running and calls update() from its tick.
 *
 * Who decides what: the HOST (or you, in practice) runs the match clock and
 * referees goals, and sends the ball's state to everyone. Guests run their own
 * copy of the ball between those messages and ease toward the host's; a guest's
 * own hits are applied instantly and reported to the host, so kicking feels
 * immediate rather than waiting on a round trip. */
export class SoccerController {
  constructor(game, { practice = false, teams = {}, durationMs = SOCCER_DURATION_MS } = {}) {
    this.game = game
    this.practice = practice
    this.teams = teams // { playerId: 0 | 1 }
    this.match = new SoccerMatch({ durationMs, practice })
    this.ball = createBall()
    this.ballMesh = null
    this.ballCam = true
    this.goalsBy = {}
    this.ownGoalsBy = {}
    this.hitCooldown = new Map() // host: ignore its own contact with a car that just reported a hit
    this.padReadyAt = []
    this._receivedAt = performance.now()
    this._lastStateSend = 0
    this._localHitAt = 0
    this._lastSentHit = 0
    this._lastHitSound = 0
    this._lastWallSound = 0
    this._countNumber = null
    this._teamHint = ''
    this._rollAxis = new THREE.Vector3()
  }

  get isAuthority() {
    return this.practice || this.game.network.isHost
  }

  get localTeam() {
    return this.teams[this.game.localId]
  }

  // ------------------------------------------------------------- lifecycle

  begin() {
    const g = this.game
    this.ballMesh = createBallMesh()
    g.scene.scene.add(this.ballMesh.group)
    this.padReadyAt = g.scene.boostPads.map(() => 0)
    resetBall(this.ball)

    ui.setSoccerHud(true, { practice: this.practice })
    ui.setStatusBanner('', '') // clear anything left over from an earlier round ("You're IT!", "Free Drive")
    ui.setBallCamActive(this.ballCam)
    if (!this.practice) {
      this._placeAllCars()
      this._applyTeamLooks()
      const team = TEAMS[this.localTeam]
      this._teamHint = team ? `You're on ${team.name}` : '' // shown under the first countdown
    }
    this._renderBall(0)
  }

  dispose() {
    const g = this.game
    if (this.ballMesh) {
      g.scene?.scene.remove(this.ballMesh.group)
      this.ballMesh.mesh.geometry.dispose()
    }
    if (g.scene) g.scene.ballCamTarget = null
    for (const car of g.cars.values()) car.setChaserVisual(false, 0)
    ui.setSoccerHud(false, {})
    ui.setCenterBanner('', '')
  }

  /** Stops the local car moving during the kickoff countdown and after the whistle. */
  filterInput(input) {
    const phase = this.match.phase
    return phase === PHASE.COUNTDOWN || phase === PHASE.ENDED ? FROZEN_INPUT : input
  }

  toggleBallCam() {
    this.ballCam = !this.ballCam
    ui.setBallCamActive(this.ballCam)
  }

  onPeerLeave(id) {
    delete this.teams[id]
    this.hitCooldown.delete(id)
    if (!this.isAuthority || this.practice || this.match.phase === PHASE.ENDED) return
    const left = Object.values(this.teams)
    const n0 = left.filter((t) => t === 0).length
    const n1 = left.length - n0
    if (n0 === 0 || n1 === 0) {
      // one side has nobody left: the match can't go on
      this.match.phase = PHASE.ENDED
      this._emit({ type: 'end', winner: n0 === 0 ? 1 : 0, state: this.match.snapshot() })
    }
  }

  // ------------------------------------------------------------ per frame

  update(dt, localCar) {
    const g = this.game
    const now = performance.now()

    if (this.isAuthority) {
      for (const ev of this.match.update(dt * 1000)) this._emit(ev)
    }

    const phase = this.match.phase
    if (phase === PHASE.PLAYING || phase === PHASE.GOAL) {
      this._stepBall(dt)
      if (localCar) this._checkBoostPads(localCar)
    }

    if (this.isAuthority && !this.practice && now - this._lastStateSend > STATE_SEND_MS) {
      this._lastStateSend = now
      g.network.sendBallState({
        x: this.ball.x, z: this.ball.z, vx: this.ball.vx, vz: this.ball.vz,
        lt: this.ball.lastTouchId, m: this.match.snapshot(),
      })
    }

    this._renderBall(dt)
    this._updateBoostPadVisuals()
    this._updateHud(now)
    g.scene.ballCamTarget = this.ballCam ? this.ball : null
    audio.setListener(localCar?.position.x ?? 0, localCar?.position.z ?? 0, localCar?.heading ?? 0)
  }

  _stepBall(dt) {
    const now = performance.now()
    this._collideCars(now)
    const r = stepBall(this.ball, dt)
    this._collideCars(now)

    if (r.wallHit > 6 && now - this._lastWallSound > 140) {
      this._lastWallSound = now
      audio.playAt('ball_wall', this.ball.x, this.ball.z, { volume: Math.min(1, r.wallHit / 25) })
    }
    if (this.isAuthority && r.goalFor !== null) this._goal(r.goalFor)
  }

  _collideCars(now) {
    const g = this.game
    for (const [id, car] of g.cars) {
      if (!this.isAuthority && id !== g.localId) continue // guests predict only their own hits
      if (this.isAuthority && (this.hitCooldown.get(id) || 0) > now) continue
      const impact = collideCarBall(
        this.ball,
        { x: car.position.x, z: car.position.z, vx: car.velocity.x, vz: car.velocity.z },
        PHYSICS.carRadius
      )
      if (impact > 0) this._onTouch(id, impact, now)
    }
  }

  _onTouch(id, impact, now) {
    const g = this.game
    this.ball.lastTouchId = id
    this.ball.lastTouchTeam = this.teams[id] ?? null
    if (impact > 3 && now - this._lastHitSound > 90) {
      this._lastHitSound = now
      audio.playAt('ball_hit', this.ball.x, this.ball.z, { volume: Math.min(1, impact / 16) })
      if (impact > 12) g.particles.spawnTagBurst(this.ball.x, this.ball.z, 0xffffff)
    }
    if (!this.isAuthority && id === g.localId) {
      this._localHitAt = now
      if (now - this._lastSentHit > 50) {
        this._lastSentHit = now
        g.network.sendBallHit({ x: this.ball.x, z: this.ball.z, vx: this.ball.vx, vz: this.ball.vz })
      }
    }
  }

  _goal(goalFor) {
    const { lastTouchId, lastTouchTeam } = this.ball
    const own = lastTouchTeam !== null && lastTouchTeam !== undefined && lastTouchTeam !== goalFor
    const ev = this.match.scoreGoal(goalFor, lastTouchId, own)
    if (!ev) return
    if (lastTouchId) {
      const book = own ? this.ownGoalsBy : this.goalsBy
      book[lastTouchId] = (book[lastTouchId] || 0) + 1
    }
    this._emit(ev)
  }

  _checkBoostPads(car) {
    const now = Date.now()
    const pads = this.game.scene.boostPads
    pads.forEach((pad, i) => {
      if (now < this.padReadyAt[i]) return
      if (Math.hypot(car.position.x - pad.x, car.position.z - pad.z) > BOOST_PAD_RADIUS + 0.6) return
      car.statusEffects.boostUntil = Math.max(car.statusEffects.boostUntil, now + BOOST_PAD_BURST_MS)
      this.padReadyAt[i] = now + BOOST_PAD_COOLDOWN_MS
      audio.play('item_pickup')
    })
  }

  _updateBoostPadVisuals() {
    const now = Date.now()
    this.game.scene.boostPads.forEach((pad, i) => {
      const ready = now >= this.padReadyAt[i]
      pad.discMat.opacity = ready ? 0.85 : 0.18
      pad.ringMat.opacity = ready ? 0.9 : 0.12
    })
  }

  // ------------------------------------------------------- events and sync

  /** The host's referee decisions: tell everyone, and react locally. */
  _emit(ev) {
    if (!this.practice) this.game.network.sendMatchEvent(ev)
    this._onEvent(ev)
  }

  _onEvent(ev) {
    const g = this.game
    switch (ev.type) {
      case 'goal': {
        const scorer = this._nameOf(ev.scorerId)
        const sub = ev.ownGoal ? `Own goal${scorer ? ' by ' + scorer : ''}` : scorer ? scorer : ''
        ui.setCenterBanner('GOAL!', `team-${ev.team}`, sub)
        audio.play('goal_scored')
        const side = ev.team === 0 ? 1 : -1 // team 0 scores in the +x goal
        for (let i = 0; i < 3; i++) g.particles.spawnTagBurst(side * (FIELD.halfX + 4), (i - 1) * 5, TEAMS[ev.team].color)
        this._countNumber = null
        break
      }
      case 'kickoff':
        this._kickoff()
        ui.setCenterBanner('', '')
        break
      case 'play':
        this._teamHint = ''
        ui.setCenterBanner('GO!', 'go', '', 900)
        audio.play('round_start')
        this._countNumber = null
        break
      case 'overtime':
        ui.setCenterBanner('OVERTIME', 'overtime', 'Next goal wins', 2600)
        audio.play('overtime')
        break
      case 'end':
        if (this.isAuthority && !this.practice) {
          g._hostEndRound(Date.now(), { soccer: { scores: [...this.match.scores], winner: ev.winner, goals: this.goalsBy, own: this.ownGoalsBy } })
        }
        break
    }
  }

  _kickoff() {
    resetBall(this.ball)
    this.hitCooldown.clear()
    if (!this.practice) this._placeAllCars()
  }

  /** Guests: the host's ball update. */
  onBallState(d, peerId) {
    if (this.isAuthority || !d || !this._fromHost(peerId)) return
    if (![d.x, d.z, d.vx, d.vz].every(Number.isFinite)) return
    const now = performance.now()
    const wasPhase = this.match.phase
    this.match.applySnapshot(d.m)
    this._receivedAt = now
    if (typeof d.lt === 'string' || d.lt === null) {
      this.ball.lastTouchId = d.lt
      this.ball.lastTouchTeam = d.lt ? (this.teams[d.lt] ?? null) : null
    }
    if (this.match.phase === PHASE.COUNTDOWN || wasPhase === PHASE.COUNTDOWN) {
      this.ball.x = d.x; this.ball.z = d.z; this.ball.vx = d.vx; this.ball.vz = d.vz
      return
    }
    // someone else's kick shows up as a sudden change in the ball's velocity
    const dv = Math.hypot(d.vx - this.ball.vx, d.vz - this.ball.vz)
    if (dv > 9 && now - this._lastHitSound > 120) {
      this._lastHitSound = now
      audio.playAt('ball_hit', d.x, d.z, { volume: Math.min(1, dv / 24) })
    }
    if (now - this._localHitAt < 250) return // my own fresh hit: the host hasn't seen it yet
    const err = Math.hypot(d.x - this.ball.x, d.z - this.ball.z)
    if (err > 6) {
      this.ball.x = d.x; this.ball.z = d.z; this.ball.vx = d.vx; this.ball.vz = d.vz
    } else {
      this.ball.x += (d.x - this.ball.x) * 0.4
      this.ball.z += (d.z - this.ball.z) * 0.4
      this.ball.vx += (d.vx - this.ball.vx) * 0.5
      this.ball.vz += (d.vz - this.ball.vz) * 0.5
    }
  }

  /** Host: a guest says it just hit the ball. Adopt its result if it's plausible. */
  onBallHit(d, peerId) {
    const car = this.game.cars.get(peerId)
    if (!this.isAuthority || this.practice || !d || !car) return
    if (![d.x, d.z, d.vx, d.vz].every(Number.isFinite)) return
    if (this.match.phase !== PHASE.PLAYING && this.match.phase !== PHASE.GOAL) return
    if (Math.hypot(d.x - this.ball.x, d.z - this.ball.z) > 9) return // nowhere near where the host sees the ball
    if (Math.hypot(car.position.x - this.ball.x, car.position.z - this.ball.z) > 12) return // ...or that guest's car
    this.ball.x += (d.x - this.ball.x) * 0.6
    this.ball.z += (d.z - this.ball.z) * 0.6
    const speed = Math.hypot(d.vx, d.vz)
    const k = speed > BALL_PHYSICS.maxSpeed ? BALL_PHYSICS.maxSpeed / speed : 1
    this.ball.vx = d.vx * k
    this.ball.vz = d.vz * k
    this.ball.lastTouchId = peerId
    this.ball.lastTouchTeam = this.teams[peerId] ?? null
    this.hitCooldown.set(peerId, performance.now() + 350)
  }

  /** Guests: a referee decision from the host. */
  onMatchEvent(ev, peerId) {
    if (this.isAuthority || !ev || typeof ev.type !== 'string' || !this._fromHost(peerId)) return
    this.match.applySnapshot(ev.state)
    this._receivedAt = performance.now()
    this._onEvent(ev)
  }

  _fromHost(peerId) {
    const host = this.game._hostId()
    return !host || peerId === host
  }

  // --------------------------------------------------------- cars and looks

  _spotFor(id) {
    if (this.practice) return this.game.scene.practiceSpot
    const team = this.teams[id]
    if (team !== 0 && team !== 1) return this.game.scene.spawnPoint(0, 1)
    const { slot, size } = slotFor(id, this.teams)
    return kickoffSpot(team, slot, size)
  }

  /** Everyone back to their kickoff spot, stationary. Every peer does this
   * for every car, so nobody sees cars slide across the pitch on a reset. */
  _placeAllCars() {
    for (const [id, car] of this.game.cars) {
      const s = this._spotFor(id)
      car.position.set(s.x, 0, s.z)
      car.heading = s.heading
      car.velocity.set(0, 0, 0)
      car.speed = 0
      car.mesh.position.copy(car.position)
      car.mesh.rotation.y = s.heading
      if (id !== this.game.localId) {
        car.setNetworkSnapshot(s.x, s.z, s.heading, false)
        car.netTarget.position.set(s.x, 0, s.z)
      }
    }
  }

  _applyTeamLooks() {
    for (const [id, car] of this.game.cars) {
      const t = TEAMS[this.teams[id]]
      if (t) car.setChaserVisual(true, t.color) // reuse the status ring as a team ring
    }
  }

  _nameOf(id) {
    return id ? this.game.roundPlayers.find((p) => p.id === id)?.name || '' : ''
  }

  // --------------------------------------------------------------- visuals

  _renderBall(dt) {
    if (!this.ballMesh) return
    const b = this.ball
    this.ballMesh.group.position.set(b.x, 0, b.z)
    const speed = ballSpeed(b)
    if (speed > 0.05 && dt > 0) {
      // roll without slipping: spin about the axis at right angles to the travel direction
      this._rollAxis.set(b.vz / speed, 0, -b.vx / speed)
      this.ballMesh.mesh.rotateOnWorldAxis(this._rollAxis, (speed * dt) / BALL_RADIUS)
    }
  }

  _updateHud(now) {
    const m = this.match
    const guest = !this.isAuthority
    const sinceMsg = now - this._receivedAt

    let clock
    if (this.practice) clock = 'FREE PLAY'
    else if (m.overtime) clock = 'OVERTIME'
    else {
      const left = Math.max(0, m.remainingMs - (guest && m.phase === PHASE.PLAYING ? sinceMsg : 0))
      const total = Math.ceil(left / 1000)
      clock = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
    }
    ui.setScoreboard({ a: m.scores[0], b: m.scores[1], clock, mine: this.localTeam, practice: this.practice })

    if (m.phase === PHASE.COUNTDOWN) {
      const left = Math.max(0, m.phaseMs - (guest ? sinceMsg : 0))
      const n = Math.max(1, Math.ceil(left / 1000))
      if (n !== this._countNumber) {
        this._countNumber = n
        ui.setCenterBanner(String(n), 'count', this._teamHint)
        audio.play('kickoff_beep')
      }
    }
  }
}

// ----------------------------------------------------------------- results

/** Rows for the results screen from the host's final payload. */
export function buildSoccerResults(soccer, roundPlayers, teams) {
  const [a, b] = soccer.scores
  const winner = soccer.winner
  const title = winner === null || winner === undefined ? `Draw ${a}–${b}` : `${TEAMS[winner].name} win ${Math.max(a, b)}–${Math.min(a, b)}`
  const goals = soccer.goals || {}
  const own = soccer.own || {}
  const rows = roundPlayers
    .map((p) => ({ p, team: teams[p.id], g: goals[p.id] || 0, og: own[p.id] || 0 }))
    .sort((x, y) => (x.team === winner ? 0 : 1) - (y.team === winner ? 0 : 1) || y.g - x.g || x.p.name.localeCompare(y.p.name))
    .map(({ p, team, g, og }) => ({
      name: p.name,
      color: TEAMS[team]?.css || p.color,
      detail: `${TEAMS[team]?.name || ''} · ${g} goal${g === 1 ? '' : 's'}${og ? ` · ${og} own goal${og === 1 ? '' : 's'}` : ''}`,
    }))
  return { title, rows }
}

export { assignTeams }
