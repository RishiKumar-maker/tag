import * as THREE from '../lib/three.module.min.js'

const TRAFFIC_COLORS = [0x9b93ab, 0x7d94a8, 0x93a889, 0xa38b7a, 0x8f8fa0]
const TRAFFIC_RADIUS = 1.15 // rough collision radius, a bit smaller than a player car

function seededRandom(seed) {
  const x = Math.sin(seed * 78.233) * 12543.112
  return x - Math.floor(x)
}

function buildTrafficMesh(colorHex) {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true })
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2233, flatShading: true })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.55, 2.4), bodyMat)
  body.position.y = 0.4
  group.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.4, 1.1), darkMat)
  cabin.position.set(0, 0.78, -0.05)
  group.add(cabin)

  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.28, 8)
  for (const [x, z] of [[-0.78, 0.75], [0.78, 0.75], [-0.78, -0.75], [0.78, -0.75]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat)
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(x, 0.32, z)
    group.add(wheel)
  }

  return group
}

/** Deterministic traffic layout: every client builds the identical set from
 * the same seeds, so no positions ever need to go over the network. */
export function buildTrafficCars(scene, waypoints, loopLength, count = 16) {
  const cars = []
  for (let i = 0; i < count; i++) {
    const seed = i * 11.7 + 5
    const startFrac = i / count + (seededRandom(seed) - 0.5) * (1 / count) * 0.6
    const laneOffset = (seededRandom(seed + 1) * 2 - 1) * (9 * 0.6)
    const moving = seededRandom(seed + 2) > 0.3
    const speed = moving ? 2.5 + seededRandom(seed + 3) * 4.5 : 0
    const color = TRAFFIC_COLORS[i % TRAFFIC_COLORS.length]

    const mesh = buildTrafficMesh(color)
    scene.scene.add(mesh)

    cars.push({ startFrac: ((startFrac % 1) + 1) % 1, laneOffset, speed, mesh })
  }
  return cars
}

/** Traffic gets a little faster the longer a run goes on, so sustained
 * survival stays a genuine test rather than a solved pattern. */
export function trafficSpeedMultiplier(elapsedSec) {
  return Math.min(1 + elapsedSec * 0.0035, 2.2)
}

export function updateTrafficCars(trafficCars, elapsedSec, waypoints, loopLength) {
  const speedMult = trafficSpeedMultiplier(elapsedSec)
  const n = waypoints.length

  for (const car of trafficCars) {
    const distTravelled = car.speed * speedMult * elapsedSec
    const frac = ((car.startFrac + distTravelled / loopLength) % 1 + 1) % 1
    const idxF = frac * n
    const i0 = Math.floor(idxF) % n
    const i1 = (i0 + 1) % n
    const localT = idxF - Math.floor(idxF)

    const wp0 = waypoints[i0]
    const wp1 = waypoints[i1]
    const x = wp0.x + (wp1.x - wp0.x) * localT
    const z = wp0.z + (wp1.z - wp0.z) * localT

    const dx = wp1.x - wp0.x
    const dz = wp1.z - wp0.z
    const len = Math.hypot(dx, dz) || 1
    const perpX = -dz / len
    const perpZ = dx / len
    const heading = Math.atan2(dx, dz)

    car.x = x + perpX * car.laneOffset
    car.z = z + perpZ * car.laneOffset
    car.mesh.position.set(car.x, 0, car.z)
    car.mesh.rotation.y = car.speed > 0 ? heading : car.mesh.rotation.y
  }
}

export function checkTrafficCollision(playerCar, trafficCars, carRadius) {
  for (const car of trafficCars) {
    const dx = playerCar.position.x - car.x
    const dz = playerCar.position.z - car.z
    if (Math.hypot(dx, dz) < TRAFFIC_RADIUS + carRadius) return true
  }
  return false
}

export function clearTrafficCars(scene, trafficCars) {
  for (const car of trafficCars) scene.scene.remove(car.mesh)
}
