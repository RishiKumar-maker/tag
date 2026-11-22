import * as THREE from '../lib/three.module.min.js'
import { buildHarborLayout, HARBOR, CONTAINER_HEIGHT, ISLAND } from './harborLayout.js'

// Harbor Yard at golden hour. Everything is plain low-poly boxes and cylinders
// in the game's palette, built the same way the Meadow Arena is. All positions
// come from harborLayout.js (also used by tools/test-maps.mjs), and nothing in
// here is random, so every player in a room builds the identical yard.

const SKY = 0xf3b88e // apricot haze, also the fog colour so distance melts into the sky
const CONCRETE = 0xb7bbd4
const QUAY_WALL = 0x8587a8
const WATER = 0x5fb0c0
const CURB = 0xcfc8dc
const PLUM = 0x4b4a63
const CRANE = 0xe9805f

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })
const darker = (hex, k) => new THREE.Color(hex).multiplyScalar(k)

/** A box centred at (x, y, z) with the given size, added to `parent`. */
function box(parent, material, [w, h, d], [x, y, z], rotY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  parent.add(mesh)
  return mesh
}

/** Many identical flat marks in one draw call. */
function instancedMarks(parent, geometry, material, placements, scale = [1, 1, 1]) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length)
  const d = new THREE.Object3D()
  placements.forEach(({ x, y = 0.012, z, rotY = 0 }, i) => {
    d.position.set(x, y, z)
    d.rotation.set(0, rotY, 0)
    d.scale.set(...scale)
    d.updateMatrix()
    mesh.setMatrixAt(i, d.matrix)
  })
  mesh.frustumCulled = false
  parent.add(mesh)
  return mesh
}

export function buildHarborMap(s) {
  const scene = s.scene
  const layout = buildHarborLayout()
  const { halfX, halfZ } = HARBOR

  // ---- what the rest of the game needs to know about this map
  s.bounds = { shape: 'rect', halfX, halfZ }
  s.colliders = layout.colliders
  s.spawnPoint = (i, n) => {
    const angle = (i / n) * Math.PI * 2
    // around the roundabout, everyone facing the same way (counter-clockwise)
    return { x: Math.cos(angle) * 6, z: Math.sin(angle) * 6, heading: -angle }
  }
  s.followHeight = 5.0 // a touch higher than the meadow so the car stays visible beside container walls
  s.followDistance = 7.8
  s.camera.far = 180
  s.camera.updateProjectionMatrix()

  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, 55, 150)

  // ---- light: warm, low sun so container sides are lit differently from their tops
  scene.add(new THREE.HemisphereLight(0xfff0e2, 0xb9b3d6, 1.3))
  const sun = new THREE.DirectionalLight(0xffd3a1, 1.05)
  sun.position.set(-34, 18, -28)
  scene.add(sun)

  buildQuay(scene, halfX, halfZ)
  buildMarkings(scene, halfX, halfZ)
  buildRoundabout(scene)
  buildContainers(scene, layout.containers)
  buildLamps(scene, layout.lamps)
  buildBarrels(scene, layout.barrels)
  buildBollards(scene, halfX, halfZ)
  buildCrane(scene, 1, halfX)
  buildCrane(scene, -1, halfX)
  buildShip(scene, halfZ)
  buildSun(scene)

  for (const item of layout.items) s._addItemBox(item.x, item.z)
}

// ---------------------------------------------------------------- ground

function buildQuay(scene, halfX, halfZ) {
  // the yard is a slab standing in the water: concrete on top, darker quay wall down the sides
  const top = lambert(CONCRETE)
  const wall = lambert(QUAY_WALL)
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry((halfX + 1.2) * 2, 1.8, (halfZ + 1.2) * 2),
    [wall, wall, top, wall, wall, wall] // +x, -x, +y, -y, +z, -z
  )
  slab.position.y = -0.9
  scene.add(slab)

  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), lambert(WATER))
  water.rotation.x = -Math.PI / 2
  water.position.y = -0.9
  scene.add(water)

  // curb right at the edge of the drivable area
  const curb = lambert(CURB)
  box(scene, curb, [1.2, 0.55, (halfZ + 1.2) * 2], [halfX + 0.6, 0.275, 0])
  box(scene, curb, [1.2, 0.55, (halfZ + 1.2) * 2], [-halfX - 0.6, 0.275, 0])
  box(scene, curb, [halfX * 2, 0.55, 1.2], [0, 0.275, halfZ + 0.6])
  box(scene, curb, [halfX * 2, 0.55, 1.2], [0, 0.275, -halfZ - 0.6])
}

function buildMarkings(scene, halfX, halfZ) {
  const flat = new THREE.PlaneGeometry(1, 1)
  flat.rotateX(-Math.PI / 2)

  // dashed centre lines down the main street and the central avenue
  const paint = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, fog: true })
  const dashes = []
  for (let x = -44; x <= 44; x += 4.5) if (Math.abs(x) > 5) dashes.push({ x, z: 0 })
  for (let z = -30; z <= 30; z += 4.5) if (Math.abs(z) > 5) dashes.push({ x: 0, z, rotY: Math.PI / 2 })
  instancedMarks(scene, flat, paint, dashes, [2.2, 1, 0.28])

  // yellow safety dashes just inside the curb all the way round
  const hazard = new THREE.MeshBasicMaterial({ color: 0xf7d774, transparent: true, opacity: 0.85 })
  const stripes = []
  for (let x = -halfX + 2; x <= halfX - 2; x += 3) {
    stripes.push({ x, z: halfZ - 0.9 }, { x, z: -halfZ + 0.9 })
  }
  for (let z = -halfZ + 3; z <= halfZ - 3; z += 3) {
    stripes.push({ x: halfX - 0.9, z, rotY: Math.PI / 2 }, { x: -halfX + 0.9, z, rotY: Math.PI / 2 })
  }
  instancedMarks(scene, flat, hazard, stripes, [1.5, 1, 0.35])
}

function buildRoundabout(scene) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.1, 4.4, 56),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.012
  scene.add(ring)

  const island = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND.radius, ISLAND.radius + 0.15, 0.5, 20), lambert(CURB))
  island.position.set(ISLAND.x, 0.25, ISLAND.z)
  scene.add(island)

  const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND.radius - 0.35, ISLAND.radius - 0.35, 0.1, 20), lambert(0x7fbf8c))
  grass.position.set(ISLAND.x, 0.52, ISLAND.z)
  scene.add(grass)

  // a little tree on the island, same recipe as the meadow's
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.4, 6), lambert(0x6b4a3d))
  trunk.position.set(ISLAND.x, 1.2, ISLAND.z)
  scene.add(trunk)
  const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.6, 7), lambert(0x6fae7c))
  foliage.position.set(ISLAND.x, 3.0, ISLAND.z)
  scene.add(foliage)
}

// ------------------------------------------------------------ containers

function buildContainers(scene, containers) {
  const bodyMats = new Map()
  const trimMats = new Map()
  const getBody = (c) => bodyMats.get(c) || bodyMats.set(c, lambert(c)).get(c)
  const getTrim = (c) => trimMats.get(c) || trimMats.set(c, lambert(darker(c, 0.62))).get(c)

  for (const c of containers) {
    const w = c.hx * 2
    const d = c.hz * 2
    const h = CONTAINER_HEIGHT
    const g = new THREE.Group()
    g.position.set(c.x, 0, c.z)
    const along = c.axis === 'x' // which way the long side runs

    // body, a darker skirt at the bottom, and a darker stripe along the roof
    box(g, getBody(c.color), [w, h, d], [0, h / 2, 0])
    box(g, getTrim(c.color), [w + 0.06, 0.28, d + 0.06], [0, 0.14, 0])
    box(g, getTrim(c.color), along ? [w * 0.94, 0.08, 0.55] : [0.55, 0.08, d * 0.94], [0, h + 0.04, 0])

    // door panels on both short ends
    const door = getTrim(c.color)
    if (along) {
      box(g, door, [0.1, h * 0.86, d * 0.86], [w / 2 + 0.02, h / 2, 0])
      box(g, door, [0.1, h * 0.86, d * 0.86], [-w / 2 - 0.02, h / 2, 0])
    } else {
      box(g, door, [w * 0.86, h * 0.86, 0.1], [0, h / 2, d / 2 + 0.02])
      box(g, door, [w * 0.86, h * 0.86, 0.1], [0, h / 2, -d / 2 - 0.02])
    }
    scene.add(g)
  }
}

// ---------------------------------------------------------------- props

function buildLamps(scene, lamps) {
  const pole = lambert(PLUM)
  const bulb = new THREE.MeshBasicMaterial({ color: 0xfff0b5, fog: false })
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 5.2, 6)
  const bulbGeo = new THREE.SphereGeometry(0.28, 8, 6)
  for (const l of lamps) {
    const post = new THREE.Mesh(poleGeo, pole)
    post.position.set(l.x, 2.6, l.z)
    scene.add(post)
    const head = new THREE.Mesh(bulbGeo, bulb)
    head.position.set(l.x, 5.35, l.z)
    scene.add(head)
  }
}

function buildBarrels(scene, barrels) {
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 0.95, 8)
  const mats = [lambert(0xff8c69), lambert(0xb8a6e0), lambert(0x7ec8e3)]
  barrels.forEach((b, i) => {
    const m = new THREE.Mesh(geo, mats[i % mats.length])
    m.position.set(b.x, 0.475, b.z)
    scene.add(m)
  })
}

function buildBollards(scene, halfX, halfZ) {
  const geo = new THREE.CylinderGeometry(0.22, 0.26, 0.6, 7)
  const spots = []
  for (let x = -halfX + 4; x <= halfX - 4; x += 8) spots.push({ x, y: 0.3, z: halfZ - 0.15 }, { x, y: 0.3, z: -halfZ + 0.15 })
  for (let z = -halfZ + 4; z <= halfZ - 4; z += 8) spots.push({ x: halfX - 0.15, y: 0.3, z }, { x: -halfX + 0.15, y: 0.3, z })
  instancedMarks(scene, geo, lambert(PLUM), spots)
}

// ------------------------------------------------------------- scenery

/** A quay crane over the water at one short end. Decoration only: it's outside the bounds. */
function buildCrane(scene, side, halfX) {
  const metal = lambert(CRANE)
  const dark = lambert(PLUM)
  const x = side * (halfX + 3)

  for (const z of [-7, 7]) {
    box(scene, metal, [1.1, 15, 1.1], [x, 7.5 - 0.9, z])
    box(scene, dark, [2.2, 0.6, 2.2], [x, -0.6, z]) // foot
  }
  box(scene, metal, [1.5, 1.5, 16], [x, 15, 0]) // cross-beam between the legs
  box(scene, metal, [26, 1.2, 1.2], [x + side * 8, 15.9, 0]) // boom reaching out over the water
  box(scene, dark, [0.18, 6, 0.18], [x + side * 14, 12.7, 0]) // cable
  box(scene, lambert(0xff8c69), [2.5, 2.3, 12], [x + side * 14, 8.4, 0]) // the container it's lifting
}

/** A container ship moored out in the bay, for depth. */
function buildShip(scene, halfZ) {
  const z = -(halfZ + 38)
  const hull = lambert(0x8f4e66)
  box(scene, hull, [64, 7, 15], [-6, 0.6, z])
  box(scene, lambert(0xe9e4f0), [9, 11, 11], [-34, 8.5, z]) // bridge at the stern
  box(scene, lambert(0xf7d774), [9.6, 1, 11.6], [-34, 14.4, z])

  const colors = [0xff8c69, 0x7fdbb6, 0xb8a6e0, 0xf7d774, 0x7ec8e3, 0xf4a6c6]
  let n = 0
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row < 2; row++) {
      const tier = (col + row) % 2 === 0 ? 2 : 1
      for (let t = 0; t < tier; t++) {
        box(scene, lambert(colors[n++ % colors.length]), [7, 2.5, 5.2], [-22 + col * 8.2, 5.35 + t * 2.55, z + (row === 0 ? -3.2 : 3.2)])
      }
    }
  }
}

/** A big low sun with a soft halo, far off past the ship. It ignores fog so it stays crisp. */
function buildSun(scene) {
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(34, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, fog: false, depthWrite: false })
  )
  halo.position.set(18, 20, -170)
  scene.add(halo)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(15, 32), new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false }))
  disc.position.set(18, 20, -169)
  scene.add(disc)
}
