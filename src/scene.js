import * as THREE from '../lib/three.module.min.js'

export const ARENA_RADIUS = 44

const SKY = 0xf6d9be
const GROUND = 0x8fbfa0

// Deterministic pseudo-random so every client generates the identical layout.
function seededRandom(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

export class GameScene {
  constructor(canvas) {
    this.canvas = canvas
    this.colliders = [] // {x, z, radius} static obstacle circles, used for gameplay collision

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.shadowMap.enabled = false // fake blob shadows instead, real shadow maps are costly

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(SKY)
    this.scene.fog = new THREE.Fog(SKY, 42, 100)

    this.camera = new THREE.PerspectiveCamera(64, 1, 0.1, 120)
    this.camera.position.set(0, 8, -10)
    this._camLook = new THREE.Vector3()
    this.followDistance = 7.2
    this.followHeight = 4.4
    this.camDecay = 7

    this._buildLights()
    this._buildGround()
    this._buildFence()
    this._buildObstacles()

    this.carGroup = new THREE.Group()
    this.scene.add(this.carGroup)

    this.particleGroup = new THREE.Group()
    this.scene.add(this.particleGroup)

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize)
    this._onResize()
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
