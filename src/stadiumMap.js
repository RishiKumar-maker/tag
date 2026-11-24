import * as THREE from '../lib/three.module.min.js'
import { FIELD, GOAL, BALL_RADIUS, TEAMS, BOOST_PADS, BOOST_PAD_RADIUS, PRACTICE_SPOT } from './soccerLayout.js'

// The Soccer Stadium: a floodlit pitch with rounded corners, a goal at each
// end and boost pads. Built from plain boxes and one canvas-drawn pitch
// texture, with nothing random, so every player builds the identical stadium.

const NIGHT = 0x1b2145
const SURROUND = 0x1f2745
const WALL = 0xc7b8ec
const TRIM = 0x7fdbb6
const STAND = 0x3a4170

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra })

function box(parent, material, [w, h, d], [x, y, z], rotY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.rotation.y = rotY
  parent.add(mesh)
  return mesh
}

export function buildStadiumMap(s) {
  const scene = s.scene
  const { halfX: HX, halfZ: HZ, cornerRadius: CR } = FIELD

  // ---- what the rest of the game needs to know
  s.bounds = { shape: 'rrect', halfX: HX, halfZ: HZ, radius: CR }
  s.colliders = [] // the walls are the bounds; nothing else is solid
  s.spawnPoint = (i, n) => {
    // for tag modes played on this pitch: a ring around the centre spot. (Car Soccer
    // positions its own kickoff spots.)
    const a = (i / n) * Math.PI * 2
    return { x: Math.cos(a) * 10, z: Math.sin(a) * 10, heading: a + Math.PI }
  }
  s.practiceSpot = PRACTICE_SPOT
  s.followHeight = 5.2
  s.followDistance = 8.2
  s.cameraBounds = { halfX: HX, halfZ: HZ } // keep the camera inside the walls
  s.camera.far = 260
  s.camera.updateProjectionMatrix()

  scene.background = new THREE.Color(NIGHT)
  scene.fog = new THREE.Fog(NIGHT, 100, 250)
  scene.add(new THREE.HemisphereLight(0xe3ebff, 0x4a5a78, 1.3))
  const key = new THREE.DirectionalLight(0xfff4e0, 1.0)
  key.position.set(-20, 60, 25)
  scene.add(key)

  buildPitch(scene)
  buildWalls(scene)
  buildGoal(scene, -1, TEAMS[0].color) // team 0 (Coral) defends the -x goal
  buildGoal(scene, 1, TEAMS[1].color)
  buildStands(scene)
  buildFloodlights(scene)
  s.boostPads = buildBoostPads(scene)
}

// ------------------------------------------------------------------ pitch

function makePitchTexture() {
  const ppu = 12 // pixels per world unit
  const pad = 6
  const w = (FIELD.halfX * 2 + pad * 2) * ppu
  const h = (FIELD.halfZ * 2 + pad * 2) * ppu
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const X = (x) => (x + FIELD.halfX + pad) * ppu
  const Z = (z) => (z + FIELD.halfZ + pad) * ppu // canvas y grows with world z
  const hex = (n) => '#' + n.toString(16).padStart(6, '0')

  ctx.fillStyle = hex(SURROUND)
  ctx.fillRect(0, 0, w, h)

  // the grass, clipped to the rounded pitch outline, in mown stripes
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(X(-FIELD.halfX), Z(-FIELD.halfZ), FIELD.halfX * 2 * ppu, FIELD.halfZ * 2 * ppu, FIELD.cornerRadius * ppu)
  ctx.clip()
  const stripe = 8
  for (let i = 0, x = -FIELD.halfX; x < FIELD.halfX; x += stripe, i++) {
    ctx.fillStyle = i % 2 ? '#4da36c' : '#58b077'
    ctx.fillRect(X(x), 0, stripe * ppu + 1, h)
  }

  // a wash of each team's colour in front of the goal it defends
  for (const t of TEAMS) {
    const side = t.id === 0 ? -1 : 1
    const g = ctx.createLinearGradient(X(side * FIELD.halfX), 0, X(side * (FIELD.halfX - 14)), 0)
    g.addColorStop(0, t.css + '66')
    g.addColorStop(1, t.css + '00')
    ctx.fillStyle = g
    ctx.fillRect(Math.min(X(side * FIELD.halfX), X(side * (FIELD.halfX - 14))), Z(-14), 14 * ppu, 28 * ppu)
  }

  // markings
  ctx.strokeStyle = 'rgba(255,255,255,0.88)'
  ctx.fillStyle = 'rgba(255,255,255,0.88)'
  ctx.lineWidth = 0.34 * ppu
  ctx.strokeRect(X(-FIELD.halfX + 0.7), Z(-FIELD.halfZ + 0.7), (FIELD.halfX * 2 - 1.4) * ppu, (FIELD.halfZ * 2 - 1.4) * ppu)
  ctx.beginPath(); ctx.moveTo(X(0), Z(-FIELD.halfZ)); ctx.lineTo(X(0), Z(FIELD.halfZ)); ctx.stroke()
  ctx.beginPath(); ctx.arc(X(0), Z(0), 8 * ppu, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(X(0), Z(0), 0.7 * ppu, 0, Math.PI * 2); ctx.fill()
  for (const side of [-1, 1]) {
    ctx.strokeRect(Math.min(X(side * FIELD.halfX), X(side * (FIELD.halfX - 12))), Z(-15), 12 * ppu, 30 * ppu) // penalty-style box
    ctx.strokeRect(Math.min(X(side * FIELD.halfX), X(side * (FIELD.halfX - 5))), Z(-GOAL.halfWidth), 5 * ppu, GOAL.halfWidth * 2 * ppu) // goal area
    ctx.beginPath(); ctx.arc(X(side * (FIELD.halfX - 17)), Z(0), 0.5 * ppu, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, width: w / ppu, depth: h / ppu }
}

function buildPitch(scene) {
  const { texture, width, depth } = makePitchTexture()
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ map: texture }))
  pitch.rotation.x = -Math.PI / 2
  scene.add(pitch)

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), lambert(0x161c38))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.05
  scene.add(ground)
}

// ------------------------------------------------------------------ walls

/** Points around a rounded rectangle, counter-clockwise from its +x +z corner. */
function outline(hx, hz, r, seg = 6) {
  const pts = []
  const corners = [[hx - r, hz - r, 0], [-(hx - r), hz - r, Math.PI / 2], [-(hx - r), -(hz - r), Math.PI], [hx - r, -(hz - r), Math.PI * 1.5]]
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push({ x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) })
    }
  }
  return pts
}

function buildWalls(scene) {
  const { halfX: HX, halfZ: HZ, cornerRadius: CR } = FIELD
  const pts = outline(HX, HZ, CR)
  const segments = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const onEndWall = Math.abs(a.x) > HX - 1e-6 && Math.abs(b.x) > HX - 1e-6 && Math.sign(a.x) === Math.sign(b.x)
    if (onEndWall) {
      // leave the goal mouth open: two wall pieces either side of it
      const sx = Math.sign(a.x)
      const zEdge = Math.max(Math.abs(a.z), Math.abs(b.z))
      segments.push({ ax: sx * HX, az: -zEdge, bx: sx * HX, bz: -GOAL.halfWidth })
      segments.push({ ax: sx * HX, az: GOAL.halfWidth, bx: sx * HX, bz: zEdge })
    } else {
      segments.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z })
    }
  }

  const height = 3.2
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lambert(WALL), segments.length)
  const trims = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: TRIM }), segments.length)
  const d = new THREE.Object3D()
  segments.forEach((sg, i) => {
    const dx = sg.bx - sg.ax
    const dz = sg.bz - sg.az
    const len = Math.hypot(dx, dz)
    let nx = -dz / len
    let nz = dx / len
    const mx = (sg.ax + sg.bx) / 2
    const mz = (sg.az + sg.bz) / 2
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz } // outward
    const off = 0.4 // sit just outside the line cars are stopped at
    d.rotation.set(0, Math.atan2(dx, dz), 0)
    d.position.set(mx + nx * off, height / 2, mz + nz * off)
    d.scale.set(0.8, height, len + 0.15)
    d.updateMatrix()
    walls.setMatrixAt(i, d.matrix)
    d.position.set(mx + nx * off, height + 0.08, mz + nz * off)
    d.scale.set(1.05, 0.16, len + 0.15)
    d.updateMatrix()
    trims.setMatrixAt(i, d.matrix)
  })
  walls.frustumCulled = false
  trims.frustumCulled = false
  scene.add(walls, trims)
}

// ------------------------------------------------------------------ goals

function gridLines(origin, u, v, nu, nv, material) {
  const pos = []
  for (let i = 0; i <= nu; i++) {
    const k = i / nu
    pos.push(origin[0] + u[0] * k, origin[1] + u[1] * k, origin[2] + u[2] * k, origin[0] + u[0] * k + v[0], origin[1] + u[1] * k + v[1], origin[2] + u[2] * k + v[2])
  }
  for (let j = 0; j <= nv; j++) {
    const k = j / nv
    pos.push(origin[0] + v[0] * k, origin[1] + v[1] * k, origin[2] + v[2] * k, origin[0] + v[0] * k + u[0], origin[1] + v[1] * k + u[1], origin[2] + v[2] * k + u[2])
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return new THREE.LineSegments(geo, material)
}

/** side = -1 for the -x goal, +1 for the +x goal; teamColor paints the frame. */
function buildGoal(scene, side, teamColor) {
  const { halfX: HX } = FIELD
  const hw = GOAL.halfWidth
  const h = GOAL.height
  const depth = GOAL.depth
  const frame = new THREE.MeshBasicMaterial({ color: teamColor })
  const net = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })

  for (const z of [-hw, hw]) box(scene, frame, [0.8, h, 0.8], [side * HX, h / 2, z])
  box(scene, frame, [0.8, 0.8, hw * 2 + 0.8], [side * HX, h, 0])

  const xIn = side * HX
  const xBack = side * (HX + depth)
  scene.add(gridLines([xBack, 0, -hw], [0, 0, hw * 2], [0, h, 0], 12, 6, net)) // back
  scene.add(gridLines([xIn, 0, -hw], [side * depth, 0, 0], [0, h, 0], 6, 6, net)) // sides
  scene.add(gridLines([xIn, 0, hw], [side * depth, 0, 0], [0, h, 0], 6, 6, net))
  scene.add(gridLines([xIn, h, -hw], [side * depth, 0, 0], [0, 0, hw * 2], 6, 12, net)) // roof

  // a glowing back panel in the team's colour so each goal is easy to pick out from afar
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, h),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })
  )
  glow.rotation.y = Math.PI / 2
  glow.position.set(xBack + side * 0.05, h / 2, 0)
  scene.add(glow)

  box(scene, lambert(0x2a3558), [depth, 0.1, hw * 2], [side * (HX + depth / 2), -0.04, 0]) // net floor
}

// ------------------------------------------------------------------ stands

/** A small deterministic generator so every player gets the same crowd. */
function seeded(seed) {
  let t = seed >>> 0
  return () => ((t = (t * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function buildStands(scene) {
  const { halfX: HX, halfZ: HZ } = FIELD
  const tiers = 3
  const tierDepth = 3.2
  const stand = lambert(STAND)
  const rand = seeded(7)
  const crowd = []

  const addTier = (cx, cz, sizeX, sizeZ, height, along) => {
    box(scene, stand, [sizeX, height, sizeZ], [cx, height / 2, cz])
    // fans: small coloured blocks along the top of the tier
    const length = along === 'x' ? sizeX : sizeZ
    for (let p = -length / 2 + 1; p <= length / 2 - 1; p += 1.5) {
      crowd.push({ x: along === 'x' ? cx + p : cx + (rand() - 0.5) * 0.6, z: along === 'z' ? cz + p : cz + (rand() - 0.5) * 0.6, y: height + 0.6, c: rand() })
    }
  }

  for (const sz of [-1, 1]) {
    for (let t = 0; t < tiers; t++) addTier(0, sz * (HZ + 5.5 + t * tierDepth), 2 * HX + 12, tierDepth, 1.6 * (t + 1), 'x')
  }
  for (const sx of [-1, 1]) {
    for (let t = 0; t < tiers; t++) addTier(sx * (HX + GOAL.depth + 5 + t * tierDepth), 0, tierDepth, 2 * HZ + 4, 1.6 * (t + 1), 'z')
  }

  const palette = [0xff8c69, 0x7fdbb6, 0xb8a6e0, 0xf7d774, 0x7ec8e3, 0xf4a6c6, 0xffffff].map((c) => new THREE.Color(c))
  const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.3, 0.9), lambert(0xffffff), crowd.length)
  const d = new THREE.Object3D()
  crowd.forEach((f, i) => {
    d.position.set(f.x, f.y, f.z)
    d.scale.set(1, 0.8 + f.c * 0.5, 1)
    d.updateMatrix()
    fans.setMatrixAt(i, d.matrix)
    fans.setColorAt(i, palette[Math.floor(f.c * palette.length) % palette.length])
  })
  fans.frustumCulled = false
  scene.add(fans)
}

function buildFloodlights(scene) {
  const { halfX: HX, halfZ: HZ } = FIELD
  const pole = lambert(0x59608a)
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff3d6, fog: false })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (HX + 14)
      const z = sz * (HZ + 14)
      box(scene, pole, [1.1, 30, 1.1], [x, 15, z])
      const panel = box(scene, lamp, [9, 4.5, 0.8], [x, 31, z])
      panel.rotation.y = Math.atan2(-x, -z) // face the pitch
    }
  }
}

// ------------------------------------------------------------- boost pads

function buildBoostPads(scene) {
  return BOOST_PADS.map(({ x, z }) => {
    const group = new THREE.Group()
    group.position.set(x, 0.05, z)
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(BOOST_PAD_RADIUS, BOOST_PAD_RADIUS, 0.08, 6),
      new THREE.MeshBasicMaterial({ color: TRIM, transparent: true, opacity: 0.85 })
    )
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.45, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    group.add(disc, ring)
    scene.add(group)
    return { x, z, group, discMat: disc.material, ringMat: ring.material }
  })
}

// ------------------------------------------------------------------- ball

let ballColorsReady = null

/** The ball: a faceted sphere with dark spots like a football, plus a soft
 * shadow. Returns { group, mesh }; roll `mesh`, move `group`. */
export function createBallMesh() {
  const geo = new THREE.IcosahedronGeometry(BALL_RADIUS, 1)
  const pos = geo.attributes.position

  if (!ballColorsReady) {
    // the 20 face centres of a plain icosahedron: the middle triangle of each of
    // our subdivided faces points straight at one of them
    const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position
    ballColorsReady = []
    for (let f = 0; f < ico.count; f += 3) {
      const c = new THREE.Vector3()
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(ico, f + k))
      ballColorsReady.push(c.normalize())
    }
  }
  const colors = new Float32Array(pos.count * 3)
  const white = new THREE.Color(0xf6f4ff)
  const dark = new THREE.Color(0x3b2a54)
  const centre = new THREE.Vector3()
  for (let f = 0; f < pos.count; f += 3) {
    centre.set(0, 0, 0)
    for (let k = 0; k < 3; k++) centre.add(new THREE.Vector3().fromBufferAttribute(pos, f + k))
    centre.normalize()
    const spot = ballColorsReady.some((n) => n.dot(centre) > 0.995)
    const col = spot ? dark : white
    for (let k = 0; k < 3; k++) col.toArray(colors, (f + k) * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x7a7a90 }))
  mesh.position.y = BALL_RADIUS

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_RADIUS * 1.05, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.04

  const group = new THREE.Group()
  group.add(mesh, shadow)
  return { group, mesh }
}
