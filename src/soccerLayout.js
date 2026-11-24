// Car Soccer: the stadium's dimensions and where everything starts. Pure data
// (no three.js) so the build code, the game rules and tools/test-soccer.mjs
// all read the same numbers.
//
//   x is the long axis. Team 0 (Coral) defends the goal at -x and attacks +x;
//   team 1 (Sky) defends +x and attacks -x.
//
//        z+
//   +-----------------------------+
//   |  (  corners are rounded  )  |
//  [G]            O              [G]      [G] = goal (a recess behind the end line)
//   |                             |
//   +-----------------------------+
//        z-

export const FIELD = { halfX: 52, halfZ: 32, cornerRadius: 9 }
export const GOAL = { halfWidth: 9, depth: 8, height: 4.6 }
export const BALL_RADIUS = 2

export const TEAMS = [
  { id: 0, name: 'Coral', color: 0xff8c69, css: '#ff8c69' },
  { id: 1, name: 'Sky', color: 0x7ec8e3, css: '#7ec8e3' },
]

/** Where the cars start each kickoff: each team on its own half, facing the
 * other, spread across the width. */
export function kickoffSpot(team, slot, teamSize) {
  const side = team === 0 ? -1 : 1
  const spread = 9
  return {
    x: side * 24,
    z: (slot - (teamSize - 1) / 2) * spread,
    heading: team === 0 ? Math.PI / 2 : -Math.PI / 2, // heading 0 faces +z; pi/2 faces +x
  }
}

/** Solo practice: you, the ball and an open goal. */
export const PRACTICE_SPOT = { x: -20, z: 0, heading: Math.PI / 2 }

export const BOOST_PADS = [
  { x: -36, z: -20 }, { x: -36, z: 20 }, { x: 36, z: -20 }, { x: 36, z: 20 },
  { x: 0, z: -26 }, { x: 0, z: 26 },
  { x: -16, z: 0 }, { x: 16, z: 0 },
]
export const BOOST_PAD_RADIUS = 2.4
export const BOOST_PAD_COOLDOWN_MS = 6000
export const BOOST_PAD_BURST_MS = 1500

/** Split the roster into two balanced teams, shuffling who ends up where.
 * Returns { [playerId]: 0 | 1 }. `rand` is injectable so tests are repeatable. */
export function assignTeams(playerIds, rand = Math.random) {
  const ids = [...playerIds]
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  const teams = {}
  ids.forEach((id, i) => { teams[id] = i % 2 })
  return teams
}

/** Every kickoff slot for a team, in a stable order (sorted by player id) so
 * all peers agree where each car goes without sending anything. */
export function slotFor(playerId, teams) {
  const mates = Object.keys(teams).filter((id) => teams[id] === teams[playerId]).sort()
  return { slot: mates.indexOf(playerId), size: mates.length }
}
