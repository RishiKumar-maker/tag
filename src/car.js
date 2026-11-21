import * as THREE from '../lib/three.module.min.js'
import {
  CHASER_SPEED_MULTIPLIER, STUN_MS, SLIP_MS, SLIP_TRACTION, BOOST_MS, BOOST_MULTIPLIER, SHIELD_MS,
} from './constants.js'
import { CarAnimator } from './carAnimation.js'
import { createShieldVisual, createBoostFlames } from './abilityModels.js'

// Tuned constants for the arcade drift model. Feel free to nudge these.
export const PHYSICS = {
  maxForwardSpeed: 26,
  maxReverseSpeed: 9,
  engineForce: 34,
  brakeForce: 46,
  dragCoeff: 1.1,
  turnRateBase: 2.8,     // rad/s at full speed
  gripTraction: 9,       // higher = lateral slip dies out fast (grippy)
  driftTraction: 1.6,    // lower = lateral slip persists (slides)
  driftTurnBoost: 1.35,  // extra rotation while drifting, for that swingy feel
  driftMinSpeed: 4,      // must be moving at least this fast to drift
  carRadius: 1.25,       // rough bounding radius for collisions
}

const REMOTE_SMOOTH_DECAY = 12 // higher = snaps to network state faster

function createNameSprite(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')

  ctx.font = '600 30px system-ui, -apple-system, sans-serif'
  const textWidth = ctx.measureText(name).width
  const pillWidth = Math.min(canvas.width - 8, textWidth + 40)
  const pillHeight = 44
  const x = (canvas.width - pillWidth) / 2
  const y = (canvas.height - pillHeight) / 2
  const r = pillHeight / 2

  ctx.fillStyle = 'rgba(30, 23, 48, 0.55)'
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + pillWidth - r, y)
  ctx.arcTo(x + pillWidth, y, x + pillWidth, y + r, r)
  ctx.lineTo(x + pillWidth, y + pillHeight - r)
  ctx.arcTo(x + pillWidth, y + pillHeight, x + pillWidth - r, y + pillHeight, r)
  ctx.lineTo(x + r, y + pillHeight)
  ctx.arcTo(x, y + pillHeight, x, y + pillHeight - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#f5f0fa'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(2.1, 0.53, 1)
  sprite.position.set(0, 2.35, 0)
  return sprite
}

export class Car {
  constructor({ color = 0xff8c69, isLocal = false, vehicle, wheels, dims, name = '' } = {}) {
    this.isLocal = isLocal
    this.color = color

    this.position = new THREE.Vector3(0, 0, 0)
    this.heading = 0 // radians, 0 = facing +Z
    this.velocity = new THREE.Vector3()
    this.speed = 0
    this.isDrifting = false
    this.speedFraction = 0 // |speed| / this car's current top speed, 0..1 (camera + audio)
    this.isChaser = false
    this.statusEffects = { stunnedUntil: 0, slippingUntil: 0, boostUntil: 0, shieldUntil: 0 }

    this.input = { throttle: 0, steer: 0, drift: false }
    this.netTarget = null

    this._forward = new THREE.Vector3()
    this._right = new THREE.Vector3()

    this.wheels = wheels || []
    this.dims = dims || { rearWheelX: 0.83, rearWheelZ: -0.85, rearZ: -1.3, exhaustX: 0.42, exhaustY: 0.34 }
    this.mesh = this._assembleMesh(vehicle, name)
    this.animator = new CarAnimator({ body: this.body, wheels: this.wheels })
  }

  _assembleMesh(vehicle, name) {
    const group = new THREE.Group()
    // Only the vehicle sits in `body`, so roll/pitch tilts the car without
    // tilting its shadow, status ring or name tag.
    this.body = new THREE.Group()
    if (vehicle) this.body.add(vehicle)
    group.add(this.body)

    this.boostFlames = createBoostFlames(this.dims)
    this.body.add(this.boostFlames.object)

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 })
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = 0.015
    group.add(shadow)

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 1.95, 24),
      new THREE.MeshBasicMaterial({ color: 0xff8c69, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.03
    ring.visible = false
    group.add(ring)
    this.statusRing = ring

    if (name) group.add(createNameSprite(name))

    this.shield = createShieldVisual()
    group.add(this.shield.object)

    return group
  }

  /** Apply a status effect. Shield blocks any hostile effect except itself.
   * Returns false if the effect was blocked. */
  applyEffect(type, now = Date.now()) {
    if (type !== 'shield' && this.isShielded(now)) return false
    if (type === 'stun') this.statusEffects.stunnedUntil = Math.max(this.statusEffects.stunnedUntil, now + STUN_MS)
    else if (type === 'slip') this.statusEffects.slippingUntil = Math.max(this.statusEffects.slippingUntil, now + SLIP_MS)
    else if (type === 'boost') this.statusEffects.boostUntil = now + BOOST_MS
    else if (type === 'shield') this.statusEffects.shieldUntil = now + SHIELD_MS
    return true
  }

  isShielded(now = Date.now()) {
    return now < this.statusEffects.shieldUntil
  }

  isBoosted(now = Date.now()) {
    return now < this.statusEffects.boostUntil
  }

  setChaserVisual(isChaser, teamColorHex) {
    this.isChaser = isChaser
    this.statusRing.visible = isChaser
    if (isChaser) this.statusRing.material.color.setHex(teamColorHex ?? 0xff8c69)
  }

  applyInput(input) {
    this.input = input
  }

  /** Local physics step, only used for the player's own car. */
  step(dt) {
    dt = Math.min(dt, 0.05)
    const now = Date.now()
    const stunned = now < this.statusEffects.stunnedUntil
    const slipping = now < this.statusEffects.slippingUntil
    const boosted = now < this.statusEffects.boostUntil

    const rawInput = this.input
    const throttle = stunned ? 0 : rawInput.throttle
    const steer = stunned ? 0 : rawInput.steer
    const drift = stunned ? false : rawInput.drift

    const speedMult = (this.isChaser ? CHASER_SPEED_MULTIPLIER : 1) * (boosted ? BOOST_MULTIPLIER : 1)
    const maxForward = PHYSICS.maxForwardSpeed * speedMult
    const engineForce = PHYSICS.engineForce * speedMult

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / maxForward, 0.15, 1)
    this.isDrifting = !!drift && Math.abs(this.speed) > PHYSICS.driftMinSpeed

    // Heading rotation direction flips once the car is actually travelling
    // backward, so steering still feels intuitive in reverse instead of
    // curving the opposite way it looks like it should on screen. The
    // wheel-turn visual below intentionally keeps using raw `steer`.
    const movingBackward = this.speed < -0.15
    const effectiveSteer = movingBackward ? -steer : steer

    const turnBoost = this.isDrifting ? PHYSICS.driftTurnBoost : 1
    this.heading += effectiveSteer * PHYSICS.turnRateBase * speedFactor * turnBoost * dt

    this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading))

    let forwardSpeed = this.velocity.dot(this._forward)
    let lateralSpeed = this.velocity.dot(this._right)

    if (throttle > 0) forwardSpeed += throttle * engineForce * dt
    else if (throttle < 0) forwardSpeed += throttle * PHYSICS.brakeForce * dt

    forwardSpeed *= Math.max(0, 1 - PHYSICS.dragCoeff * dt)
    forwardSpeed = THREE.MathUtils.clamp(forwardSpeed, -PHYSICS.maxReverseSpeed, maxForward)

    const traction = slipping ? SLIP_TRACTION : (this.isDrifting ? PHYSICS.driftTraction : PHYSICS.gripTraction)
    lateralSpeed *= Math.max(0, 1 - traction * dt)

    this.velocity.copy(this._forward).multiplyScalar(forwardSpeed).addScaledVector(this._right, lateralSpeed)
    this.position.addScaledVector(this.velocity, dt)
    this.speed = forwardSpeed
    this.speedFraction = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / maxForward, 0, 1)
    this.slipping = slipping

    this._animate(dt, steer)
  }

  /** Remote cars don't run physics locally; they smoothly chase the last network snapshot. */
  stepRemote(dt) {
    if (!this.netTarget) return
    dt = Math.max(dt, 0.0001)
    const t = 1 - Math.exp(-REMOTE_SMOOTH_DECAY * dt)
    const px = this.position.x
    const pz = this.position.z
    this.position.lerp(this.netTarget.position, t)
    this.heading = this._lerpAngle(this.heading, this.netTarget.heading, t)
    this.isDrifting = this.netTarget.isDrifting

    // No physics for remote cars, so infer their velocity from how far the
    // smoothed position moved. That's all the animator needs to roll, spin
    // and skid them the same way as the local car.
    const k = 1 - Math.exp(-10 * dt)
    this.velocity.x += ((this.position.x - px) / dt - this.velocity.x) * k
    this.velocity.z += ((this.position.z - pz) / dt - this.velocity.z) * k
    this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.speed = this.velocity.dot(this._forward)
    this.speedFraction = THREE.MathUtils.clamp(Math.abs(this.speed) / PHYSICS.maxForwardSpeed, 0, 1)
    this.slipping = Date.now() < this.statusEffects.slippingUntil

    this._animate(dt, null)
  }

  setNetworkSnapshot(x, z, heading, isDrifting) {
    if (!this.netTarget) this.netTarget = { position: new THREE.Vector3(x, 0, z), heading, isDrifting }
    else {
      this.netTarget.position.set(x, 0, z)
      this.netTarget.heading = heading
      this.netTarget.isDrifting = isDrifting
    }
  }

  _lerpAngle(a, b, t) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
    if (diff < -Math.PI) diff += Math.PI * 2
    return a + diff * t
  }

  /** Feed the animator this frame's motion, then place the mesh. */
  _animate(dt, steerInput) {
    this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading)) // +X side when heading is 0, i.e. the car's left
    this.animator.update(dt, {
      heading: this.heading,
      forwardSpeed: this.velocity.dot(this._forward),
      lateralSpeed: this.velocity.dot(this._right),
      steer: steerInput,
      isDrifting: this.isDrifting,
      slipping: !!this.slipping,
    })
    this._syncMesh(dt)
  }

  _syncMesh(dt) {
    this.mesh.position.copy(this.position)
    this.mesh.rotation.y = this.heading
    const now = Date.now()
    this.shield.update(dt, this.statusEffects.shieldUntil - now)
    this.boostFlames.update(dt, this.isBoosted(now))
  }
}
