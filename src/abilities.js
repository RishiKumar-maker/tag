import * as THREE from '../lib/three.module.min.js'
import { PHYSICS } from './car.js'
import {
  SHOCKWAVE_RADIUS, HAZARD_RADIUS, HAZARD_LIFETIME_MS, HAZARD_REHIT_COOLDOWN_MS,
  PROJECTILE_SPEED, PROJECTILE_LIFETIME_MS, PROJECTILE_RADIUS, PROJECTILE_HOMING_TURN_RATE,
} from './constants.js'

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

/** Owns the temporary world objects abilities create (oil slicks, shots),
 * simulating them identically on every client from one broadcast event, and
 * checking only the LOCAL car for hits -- the same "target reports it"
 * principle the tag system already uses. */
export class AbilityManager {
  constructor(scene) {
    this.scene = scene
    this.hazards = [] // { mesh, x, z, expiresAt, recentHits: Map<carId, timestamp> }
    this.projectiles = [] // { useId, mesh, casterId, x, z, vx, vz, expiresAt }
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
    else if (abilityId === 'oilslick') this._spawnHazard(x, z)
    else if (abilityId === 'homingshot') this._spawnProjectile(useId, casterId, x, z, heading)
  }

  _spawnHazard(x, z) {
    const mesh = new THREE.Mesh(hazardGeo, hazardMat.clone())
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.05, z)
    this.scene.scene.add(mesh)
    this.hazards.push({ mesh, x, z, expiresAt: Date.now() + HAZARD_LIFETIME_MS, recentHits: new Map() })
  }

  _spawnProjectile(useId, casterId, x, z, heading) {
    const mesh = new THREE.Mesh(projectileGeo, projectileMat)
    mesh.position.set(x, 0.6, z)
    this.scene.scene.add(mesh)
    this.projectiles.push({
      useId,
      mesh,
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

    for (const h of this.hazards) {
      h.mesh.rotation.z += dt * 0.4
    }
    if (this.hazards.some((h) => now > h.expiresAt)) {
      for (const h of this.hazards) if (now > h.expiresAt) this.scene.scene.remove(h.mesh)
      this.hazards = this.hazards.filter((h) => now <= h.expiresAt)
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
    this.hazards = []
    this.projectiles = []
  }
}

export { SHOCKWAVE_RADIUS }
