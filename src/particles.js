import * as THREE from '../lib/three.module.min.js'

const MAX_PARTICLES = 70
const sharedGeo = new THREE.CircleGeometry(0.4, 8)

export class ParticleSystem {
  constructor(scene) {
    this.pool = []
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
      const mesh = new THREE.Mesh(sharedGeo, mat)
      mesh.visible = false
      mesh.rotation.x = -Math.PI / 2
      scene.add(mesh)
      this.pool.push({ mesh, life: 0, maxLife: 0, vel: new THREE.Vector3(), baseOpacity: 0, kind: 'smoke' })
    }
    this.cursor = 0
  }

  _next() {
    const p = this.pool[this.cursor]
    this.cursor = (this.cursor + 1) % this.pool.length
    return p
  }

  spawnDriftSmoke(x, z, vx, vz) {
    const p = this._next()
    p.kind = 'smoke'
    p.mesh.visible = true
    p.mesh.position.set(x, 0.22, z)
    p.mesh.scale.setScalar(0.35)
    p.life = 0
    p.maxLife = 0.55 + Math.random() * 0.25
    p.vel.set(vx * 0.12 + (Math.random() - 0.5) * 0.5, 0.3, vz * 0.12 + (Math.random() - 0.5) * 0.5)
    p.baseOpacity = 0.32
    p.mesh.material.opacity = p.baseOpacity
    p.mesh.material.color.setHex(0xffffff)
  }

  spawnTagBurst(x, z, colorHex) {
    for (let i = 0; i < 12; i++) {
      const p = this._next()
      const a = Math.random() * Math.PI * 2
      p.kind = 'burst'
      p.mesh.visible = true
      p.mesh.position.set(x, 0.5, z)
      p.mesh.scale.setScalar(0.28)
      p.life = 0
      p.maxLife = 0.35 + Math.random() * 0.2
      p.vel.set(Math.cos(a) * 3.2, 1.8 + Math.random() * 1.2, Math.sin(a) * 3.2)
      p.baseOpacity = 0.95
      p.mesh.material.opacity = p.baseOpacity
      p.mesh.material.color.setHex(colorHex)
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.mesh.visible) continue
      p.life += dt
      if (p.life >= p.maxLife) {
        p.mesh.visible = false
        continue
      }
      p.mesh.position.addScaledVector(p.vel, dt)
      if (p.kind === 'burst') p.vel.y -= 5 * dt

      const tRemain = 1 - p.life / p.maxLife
      p.mesh.material.opacity = tRemain * p.baseOpacity
      if (p.kind === 'smoke') p.mesh.scale.addScalar(dt * 0.6)
    }
  }
}
