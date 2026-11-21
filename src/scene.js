import * as THREE from '../lib/three.module.min.js'
import { cloneAbilityModel } from './abilityModels.js'

export const ARENA_RADIUS = 44

const SKY = 0xf6d9be
const GROUND = 0x8fbfa0

// Deterministic pseudo-random so every client generates the identical layout.
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Each map is a method that fills `this.scene`, `this.colliders` and
 * `this.itemBoxes`. To add a map: write a `_buildXxxMap()` below, register it
 * here, and map a game mode to its id in game.js (MAP_BY_MODE). */
const MAP_BUILDERS = {
  arena: '_buildArenaMap',
}

const BASE_FOV = 64

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
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 120)
    this.camera.position.set(0, 8, -10)
    this._camLook = new THREE.Vector3()
    this.followDistance = 7.2
    this.followHeight = 4.4
    this.camDecay = 7

    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

    this.itemBoxes = []

    this[MAP_BUILDERS[mapId] || MAP_BUILDERS.arena]()

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
    const fallbackGeo = new THREE.OctahedronGeometry(0.55, 0)
    const fallbackMat = new THREE.MeshLambertMaterial({ color: 0xf7d774, flatShading: true, emissive: 0xf7d774, emissiveIntensity: 0.45 })

    this.itemBoxes = [] // { x, z, mesh }
    const count = 6
    for (let i = 0; i < count; i++) {
      const a = seededRandom(i * 9.7 + 41) * Math.PI * 2
      const r = 8 + seededRandom(i * 6.3 + 23) * (ARENA_RADIUS - 20)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r

      // the "?" box model if it loaded, otherwise the original gem shape
      const mesh = cloneAbilityModel('itembox') || new THREE.Mesh(fallbackGeo, fallbackMat.clone())
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
    const anim = car.animator

    // While sliding, the camera swings part-way toward the direction the car is
    // actually travelling instead of where it points, so a drift shows the
    // car's flank. (Only when moving forward; reversing would flip it.)
    let camHeading = car.heading
    if (!this.reducedMotion && car.speed > 3 && anim.driftBlend > 0.01) {
      const velHeading = Math.atan2(car.velocity.x, car.velocity.z)
      const diff = ((velHeading - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      camHeading += diff * 0.3 * anim.driftBlend
    }

    const desiredX = car.position.x - Math.sin(camHeading) * this.followDistance
    const desiredZ = car.position.z - Math.cos(camHeading) * this.followDistance
    const desiredY = this.followHeight

    const t = 1 - Math.exp(-this.camDecay * dt)
    this.camera.position.x += (desiredX - this.camera.position.x) * t
    this.camera.position.y += (desiredY - this.camera.position.y) * t
    this.camera.position.z += (desiredZ - this.camera.position.z) * t

    this._camLook.set(car.position.x, 0.6, car.position.z)
    this.camera.lookAt(this._camLook)

    if (this.reducedMotion) return

    // FOV widens with speed (and a bit more under boost) for a sense of pace
    const boostKick = car.isBoosted() ? 5 : 0
    const fovTarget = BASE_FOV + car.speedFraction * 5 + boostKick
    const fovT = 1 - Math.exp(-4 * dt)
    if (Math.abs(fovTarget - this.camera.fov) > 0.01) {
      this.camera.fov += (fovTarget - this.camera.fov) * fovT
      this.camera.updateProjectionMatrix()
    }
    this.camera.rotateZ(anim.roll * 0.25) // bank gently into the turn
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
