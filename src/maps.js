// What the game and the lobby need to know about each map, plus the collision
// maths that works for any map's shape. No three.js in here on purpose: it's
// plain numbers, so tools/test-maps.mjs can run it in Node.
//
// To add a map: add an entry to MAPS, write its builder in scene.js's
// MAP_BUILDERS, and make the builder set `bounds`, `colliders`, `spawnPoint`.

export const MAPS = {
  arena: { id: 'arena', name: 'Meadow Arena', blurb: 'Wide-open round field. Big, sweeping drifts.' },
  harbor: { id: 'harbor', name: 'Harbor Yard', blurb: 'Container lanes and tight corners. Cut your chaser off.' },
  stadium: { id: 'stadium', name: 'Soccer Stadium', blurb: 'A floodlit pitch with two goals and boost pads. Home of Car Soccer.' },
}
export const MAP_IDS = Object.keys(MAPS)
export const DEFAULT_MAP = 'arena'

/** Network and URL input is untrusted: only ever accept ids we actually know. */
export function isMapId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MAPS, id)
}

// ------------------------------------------------------------------ bounds
// bounds is { shape: 'circle', radius }, { shape: 'rect', halfX, halfZ } or
// { shape: 'rrect', halfX, halfZ, radius } (a rectangle with rounded corners).

/** Nearest point inside a rounded rectangle (half extents hx, hz; corner
 * radius cr). A point already inside comes back unchanged. */
export function projectRoundedRect(px, pz, hx, hz, cr) {
  const sx = px < 0 ? -1 : 1
  const sz = pz < 0 ? -1 : 1
  const ax = Math.abs(px)
  const az = Math.abs(pz)
  const cx = hx - cr
  const cz = hz - cr
  if (ax > cx && az > cz) {
    const dx = ax - cx
    const dz = az - cz
    const d = Math.hypot(dx, dz)
    if (d > cr) return { x: sx * (cx + (dx / d) * cr), z: sz * (cz + (dz / d) * cr) }
    return { x: px, z: pz }
  }
  return { x: sx * Math.min(ax, hx), z: sz * Math.min(az, hz) }
}

/** Keep a car (a circle of `radius`) inside the bounds. Mutates pos and vel.
 * Calls onImpact(speed) with how hard it hit, if it hit. */
export function constrainToBounds(bounds, pos, vel, radius, onImpact) {
  if (bounds.shape === 'circle') {
    const max = bounds.radius - radius
    const dist = Math.hypot(pos.x, pos.z)
    if (dist <= max) return
    const k = max / dist
    pos.x *= k
    pos.z *= k
    pushOutwardVelocityOut(vel, pos.x / max, pos.z / max, onImpact)
    return
  }
  if (bounds.shape === 'rrect') {
    const p = projectRoundedRect(pos.x, pos.z, bounds.halfX - radius, bounds.halfZ - radius, Math.max(bounds.radius - radius, 0.5))
    const dx = p.x - pos.x
    const dz = p.z - pos.z
    const d = Math.hypot(dx, dz)
    if (d < 1e-9) return
    pos.x = p.x
    pos.z = p.z
    pushOutwardVelocityOut(vel, -dx / d, -dz / d, onImpact) // outward normal = away from where it was pulled back to
    return
  }
  const maxX = bounds.halfX - radius
  const maxZ = bounds.halfZ - radius
  if (Math.abs(pos.x) > maxX) {
    const side = Math.sign(pos.x)
    pos.x = side * maxX
    pushOutwardVelocityOut(vel, side, 0, onImpact)
  }
  if (Math.abs(pos.z) > maxZ) {
    const side = Math.sign(pos.z)
    pos.z = side * maxZ
    pushOutwardVelocityOut(vel, 0, side, onImpact)
  }
}

/** (nx, nz) is the outward wall normal. Remove the velocity heading into the wall. */
function pushOutwardVelocityOut(vel, nx, nz, onImpact) {
  const vDotN = vel.x * nx + vel.z * nz
  if (vDotN <= 0) return
  vel.x -= vDotN * nx
  vel.z -= vDotN * nz
  onImpact?.(vDotN)
}

export function insideBounds(bounds, x, z, margin = 0) {
  if (bounds.shape === 'circle') return Math.hypot(x, z) <= bounds.radius - margin
  if (bounds.shape === 'rrect') {
    const p = projectRoundedRect(x, z, bounds.halfX - margin, bounds.halfZ - margin, Math.max(bounds.radius - margin, 0.5))
    return Math.hypot(p.x - x, p.z - z) < 1e-9
  }
  return Math.abs(x) <= bounds.halfX - margin && Math.abs(z) <= bounds.halfZ - margin
}

// --------------------------------------------------------------- colliders
// A collider is { x, z, radius } (a circle) or { x, z, hx, hz } (an
// axis-aligned box with those half-extents).

/** How a circle of `radius` at (px, pz) overlaps the collider: null if it
 * doesn't, else { nx, nz, push } = the way out and how far to go. */
export function overlapWithCollider(c, px, pz, radius) {
  const dx = px - c.x
  const dz = pz - c.z

  if (c.hx === undefined) {
    const dist = Math.hypot(dx, dz)
    const minDist = c.radius + radius
    if (dist >= minDist || dist < 1e-4) return null
    return { nx: dx / dist, nz: dz / dist, push: minDist - dist }
  }

  // nearest point on the box to the car's centre
  const nearX = Math.max(-c.hx, Math.min(c.hx, dx))
  const nearZ = Math.max(-c.hz, Math.min(c.hz, dz))
  const ox = dx - nearX
  const oz = dz - nearZ
  const dist = Math.hypot(ox, oz)
  if (dist >= radius) return null
  if (dist > 1e-4) return { nx: ox / dist, nz: oz / dist, push: radius - dist }

  // the car's centre is inside the box: leave by whichever face is closest
  const exitX = c.hx - Math.abs(dx)
  const exitZ = c.hz - Math.abs(dz)
  return exitX < exitZ
    ? { nx: Math.sign(dx) || 1, nz: 0, push: exitX + radius }
    : { nx: 0, nz: Math.sign(dz) || 1, push: exitZ + radius }
}

/** Push a car out of every collider and stop it driving into them (it slides
 * along the surface instead). Mutates pos and vel. onImpact(speed) per hit. */
export function resolveColliders(colliders, pos, vel, radius, onImpact) {
  for (const c of colliders) {
    const hit = overlapWithCollider(c, pos.x, pos.z, radius)
    if (!hit) continue
    pos.x += hit.nx * hit.push
    pos.z += hit.nz * hit.push
    const vDotN = vel.x * hit.nx + vel.z * hit.nz
    if (vDotN < 0) {
      vel.x -= vDotN * hit.nx
      vel.z -= vDotN * hit.nz
      onImpact?.(-vDotN)
    }
  }
}
