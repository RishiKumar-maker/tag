// Harbor Yard: where everything goes. Pure data (no three.js), so the build
// code in harborMap.js and the geometry tests in tools/ read the same numbers.
//
// The yard is a rectangle, symmetric across both axes so neither end of the
// map is better for the chaser. We describe one quarter (x > 0, z > 0) and
// mirror it into the other three.
//
//             z+
//      +------------------------------------+
//      |   D      C                         |     A, D  containers lying along x
//      |  ====    ||     (mirrored in       |     B, C  containers lying along z
//      |    B||                 all four     |
//   x- |  ====     ====   quarters)          | x+
//      |       (  O  )   <- roundabout      |
//      +------------------------------------+
//             z-

export const HARBOR = { halfX: 48, halfZ: 34 }

export const CONTAINER_WIDTH = 2.5
export const CONTAINER_HEIGHT = 2.3

// One quarter. Gaps between neighbours are all >= 4.75 wide: tight enough to
// be fun to flick a drift through, wide enough that nobody gets wedged.
const QUARTER = [
  { x: 26, z: 10, len: 12, axis: 'x' }, // A: edge of the main street
  { x: 14, z: 24, len: 12, axis: 'z' }, // B: edge of the central avenue
  { x: 38, z: 20, len: 12, axis: 'z' }, // C: outer block
  { x: 26, z: 27, len: 12, axis: 'x' }, // D: top lane
]

const CONTAINER_COLORS = [0xff8c69, 0x7fdbb6, 0xb8a6e0, 0xf7d774, 0x7ec8e3, 0xf4a6c6]

const QUARTER_LAMPS = [[20, 16], [34, 5]]
const QUARTER_BARRELS = [[8, 27]] // a cluster of three
const BARREL_OFFSETS = [[0, 0], [1.1, 0.4], [0.5, 1.2]]
const QUARTER_ITEMS = [[30, 0], [0, 24], [24, 18]] // main street, avenue end, between A and D
const ITEM_MIRRORS = { '30,0': [[1, 1], [-1, 1]], '0,24': [[1, 1], [1, -1]] } // on an axis: only two copies, not four

export const ISLAND = { x: 0, z: 0, radius: 2.6 } // the roundabout everyone spawns around
export const LAMP_RADIUS = 0.4
export const BARREL_RADIUS = 0.55

const MIRRORS = [[1, 1], [-1, 1], [1, -1], [-1, -1]]

export function buildHarborLayout() {
  const containers = []
  const lamps = []
  const barrels = []
  const items = []

  QUARTER.forEach((c, i) => {
    MIRRORS.forEach(([sx, sz], m) => {
      const long = c.len / 2
      const short = CONTAINER_WIDTH / 2
      containers.push({
        x: c.x * sx,
        z: c.z * sz,
        hx: c.axis === 'x' ? long : short,
        hz: c.axis === 'x' ? short : long,
        axis: c.axis,
        color: CONTAINER_COLORS[(i * 2 + m) % CONTAINER_COLORS.length],
      })
    })
  })

  for (const [x, z] of QUARTER_LAMPS) for (const [sx, sz] of MIRRORS) lamps.push({ x: x * sx, z: z * sz })
  for (const [x, z] of QUARTER_BARRELS) {
    for (const [sx, sz] of MIRRORS) for (const [ox, oz] of BARREL_OFFSETS) barrels.push({ x: x * sx + ox * sx, z: z * sz + oz * sz })
  }
  for (const [x, z] of QUARTER_ITEMS) {
    const mirrors = ITEM_MIRRORS[`${x},${z}`] || MIRRORS
    for (const [sx, sz] of mirrors) items.push({ x: x * sx, z: z * sz })
  }

  // what cars actually collide with
  const colliders = [
    { x: ISLAND.x, z: ISLAND.z, radius: ISLAND.radius },
    ...containers.map((c) => ({ x: c.x, z: c.z, hx: c.hx, hz: c.hz })),
    ...lamps.map((l) => ({ x: l.x, z: l.z, radius: LAMP_RADIUS })),
    ...barrels.map((b) => ({ x: b.x, z: b.z, radius: BARREL_RADIUS })),
  ]

  return { containers, lamps, barrels, items, island: ISLAND, colliders }
}
