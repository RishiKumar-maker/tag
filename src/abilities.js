import * as THREE from '../lib/three.module.min.js'
import { PHYSICS } from './car.js'
import {
  SHOCKWAVE_RADIUS, HAZARD_RADIUS, HAZARD_LIFETIME_MS, HAZARD_REHIT_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_LIFETIME_MS, PROJECTILE_RADIUS, PROJECTILE_HOMING_TURN_RATE,
} from './constants.js'
import { cloneAbilityModel, collectFadeables, setFade } from './abilityModels.js'

export const ABILITY_TYPES = [
  { id: 'oilslick', name: 'Oil Slick', hint: 'Drops a slick behind you' },
  { id: 'shockwave', name: 'Shockwave', hint: 'Stuns everyone nearby' },
  { id: 'boost', name: 'Boost', hint: 'A burst of speed' },
  { id: 'homingshot', name: 'Homing Shot', hint: 'Fires a seeking shot' },
  { id: 'shield', name: 'Shield', hint: 'Blocks the next hit' },
]

export function randomAbilityId() {
  return ABILITY_TYPES[Math.floor(Math.random() * ABILITY_TYPES.length)].id
}

export function abilityName(id) {
  return ABILITY_TYPES.find((a) => a.id === id)?.name || id
}

const hazardGeo = new THREE.CircleGeometry(HAZARD_RADIUS, 16)
const hazardMat = new THREE.MeshBasicMaterial({ color: 0x241a30, transparent: true, opacity: 0.55 })
const projectileGeo = new THREE.SphereGeometry(PROJECTILE_RADIUS, 10, 8)
const projectileMat = new THREE.MeshBasicMaterial({ color: 0xff8c69 })

const SHOCKWAVE_MS = 550
const HAZARD_POP_MS = 260
const HAZARD_FADE_MS = 1000
const easeOut = (t) => 1 - Math.pow(1 - t, 3)
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)

/** Owns the temporary world objects abilities create (oil slicks, shots),
 * simulating them identically on every client from one broadcast event, and
 * checking only the LOCAL car for hits -- the same "target reports it"
 * principle the tag system already uses. */
export class AbilityManager {
  constructor(scene) {
    this.scene = scene
    this.hazards = [] // { mesh, x, z, expiresAt, recentHits: Map<carId, timestamp> }
    this.projectiles = [] // { useId, mesh, casterId, x, z, vx, vz, expiresAt }
    this.waves = [] // visual only: { mesh, fadeables, bornAt }
    this._t = 0
  }

  /** Handle a received (or self-issued) ability activation. Self-buffs are
   * applied directly to the caster's car; oil slick / homing shot spawn a
   * world entity that gets checked for hits every frame. Shockwave is an
   * instant radius check done by the caller (game.js), since it has no
   * persistent object. */
  handleUse({ abilityId, useId, casterId, x, z, heading }, cars) {
    const caster = cars.get(casterId)
    if (abilityId === 'boost') caster?.applyEffect('boost')
    else if (abilityId === 'shield') caster?.applyEffect('shield')
    else if (abilityId === 'shockwave') this._spawnShockwave(x, z)
    else if (abilityId === 'oilslick') this._spawnHazard(x, z)
    else if (abilityId === 'homingshot') this._spawnProjectile(useId, casterId, x, z, heading)
  }

  _spawnHazard(x, z) {
    const model = cloneAbilityModel('oilslick', { ownMaterials: true })
    let mesh
    if (model) {
      model.position.set(x, 0.015, z)
      model.rotation.y = Math.random() * Math.PI * 2 // every puddle gets its own outline
      mesh = model
    } else {
      mesh = new THREE.Mesh(hazardGeo, hazardMat.clone())
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(x, 0.05, z)
    }
    this.scene.scene.add(mesh)
    const now = Date.now()
    this.hazards.push({
      mesh, x, z, bornAt: now, expiresAt: now + HAZARD_LIFETIME_MS, recentHits: new Map(),
      isModel: !!model, fadeables: collectFadeables(mesh),
    })
  }

  /** Expanding ring. Purely visual: the stun itself is an instant radius check in game.js. */
  _spawnShockwave(x, z) {
    const mesh = cloneAbilityModel('shockwave', { ownMaterials: true })
    if (!mesh) return
    mesh.position.set(x, 0.12, z)
    mesh.scale.set(0.3, 1, 0.3)
    this.scene.scene.add(mesh)
    this.waves.push({ mesh, fadeables: collectFadeables(mesh), bornAt: Date.now() })
  }

  _spawnProjectile(useId, casterId, x, z, heading) {
    const model = cloneAbilityModel('homingshot')
    const mesh = model || new THREE.Mesh(projectileGeo, projectileMat)
    if (model) {
      model.scale.setScalar(1.4) // reads as clearly as the old 1.7-wide sphere did
      model.rotation.y = heading
    }
    mesh.position.set(x, 0.7, z)
    this.scene.scene.add(mesh)
    this.projectiles.push({
      useId,
      mesh,
      exhaust: model?.getObjectByName('Exhaust') || null,
      casterId,
      x, z,
      vx: Math.sin(heading) * PROJECTILE_SPEED,
      vz: Math.cos(heading) * PROJECTILE_SPEED,
      expiresAt: Date.now() + PROJECTILE_LIFETIME_MS,
    })
  }

  /** Remove a projectile everywhere once its target has confirmed a hit, so
   * every client's simulation agrees it's gone. */
  removeProjectile(useId) {
    const p = this.projectiles.find((p) => p.useId === useId)
    if (p) {
      this.scene.scene.remove(p.mesh)
      this.projectiles = this.projectiles.filter((x) => x !== p)
    }
  }

  update(dt, cars) {
    const now = Date.now()

    this._t += dt
    for (const h of this.hazards) {
      const age = now - h.bornAt
      const remaining = h.expiresAt - now
      if (h.isModel) {
        const pop = age < HAZARD_POP_MS ? easeOutBack(age / HAZARD_POP_MS) : 1
        h.mesh.scale.set(HAZARD_RADIUS * pop, HAZARD_RADIUS, HAZARD_RADIUS * pop)
      } else {
        h.mesh.rotation.z += dt * 0.4
      }
      if (remaining < HAZARD_FADE_MS) setFade(h.fadeables, Math.max(0, remaining / HAZARD_FADE_MS))
    }
    if (this.hazards.some((h) => now > h.expiresAt)) {
      for (const h of this.hazards) if (now > h.expiresAt) this.scene.scene.remove(h.mesh)
      this.hazards = this.hazards.filter((h) => now <= h.expiresAt)
    }

    for (const w of this.waves) {
      const t = Math.min((now - w.bornAt) / SHOCKWAVE_MS, 1)
      const r = 0.3 + (SHOCKWAVE_RADIUS * 0.92 - 0.3) * easeOut(t)
      w.mesh.scale.set(r, 1, r) // widen only: the ring thins out as it flies outward
      setFade(w.fadeables, 1 - t * t)
    }
    if (this.waves.some((w) => now - w.bornAt >= SHOCKWAVE_MS)) {
      for (const w of this.waves) if (now - w.bornAt >= SHOCKWAVE_MS) this.scene.scene.remove(w.mesh)
      this.waves = this.waves.filter((w) => now - w.bornAt < SHOCKWAVE_MS)
    }

    for (const p of this.projectiles) {
      // gentle homing toward the nearest car ahead, so it's not a flat laser
      let nearest = null
      let nearestDist = Infinity
      for (const [id, car] of cars) {
        if (id === p.casterId) continue
        const dx = car.position.x - p.x
        const dz = car.position.z - p.z
        const d = Math.hypot(dx, dz)
        if (d < nearestDist) { nearestDist = d; nearest = car }
      }
      if (nearest) {
        const desiredHeading = Math.atan2(nearest.position.x - p.x, nearest.position.z - p.z)
        const currentHeading = Math.atan2(p.vx, p.vz)
        let diff = ((desiredHeading - currentHeading + Math.PI) % (Math.PI * 2)) - Math.PI
        const maxTurn = PROJECTILE_HOMING_TURN_RATE * dt
        diff = THREE.MathUtils.clamp(diff, -maxTurn, maxTurn)
        const newHeading = currentHeading + diff
        p.vx = Math.sin(newHeading) * PROJECTILE_SPEED
        p.vz = Math.cos(newHeading) * PROJECTILE_SPEED
      }
      p.x += p.vx * dt
      p.z += p.vz * dt
      p.mesh.position.x = p.x
      p.mesh.position.z = p.z
      if (p.exhaust) {
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz) // nose follows the homing curve
        p.exhaust.scale.z = 1 + Math.sin(this._t * 45 + p.x) * 0.25
      }
    }
    const expired = this.projectiles.filter((p) => now > p.expiresAt)
    if (expired.length) {
      for (const p of expired) this.scene.scene.remove(p.mesh)
      this.projectiles = this.projectiles.filter((p) => now <= p.expiresAt)
    }
  }

  /** Check only the LOCAL car against hazards/projectiles this frame.
   * Returns a list of { effectType, useId? } for anything that just hit it. */
  checkLocalHits(localCar, localId) {
    const hits = []
    const now = Date.now()

    for (const h of this.hazards) {
      const dx = localCar.position.x - h.x
      const dz = localCar.position.z - h.z
      if (Math.hypot(dx, dz) > HAZARD_RADIUS + PHYSICS.carRadius) continue
      const last = h.recentHits.get(localId) || 0
      if (now - last < HAZARD_REHIT_COOLDOWN_MS) continue
      h.recentHits.set(localId, now)
      hits.push({ effectType: 'slip' })
    }

    for (const p of this.projectiles) {
      if (p.casterId === localId) continue
      const dx = localCar.position.x - p.x
      const dz = localCar.position.z - p.z
      if (Math.hypot(dx, dz) > PROJECTILE_RADIUS + PHYSICS.carRadius) continue
      hits.push({ effectType: 'stun', useId: p.useId, casterId: p.casterId })
    }

    return hits
  }

  clear() {
    for (const h of this.hazards) this.scene.scene.remove(h.mesh)
    for (const p of this.projectiles) this.scene.scene.remove(p.mesh)
    for (const w of this.waves) this.scene.scene.remove(w.mesh)
    this.hazards = []
    this.projectiles = []
    this.waves = []
  }
}

export { SHOCKWAVE_RADIUS }
