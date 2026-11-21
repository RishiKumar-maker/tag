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

const hubMat = new THREE.MeshLambertMaterial({ color: 0xd9d0e6, flatShading: true })

// Each wheel is pivot (steering, Y) -> spin (rolling, X) -> mesh. The hub bar
// on the outer face is what makes the rolling visible: a plain cylinder looks
// identical however fast it turns.
function buildWheelPivots(parentGroup, material, specs, radius, width) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 10)
  const hubGeo = new THREE.BoxGeometry(0.035, radius * 1.55, radius * 0.3)
  return specs.map((spec) => {
    const pivot = new THREE.Group()
    pivot.position.set(spec.x, spec.y, spec.z)
    const spin = new THREE.Group()
    const wheelMesh = new THREE.Mesh(geo, material)
    wheelMesh.rotation.z = Math.PI / 2
    spin.add(wheelMesh)
    const hub = new THREE.Mesh(hubGeo, hubMat)
    hub.position.x = Math.sign(spec.x) * (width / 2 + 0.004)
    spin.add(hub)
    pivot.add(spin)
    parentGroup.add(pivot)
    return { pivot, spin, isFront: spec.front }
  })
}

/** What the effects code needs to know about a car's shape: where the rear
 * tyres touch the ground (skid marks, smoke) and where boost flames mount. */
function carDims({ rearWheelX, rearWheelZ, rearZ, exhaustX, exhaustY = 0.34 }) {
  return { rearWheelX, rearWheelZ, rearZ, exhaustX, exhaustY }
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

  return Promise.resolve({ vehicle: group, wheels, dims: carDims({ rearWheelX: 0.83, rearWheelZ: -0.85, rearZ: -1.3, exhaustX: 0.42 }) })
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

  return Promise.resolve({ vehicle: group, wheels, dims: carDims({ rearWheelX: 0.8, rearWheelZ: -0.95, rearZ: -1.45, exhaustX: 0.4, exhaustY: 0.3 }) })
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

  return Promise.resolve({ vehicle: group, wheels, dims: carDims({ rearWheelX: 0.88, rearWheelZ: -1.05, rearZ: -1.7, exhaustX: 0.5, exhaustY: 0.4 }) })
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

        // turn the wheel nodes into pivot -> spin -> mesh, centred on their
        // own geometry, same structure as the procedural cars' wheels: the
        // front pair can steer, and all of them can roll. (The rear pair is
        // one merged mesh; spinning it about its own centre rolls both.)
        for (const child of [...scene.children]) {
          const isFront = /front(left|right)wheel/i.test(child.name)
          const isRear = /backwheel/i.test(child.name)
          if (!isFront && !isRear) continue
          const box = new THREE.Box3().setFromObject(child)
          const center = box.getCenter(new THREE.Vector3())
          const pivot = new THREE.Group()
          const spin = new THREE.Group()
          pivot.userData.wheelRole = isFront ? 'front' : 'rear'
          pivot.position.copy(center)
          scene.remove(child)
          child.position.sub(center)
          spin.add(child)
          pivot.add(spin)
          scene.add(pivot)
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
    const role = obj.userData.wheelRole
    if (role) wheels.push({ pivot: obj, spin: obj.children[0], isFront: role === 'front' })
  })

  // recolor only this instance's body panels; everything else (windows,
  // lights, wheels) stays shared with the cached template for efficiency.
  vehicle.traverse((obj) => {
    if (obj.isMesh && obj.material.name === POLICE_BODY_MATERIAL) {
      obj.material = obj.material.clone()
      obj.material.color.setHex(colorHex)
    }
  })

  // measured from the model (rear tyre centres sit at x=+-0.69, z=-1.15 before
  // the POLICE_SCALE; the body ends at z=-1.87)
  const dims = carDims({
    rearWheelX: 0.69 * POLICE_SCALE, rearWheelZ: -1.155 * POLICE_SCALE, rearZ: -1.87 * POLICE_SCALE,
    exhaustX: 0.4 * POLICE_SCALE, exhaustY: 0.4 * POLICE_SCALE,
  })
  return { vehicle, wheels, dims }
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
