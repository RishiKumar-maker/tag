import * as THREE from '../lib/three.module.min.js'

// Purely visual. Nothing in here feeds back into physics or the network, so it
// can be tuned freely. It runs identically for the local car (real velocity)
// and remote cars (velocity inferred from their smoothed network position).

export const DRIFT_LEVEL_SECONDS = [0.6, 1.4, 2.4] // time held to reach spark level 1 / 2 / 3
const MAX_ROLL = 0.16 // radians, ~9 degrees
const MAX_PITCH = 0.07
const MAX_COUNTERSTEER = 0.55

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const smooth = (rate, dt) => 1 - Math.exp(-rate * dt)

function angleDiff(a, b) {
  return ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI
}

export class CarAnimator {
  /** body: the Group wrapping only the vehicle (so shadow/name tag don't tilt).
   * wheels: [{ pivot, spin, isFront }] from carLibrary. */
  constructor({ body, wheels = [] }) {
    this.body = body
    this.wheels = wheels

    this.roll = 0
    this.pitch = 0
    this.steerAngle = 0
    this.driftBlend = 0 // 0..1, eased in/out of a drift; also drives the camera
    this.skid = 0 // 0..1 how hard the tyres are sliding right now (marks + smoke)
    this.driftTime = 0
    this.driftLevel = 0

    this._prevHeading = null
    this._prevForward = 0
    this._headingRate = 0
    this._accel = 0
    this._levelUps = 0
  }

  /** s: { heading, forwardSpeed, lateralSpeed, steer (-1..1 or null),
   *       isDrifting, slipping } -- lateral is + toward the car's left. */
  update(dt, s) {
    if (dt <= 0) return
    const { forwardSpeed, lateralSpeed } = s

    if (this._prevHeading === null) this._prevHeading = s.heading
    const rawRate = angleDiff(s.heading, this._prevHeading) / dt
    this._prevHeading = s.heading
    this._headingRate += (THREE.MathUtils.clamp(rawRate, -6, 6) - this._headingRate) * smooth(14, dt)

    const rawAccel = (forwardSpeed - this._prevForward) / dt
    this._prevForward = forwardSpeed
    this._accel += (THREE.MathUtils.clamp(rawAccel, -70, 70) - this._accel) * smooth(10, dt)

    // --- how hard are the tyres sliding? ---
    const sliding = s.isDrifting || s.slipping
    const slide = Math.max(
      THREE.MathUtils.clamp(Math.abs(lateralSpeed) / 5, 0, 1),
      THREE.MathUtils.clamp(Math.abs(this._headingRate) / 2.6, 0, 1) * 0.8
    )
    const fastEnough = Math.abs(forwardSpeed) > 4
    const skidTarget = sliding && fastEnough ? slide : 0
    this.skid += (skidTarget - this.skid) * smooth(skidTarget > this.skid ? 18 : 8, dt)

    this.driftBlend += ((s.isDrifting && fastEnough ? 1 : 0) - this.driftBlend) * smooth(8, dt)

    // --- drift charge (cosmetic: sparks change colour as you hold it) ---
    if (s.isDrifting && this.skid > 0.3) this.driftTime += dt
    else this.driftTime = 0
    const level = DRIFT_LEVEL_SECONDS.filter((t) => this.driftTime >= t).length
    if (level > this.driftLevel) this._levelUps++
    this.driftLevel = level

    // --- body roll (lean out of the turn) and pitch (squat / dive) ---
    const motion = reducedMotion ? 0.35 : 1
    const lateralAccel = this._headingRate * forwardSpeed
    const rollTarget = THREE.MathUtils.clamp(lateralAccel * 0.0022 * (1 + this.driftBlend * 0.35), -MAX_ROLL, MAX_ROLL) * motion
    const pitchTarget = THREE.MathUtils.clamp(-this._accel * 0.0016, -MAX_PITCH, MAX_PITCH) * motion
    this.roll += (rollTarget - this.roll) * smooth(9, dt)
    this.pitch += (pitchTarget - this.pitch) * smooth(8, dt)
    this.body.rotation.set(this.pitch, 0, this.roll)

    // --- front wheels: follow the input normally, counter-steer into the slide while drifting ---
    const input = s.steer ?? THREE.MathUtils.clamp(this._headingRate / 2.5, -1, 1)
    const slipAngle = THREE.MathUtils.clamp(Math.atan2(lateralSpeed, Math.max(Math.abs(forwardSpeed), 1)), -MAX_COUNTERSTEER, MAX_COUNTERSTEER)
    const steerTarget = THREE.MathUtils.lerp(input * 0.5, slipAngle, this.driftBlend)
    this.steerAngle += (steerTarget - this.steerAngle) * smooth(16, dt)

    // --- wheels: roll with the road; rear wheels over-spin while drifting ---
    const spinStep = forwardSpeed * 1.25 * dt
    for (const w of this.wheels) {
      if (w.isFront) w.pivot.rotation.y = this.steerAngle
      if (w.spin) w.spin.rotation.x = (w.spin.rotation.x + spinStep * (!w.isFront && this.driftBlend > 0.5 ? 1.5 : 1)) % (Math.PI * 2)
    }
  }

  /** True once per drift-level-up; the local car uses it for a sound. */
  consumeLevelUp() {
    if (this._levelUps <= 0) return false
    this._levelUps = 0
    return true
  }
}
