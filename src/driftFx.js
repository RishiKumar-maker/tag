import * as THREE from '../lib/three.module.min.js'

// Tyre marks, smoke and drift-charge sparks. One DriftFx serves every car in
// the scene, so remote players' drifts look the same as yours.

const SPARK_COLORS = [0xffffff, 0x7fdbb6, 0xff8c69, 0xb8a6e0] // by drift level 0..3
const SPARK_RATE = [0, 14, 26, 38] // sparks per second per car, by level
const SMOKE_RATE = 34 // puffs per second per car at full skid

const MARK_LIFETIME = 6.5 // seconds
const MARK_FADE_AFTER = 2.5
const MARK_MIN_STEP = 0.55 // world units a tyre must travel before the next segment

/** Tyre marks as ONE InstancedMesh (one draw call for hundreds of marks).
 * Multiply blending darkens whatever ground is underneath, and fading a mark
 * out is just lerping its colour back to white -- so no alpha, no custom
 * shaders, and it works unchanged on any future map's ground colour. */
export class SkidMarks {
  constructor(scene, capacity = 360) {
    this.capacity = capacity
    const geo = new THREE.PlaneGeometry(1, 1)
    geo.rotateX(-Math.PI / 2) // lie flat, long side along Z
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true, // three requires this for MultiplyBlending
      transparent: true,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)

    this._born = new Float32Array(capacity).fill(-1)
    this._dark = new Float32Array(capacity)
    this._cursor = 0
    this._dummy = new THREE.Object3D()
    this._color = new THREE.Color()
    this._hide = new THREE.Matrix4().makeScale(0, 0, 0)
    for (let i = 0; i < capacity; i++) {
      this.mesh.setMatrixAt(i, this._hide)
      this.mesh.setColorAt(i, this._color.setScalar(1))
    }
    scene.add(this.mesh)
  }

  addSegment(x1, z1, x2, z2, strength, width = 0.34) {
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 0.01) return
    const i = this._cursor
    this._cursor = (this._cursor + 1) % this.capacity

    const d = this._dummy
    d.position.set((x1 + x2) / 2, 0.03, (z1 + z2) / 2)
    d.rotation.set(0, Math.atan2(dx, dz), 0)
    d.scale.set(width, 1, len) // butt-joined: overlap would double-darken under multiply blending
    d.updateMatrix()
    this.mesh.setMatrixAt(i, d.matrix)
    this._born[i] = performance.now() / 1000
    this._dark[i] = 0.25 + 0.45 * strength // how much the ground is darkened at full strength
    this.mesh.setColorAt(i, this._color.setScalar(1 - this._dark[i]))
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor.needsUpdate = true
  }

  update() {
    const now = performance.now() / 1000
    let touched = false
    for (let i = 0; i < this.capacity; i++) {
      const born = this._born[i]
      if (born < 0) continue
      const age = now - born
      if (age >= MARK_LIFETIME) {
        this._born[i] = -1
        this.mesh.setMatrixAt(i, this._hide)
        this.mesh.setColorAt(i, this._color.setScalar(1))
        this.mesh.instanceMatrix.needsUpdate = true
        touched = true
      } else if (age > MARK_FADE_AFTER) {
        const t = (age - MARK_FADE_AFTER) / (MARK_LIFETIME - MARK_FADE_AFTER)
        this.mesh.setColorAt(i, this._color.setScalar(1 - this._dark[i] * (1 - t)))
        touched = true
      }
    }
    if (touched) this.mesh.instanceColor.needsUpdate = true
  }

  clear() {
    this._born.fill(-1)
    for (let i = 0; i < this.capacity; i++) {
      this.mesh.setMatrixAt(i, this._hide)
      this.mesh.setColorAt(i, this._color.setScalar(1))
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh)
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.mesh.dispose()
  }
}

export class DriftFx {
  constructor(scene, particles) {
    this.particles = particles
    this.marks = new SkidMarks(scene)
    this._state = new WeakMap() // car -> { last: [pos|null, pos|null], smoke, spark }
  }

  /** Call once per frame per car, after its animator has updated. */
  updateCar(car, dt) {
    const a = car.animator
    const dims = car.dims
    let st = this._state.get(car)
    if (!st) {
      st = { last: [null, null], smoke: 0, spark: 0 }
      this._state.set(car, st)
    }

    const sin = Math.sin(car.heading)
    const cos = Math.cos(car.heading)
    const wheelX = dims.rearWheelX
    const wheelZ = dims.rearWheelZ
    const marking = a.skid > 0.25

    const spots = [-1, 1].map((side) => {
      const lx = side * wheelX
      return { x: car.position.x + lx * cos + wheelZ * sin, z: car.position.z - lx * sin + wheelZ * cos }
    })

    spots.forEach((p, i) => {
      const last = st.last[i]
      if (marking) {
        if (last && Math.hypot(p.x - last.x, p.z - last.z) >= MARK_MIN_STEP) {
          this.marks.addSegment(last.x, last.z, p.x, p.z, a.skid)
          st.last[i] = p
        } else if (!last) {
          st.last[i] = p
        }
      } else {
        st.last[i] = null // lifted off: the next skid starts a fresh line
      }
    })

    if (!marking) { st.smoke = 0; st.spark = 0; return }

    st.smoke += dt * SMOKE_RATE * a.skid
    while (st.smoke >= 1) {
      st.smoke -= 1
      const p = spots[Math.random() < 0.5 ? 0 : 1]
      this.particles.spawnDriftSmoke(p.x, p.z, car.velocity.x, car.velocity.z)
    }

    const sparkRate = SPARK_RATE[a.driftLevel]
    if (sparkRate > 0) {
      st.spark += dt * sparkRate
      while (st.spark >= 1) {
        st.spark -= 1
        const p = spots[Math.random() < 0.5 ? 0 : 1]
        // thrown backwards and outward, away from the car's travel direction
        const out = (Math.random() - 0.5) * 3
        this.particles.spawnSpark(
          p.x, 0.18, p.z,
          -sin * 2.2 + cos * out + car.velocity.x * 0.3,
          1.2 + Math.random() * 1.6,
          -cos * 2.2 - sin * out + car.velocity.z * 0.3,
          SPARK_COLORS[a.driftLevel]
        )
      }
    } else {
      st.spark = 0
    }
  }

  update() {
    this.marks.update()
  }

  clear() {
    this.marks.clear()
  }

  dispose() {
    this.marks.dispose()
  }
}
