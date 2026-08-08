import * as THREE from '../lib/three.module.min.js'

export const ARENA_RADIUS = 44
export const TRACK_STRAIGHT = 70
export const TRACK_CURVE_RADIUS = 26
export const TRACK_HALF_WIDTH = 9

const SKY = 0xf6d9be
const GROUND = 0x8fbfa0
const TRACK_SKY = 0xdfd3ea
const TRACK_GROUND = 0x6b6478

// Deterministic pseudo-random so every client generates the identical layout.
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** A stadium (two straights + two semicircle ends) walked as a sequence of
 * waypoints. Used for the track shape, walls, traffic paths, and (by
 * finding the closest waypoint each frame) distance/progress tracking --
 * no separate checkpoint system needed. */
export function buildStadiumWaypoints(straight, radius, curveSegs = 24) {
  const pts = []
  const half = straight / 2
  pts.push({ x: -half, z: -radius })
  pts.push({ x: half, z: -radius })
  for (let i = 1; i <= curveSegs; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / curveSegs
    pts.push({ x: half + radius * Math.cos(a), z: radius * Math.sin(a) })
  }
  pts.push({ x: -half, z: radius })
  for (let i = 1; i <= curveSegs; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / curveSegs
    pts.push({ x: -half + radius * Math.cos(a), z: radius * Math.sin(a) })
  }
  pts.pop() // last point duplicates pts[0], closing the loop implicitly
  return pts
}

export class GameScene {
  constructor(canvas, mapId = 'arena') {
    this.canvas = canvas
    this.mapId = mapId
    this.colliders = [] // {x, z, radius} static obstacle circles, used for gameplay collision

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.shadowMap.enabled = false // fake blob shadows instead, real shadow maps are costly

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 120)
    this.camera.position.set(0, 8, -10)
    this._camLook = new THREE.Vector3()
    this.followDistance = 7.2
    this.followHeight = 4.4
    this.camDecay = 7

    this.itemBoxes = []
    this.waypoints = null
    this.trackHalfWidth = TRACK_HALF_WIDTH

    if (mapId === 'traffic') {
      this._buildTrafficMap()
    } else {
      this._buildArenaMap()
    }

    this.carGroup = new THREE.Group()
    this.scene.add(this.carGroup)

    this.particleGroup = new THREE.Group()
    this.scene.add(this.particleGroup)

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
    this._onResize()
  }

  _buildArenaMap() {
    this.scene.background = new THREE.Color(SKY)
    this.scene.fog = new THREE.Fog(SKY, 42, 100)
    this._buildLights()
    this._buildGround()
    this._buildFence()
    this._buildObstacles()
    this._buildItemBoxes()
  }

  _buildTrafficMap() {
    this.scene.background = new THREE.Color(TRACK_SKY)
    this.scene.fog = new THREE.Fog(TRACK_SKY, 55, 130)

    const hemi = new THREE.HemisphereLight(0xe9defa, 0x5c5568, 1.1)
    this.scene.add(hemi)
    const sun = new THREE.DirectionalLight(0xffe9c9, 1.2)
    sun.position.set(-25, 35, 15)
    this.scene.add(sun)

    this.waypoints = buildStadiumWaypoints(TRACK_STRAIGHT, TRACK_CURVE_RADIUS)
    this.loopLength = TRACK_STRAIGHT * 2 + Math.PI * TRACK_CURVE_RADIUS

    const groundW = TRACK_STRAIGHT + (TRACK_CURVE_RADIUS + TRACK_HALF_WIDTH) * 2 + 20
    const groundD = (TRACK_CURVE_RADIUS + TRACK_HALF_WIDTH) * 2 + 20
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(groundW, groundD),
      new THREE.MeshLambertMaterial({ color: TRACK_GROUND })
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    // lane markings: thin bright segments down the centerline, purely decorative
    for (let i = 0; i < this.waypoints.length; i += 2) {
      const wp = this.waypoints[i]
      const mark = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
      )
      mark.rotation.x = -Math.PI / 2
      mark.position.set(wp.x, 0.02, wp.z)
      this.scene.add(mark)
    }

    this._buildTrackWalls()
  }

  _buildTrackWalls() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xada0c9, flatShading: true })
    const wallGeo = new THREE.BoxGeometry(1.3, 1.1, 1.3)
    const n = this.waypoints.length
    for (let i = 0; i < n; i += 2) {
      const wp = this.waypoints[i]
      const next = this.waypoints[(i + 1) % n]
      const dx = next.x - wp.x
      const dz = next.z - wp.z
      const len = Math.hypot(dx, dz) || 1
      const perpX = -dz / len
      const perpZ = dx / len

      const inner = new THREE.Mesh(wallGeo, wallMat)
      inner.position.set(wp.x - perpX * this.trackHalfWidth, 0.55, wp.z - perpZ * this.trackHalfWidth)
      this.scene.add(inner)

      const outer = new THREE.Mesh(wallGeo, wallMat)
      outer.position.set(wp.x + perpX * this.trackHalfWidth, 0.55, wp.z + perpZ * this.trackHalfWidth)
      this.scene.add(outer)
    }
  }

  /** Nearest waypoint to (x,z) and the distance to it -- used both for
   * keeping cars within the track's walls and for tracking how far a
   * player has travelled around the loop. */
  findClosestWaypoint(x, z) {
    let bestIndex = 0
    let bestDistSq = Infinity
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i]
      const dx = x - wp.x
      const dz = z - wp.z
      const d = dx * dx + dz * dz
      if (d < bestDistSq) { bestDistSq = d; bestIndex = i }
    }
    return { index: bestIndex, distance: Math.sqrt(bestDistSq) }
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff1dd, 0x7fa98c, 1.15)
    this.scene.add(hemi)

    const sun = new THREE.DirectionalLight(0xffe3b8, 1.3)
    sun.position.set(30, 40, 20)
    this.scene.add(sun)
  }

  _buildGround() {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS, 40),
      new THREE.MeshLambertMaterial({ color: GROUND })
    )
    ground.rotation.x = -Math.PI / 2
    this.scene.add(ground)

    // soft concentric ring markings for a sense of speed/scale, purely decorative
    for (let r = 12; r < ARENA_RADIUS; r += 11) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.35, 48),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide })
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.01
      this.scene.add(ring)
    }
  }

  _buildFence() {
    const postGeo = new THREE.BoxGeometry(1.6, 1.1, 0.6)
    const postMat = new THREE.MeshLambertMaterial({ color: 0xada0c9, flatShading: true })
    const count = 32
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const post = new THREE.Mesh(postGeo, postMat)
      post.position.set(Math.cos(angle) * ARENA_RADIUS, 0.55, Math.sin(angle) * ARENA_RADIUS)
      post.rotation.y = -angle
      this.scene.add(post)
    }
  }

  _buildObstacles() {
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a3d, flatShading: true })
    const rockMat = new THREE.MeshLambertMaterial({ color: 0xb9afa6, flatShading: true })
    const foliageColors = [0x6fae7c, 0x7fbf8c, 0x8ac98f]

    const treeCount = 11
    for (let i = 0; i < treeCount; i++) {
      const a = seededRandom(i * 3.1 + 1) * Math.PI * 2
      const r = 16 + seededRandom(i * 5.7 + 2) * (ARENA_RADIUS - 26)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r

      const tree = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.1, 6), trunkMat)
      trunk.position.y = 0.55
      tree.add(trunk)

      const foliageMat = new THREE.MeshLambertMaterial({ color: foliageColors[i % foliageColors.length], flatShading: true })
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.1, 7), foliageMat)
      foliage.position.y = 2.0
      tree.add(foliage)

      tree.position.set(x, 0, z)
      this.scene.add(tree)
      this.colliders.push({ x, z, radius: 0.85 })
    }

    const rockCount = 7
    for (let i = 0; i < rockCount; i++) {
      const a = seededRandom(i * 7.3 + 9) * Math.PI * 2
      const r = 14 + seededRandom(i * 4.1 + 4) * (ARENA_RADIUS - 24)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const scale = 0.8 + seededRandom(i * 2.2 + 6) * 0.9

      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), rockMat)
      rock.position.set(x, 0.5 * scale, z)
      rock.scale.setScalar(scale)
      rock.rotation.set(seededRandom(i) * 3, seededRandom(i + 1) * 3, 0)
      this.scene.add(rock)
      this.colliders.push({ x, z, radius: 1.0 * scale })
    }
  }

  // Item box positions are map data, same spirit as the obstacles above --
  // a future second map simply defines a different (or empty) list here.
  _buildItemBoxes() {
    const geo = new THREE.OctahedronGeometry(0.55, 0)
    const mat = new THREE.MeshLambertMaterial({ color: 0xf7d774, flatShading: true, emissive: 0xf7d774, emissiveIntensity: 0.45 })

    this.itemBoxes = [] // { x, z, mesh }
    const count = 6
    for (let i = 0; i < count; i++) {
      const a = seededRandom(i * 9.7 + 41) * Math.PI * 2
      const r = 8 + seededRandom(i * 6.3 + 23) * (ARENA_RADIUS - 20)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r

      const mesh = new THREE.Mesh(geo, mat.clone())
      mesh.position.set(x, 1.15, z)
      this.scene.add(mesh)
      this.itemBoxes.push({ x, z, mesh })
    }
  }

  setItemBoxVisible(index, visible) {
    const box = this.itemBoxes[index]
    if (box) box.mesh.visible = visible
  }

  animateItemBoxes(dt, elapsed) {
    for (const box of this.itemBoxes) {
      box.mesh.rotation.y += dt * 1.2
      box.mesh.position.y = 1.15 + Math.sin(elapsed * 2 + box.x) * 0.12
    }
  }

  addCar(mesh) {
    this.carGroup.add(mesh)
  }

  removeCar(mesh) {
    this.carGroup.remove(mesh)
  }

  updateCamera(car, dt) {
    const behindX = Math.sin(car.heading) * -this.followDistance
    const behindZ = Math.cos(car.heading) * -this.followDistance
    const desiredX = car.position.x + behindX
    const desiredZ = car.position.z + behindZ
    const desiredY = this.followHeight

    const t = 1 - Math.exp(-this.camDecay * dt)
    this.camera.position.x += (desiredX - this.camera.position.x) * t
    this.camera.position.y += (desiredY - this.camera.position.y) * t
    this.camera.position.z += (desiredZ - this.camera.position.z) * t

    this._camLook.set(car.position.x, 0.6, car.position.z)
    this.camera.lookAt(this._camLook)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    const w = this.canvas.clientWidth || window.innerWidth
    const h = this.canvas.clientHeight || window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
  }

  dispose() {
    window.removeEventListener('resize', this._onResize)
  }
}
