import * as THREE from '../lib/three.module.min.js'
import { GLTFLoader } from '../lib/GLTFLoader.min.js'

export const CAR_TYPES = [
  { id: 'roadster', name: 'Roadster' },
  { id: 'sport', name: 'Sport Coupe' },
  { id: 'truck', name: 'Big Truck' },
  { id: 'police', name: 'Police Cruiser' },
]

export function getCarTypes() {
  return CAR_TYPES
}

function buildWheelPivots(parentGroup, material, specs, radius, width) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 10)
  return specs.map((spec) => {
    const pivot = new THREE.Group()
    pivot.position.set(spec.x, spec.y, spec.z)
    const wheelMesh = new THREE.Mesh(geo, material)
    wheelMesh.rotation.z = Math.PI / 2
    pivot.add(wheelMesh)
    parentGroup.add(pivot)
    return { pivot, isFront: spec.front }
  })
}

// ---------------- procedural cars ----------------

function buildRoadster(colorHex) {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true })
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2233, flatShading: true })
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, flatShading: true, transparent: true, opacity: 0.85 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.6), bodyMat)
  body.position.y = 0.42
  group.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.3), glassMat)
  cabin.position.set(0, 0.86, -0.1)
  group.add(cabin)

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.22, 0.3), darkMat)
  bumper.position.set(0, 0.28, 1.3)
  group.add(bumper)

  const wheels = buildWheelPivots(group, darkMat, [
    { x: -0.83, y: 0.34, z: 0.85, front: true },
    { x: 0.83, y: 0.34, z: 0.85, front: true },
    { x: -0.83, y: 0.34, z: -0.85, front: false },
    { x: 0.83, y: 0.34, z: -0.85, front: false },
  ], 0.34, 0.32)

  return Promise.resolve({ vehicle: group, wheels })
}

function buildSport(colorHex) {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true })
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x201a28, flatShading: true })
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xbfe4ff, flatShading: true, transparent: true, opacity: 0.85 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.36, 2.9), bodyMat)
  body.position.y = 0.32
  group.add(body)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.34, 1.1), glassMat)
  cabin.position.set(0, 0.6, -0.15)
  group.add(cabin)

  const spoilerBar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.22), darkMat)
  spoilerBar.position.set(0, 0.62, -1.3)
  group.add(spoilerBar)
  const strutGeo = new THREE.BoxGeometry(0.08, 0.22, 0.08)
  const strutL = new THREE.Mesh(strutGeo, darkMat)
  strutL.position.set(-0.5, 0.5, -1.3)
  group.add(strutL)
  const strutR = new THREE.Mesh(strutGeo, darkMat)
  strutR.position.set(0.5, 0.5, -1.3)
  group.add(strutR)

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.28), darkMat)
  bumper.position.set(0, 0.2, 1.45)
  group.add(bumper)

  const wheels = buildWheelPivots(group, darkMat, [
    { x: -0.8, y: 0.3, z: 0.95, front: true },
    { x: 0.8, y: 0.3, z: 0.95, front: true },
    { x: -0.8, y: 0.3, z: -0.95, front: false },
    { x: 0.8, y: 0.3, z: -0.95, front: false },
  ], 0.3, 0.3)

  return Promise.resolve({ vehicle: group, wheels })
}

function buildTruck(colorHex) {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex, flatShading: true })
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a2233, flatShading: true })
  const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8ff, flatShading: true, transparent: true, opacity: 0.85 })
  const bedMat = new THREE.MeshLambertMaterial({ color: 0x3a3244, flatShading: true })

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.85, 1.3), bodyMat)
  cab.position.set(0, 0.62, 0.9)
  group.add(cab)

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.5, 0.1), glassMat)
  windshield.position.set(0, 0.85, 1.5)
  group.add(windshield)

  const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.15, 1.7), bedMat)
  bedFloor.position.set(0, 0.35, -0.85)
  group.add(bedFloor)
  const bedBack = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.4, 0.12), bedMat)
  bedBack.position.set(0, 0.55, -1.68)
  group.add(bedBack)
  const sideWallGeo = new THREE.BoxGeometry(0.12, 0.4, 1.7)
  const bedLeft = new THREE.Mesh(sideWallGeo, bedMat)
  bedLeft.position.set(-0.72, 0.55, -0.85)
  group.add(bedLeft)
  const bedRight = new THREE.Mesh(sideWallGeo, bedMat)
  bedRight.position.set(0.72, 0.55, -0.85)
  group.add(bedRight)

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.26), darkMat)
  bumper.position.set(0, 0.2, 1.62)
  group.add(bumper)

  const wheels = buildWheelPivots(group, darkMat, [
    { x: -0.88, y: 0.4, z: 1.0, front: true },
    { x: 0.88, y: 0.4, z: 1.0, front: true },
    { x: -0.88, y: 0.4, z: -1.05, front: false },
    { x: 0.88, y: 0.4, z: -1.05, front: false },
  ], 0.4, 0.36)

  return Promise.resolve({ vehicle: group, wheels })
}

// ---------------- GLB car (police cruiser) ----------------

const POLICE_GLB_URL = './assets/models/police_car.glb'
const POLICE_SCALE = 0.75
const POLICE_BODY_MATERIAL = 'White'
const GLOW_MATERIALS = ['Headlights', 'TailLights', 'WhiteLights', 'BlueLights']

let policeTemplatePromise = null

function loadPoliceTemplate() {
  if (policeTemplatePromise) return policeTemplatePromise
  policeTemplatePromise = new Promise((resolve, reject) => {
    new GLTFLoader().load(
      POLICE_GLB_URL,
      (gltf) => {
        const scene = gltf.scene

        // turn the two front-wheel nodes into rotation pivots centered on
        // their own geometry, same trick as the procedural cars' wheels,
        // so steering can visually turn them.
        for (const child of [...scene.children]) {
          if (/front(left|right)wheel/i.test(child.name)) {
            const box = new THREE.Box3().setFromObject(child)
            const center = box.getCenter(new THREE.Vector3())
            const pivot = new THREE.Group()
            pivot.userData.isFrontWheelPivot = true
            pivot.position.copy(center)
            scene.remove(child)
            child.position.sub(center)
            pivot.add(child)
            scene.add(pivot)
          }
        }

        scene.traverse((obj) => {
          if (!obj.isMesh) return
          obj.material.flatShading = true
          obj.material.needsUpdate = true
          if (GLOW_MATERIALS.includes(obj.material.name)) {
            obj.material.emissive.copy(obj.material.color)
            obj.material.emissiveIntensity = 0.6
          }
        })

        scene.scale.setScalar(POLICE_SCALE)
        resolve(scene)
      },
      undefined,
      (err) => reject(err)
    )
  })
  return policeTemplatePromise
}

/** Kick off the GLB fetch as early as possible (e.g. on app load) so it's
 * almost always already cached by the time a player picks the car. */
export function preloadModels() {
  loadPoliceTemplate().catch((e) => console.warn('Police car model failed to preload:', e))
}

async function buildPolice(colorHex) {
  const template = await loadPoliceTemplate()
  const vehicle = template.clone(true)

  const wheels = []
  vehicle.traverse((obj) => {
    if (obj.userData.isFrontWheelPivot) wheels.push({ pivot: obj, isFront: true })
  })

  // recolor only this instance's body panels; everything else (windows,
  // lights, wheels) stays shared with the cached template for efficiency.
  vehicle.traverse((obj) => {
    if (obj.isMesh && obj.material.name === POLICE_BODY_MATERIAL) {
      obj.material = obj.material.clone()
      obj.material.color.setHex(colorHex)
    }
  })

  return { vehicle, wheels }
}

// ---------------- dispatcher ----------------

const BUILDERS = {
  roadster: buildRoadster,
  sport: buildSport,
  truck: buildTruck,
  police: buildPolice,
}

/** Returns { vehicle: THREE.Group, wheels: [{pivot, isFront}] } for the given
 * car type, tinted to colorHex where the model supports recoloring. */
export async function buildCar(carTypeId, colorHex) {
  const builder = BUILDERS[carTypeId] || BUILDERS.roadster
  try {
    return await builder(colorHex)
  } catch (e) {
    console.warn(`Car type "${carTypeId}" failed to load, falling back to the roadster:`, e)
    return buildRoadster(colorHex)
  }
}
