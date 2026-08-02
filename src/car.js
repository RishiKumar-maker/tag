import * as THREE from '../lib/three.module.min.js'

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

export class Car {
  constructor({ color = 0xff8c69, isLocal = false } = {}) {
    this.isLocal = isLocal
    this.color = color

    this.position = new THREE.Vector3(0, 0, 0)
    this.heading = 0 // radians, 0 = facing +Z
    this.velocity = new THREE.Vector3()
    this.speed = 0
    this.isDrifting = false
    this.steerVisual = 0

    this.input = { throttle: 0, steer: 0, drift: false }
    this.netTarget = null

    this._forward = new THREE.Vector3()
    this._right = new THREE.Vector3()

    this.mesh = this._buildMesh()
  }

  _buildMesh() {
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshLambertMaterial({ color: this.color, flatShading: true })
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2233, flatShading: true })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, flatShading: true, transparent: true, opacity: 0.85 })

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.6), bodyMat)
    body.position.y = 0.42
    group.add(body)

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.3), glassMat)
    cabin.position.set(0, 0.86, -0.1)
    group.add(cabin)

    const bumperGeo = new THREE.BoxGeometry(1.56, 0.22, 0.3)
    const bumper = new THREE.Mesh(bumperGeo, darkMat)
    bumper.position.set(0, 0.28, 1.3)
    group.add(bumper)

    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.32, 10)
    const wheelSpecs = [
      { x: -0.83, z: 0.85, front: true },
      { x: 0.83, z: 0.85, front: true },
      { x: -0.83, z: -0.85, front: false },
      { x: 0.83, z: -0.85, front: false },
    ]
    this.wheels = wheelSpecs.map(spec => {
      const pivot = new THREE.Group()
      pivot.position.set(spec.x, 0.34, spec.z)
      const wheelMesh = new THREE.Mesh(wheelGeo, darkMat)
      wheelMesh.rotation.z = Math.PI / 2
      pivot.add(wheelMesh)
      group.add(pivot)
      return { pivot, isFront: spec.front }
    })

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

    return group
  }

  setChaserVisual(isChaser, teamColorHex) {
    this.statusRing.visible = isChaser
    if (isChaser) this.statusRing.material.color.setHex(teamColorHex ?? 0xff8c69)
  }

  setBodyColor(hex) {
    this.color = hex
    this.mesh.children[0].material.color.setHex(hex)
  }

  applyInput(input) {
    this.input = input
  }

  /** Local physics step, only used for the player's own car. */
  step(dt) {
    dt = Math.min(dt, 0.05)
    const { throttle, steer, drift } = this.input

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / PHYSICS.maxForwardSpeed, 0.15, 1)
    this.isDrifting = !!drift && Math.abs(this.speed) > PHYSICS.driftMinSpeed

    const turnBoost = this.isDrifting ? PHYSICS.driftTurnBoost : 1
    this.heading += steer * PHYSICS.turnRateBase * speedFactor * turnBoost * dt
    this.steerVisual = THREE.MathUtils.lerp(this.steerVisual, steer * 0.5, 0.2)

    this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading))

    let forwardSpeed = this.velocity.dot(this._forward)
    let lateralSpeed = this.velocity.dot(this._right)

    if (throttle > 0) forwardSpeed += throttle * PHYSICS.engineForce * dt
    else if (throttle < 0) forwardSpeed += throttle * PHYSICS.brakeForce * dt

    forwardSpeed *= Math.max(0, 1 - PHYSICS.dragCoeff * dt)
    forwardSpeed = THREE.MathUtils.clamp(forwardSpeed, -PHYSICS.maxReverseSpeed, PHYSICS.maxForwardSpeed)

    const traction = this.isDrifting ? PHYSICS.driftTraction : PHYSICS.gripTraction
    lateralSpeed *= Math.max(0, 1 - traction * dt)

    this.velocity.copy(this._forward).multiplyScalar(forwardSpeed).addScaledVector(this._right, lateralSpeed)
    this.position.addScaledVector(this.velocity, dt)
    this.speed = forwardSpeed

    this._syncMesh()
  }

  /** Remote cars don't run physics locally; they smoothly chase the last network snapshot. */
  stepRemote(dt) {
    if (!this.netTarget) return
    const t = 1 - Math.exp(-REMOTE_SMOOTH_DECAY * dt)
    this.position.lerp(this.netTarget.position, t)
    this.heading = this._lerpAngle(this.heading, this.netTarget.heading, t)
    this.isDrifting = this.netTarget.isDrifting
    this._syncMesh()
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

  _syncMesh() {
    this.mesh.position.copy(this.position)
    this.mesh.rotation.y = this.heading
    for (const w of this.wheels) {
      if (w.isFront) w.pivot.rotation.y = this.steerVisual
    }
  }
}
