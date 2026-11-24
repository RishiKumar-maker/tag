import { FIELD, GOAL, BALL_RADIUS } from './soccerLayout.js'
import { projectRoundedRect } from './maps.js'

// The ball rolls on the ground (the game is a flat drive-around, so no
// aerials). Everything here is plain numbers, so it runs identically on every
// player's machine and in Node for tools/test-soccer.mjs.

export const BALL_PHYSICS = {
  drag: 0.42, // rolling resistance: speed decays by e^(-drag * t)
  wallBounce: 0.72, // how much speed survives a wall hit
  carBounce: 0.65, // how lively a car hit is (1 = a perfectly elastic knock)
  maxSpeed: 56,
  stopBelow: 0.15, // snap to rest under this speed
}

export function createBall() {
  return { x: 0, z: 0, vx: 0, vz: 0, lastTouchId: null, lastTouchTeam: null }
}

export function resetBall(ball, x = 0, z = 0) {
  ball.x = x
  ball.z = z
  ball.vx = 0
  ball.vz = 0
  ball.lastTouchId = null
  ball.lastTouchTeam = null
}

export const ballSpeed = (b) => Math.hypot(b.vx, b.vz)

// ------------------------------------------------- where the ball may be
// The ball's CENTRE must stay inside: the pitch (a rounded rectangle, pulled
// in by the ball's radius) joined to a narrow recess behind each goal mouth.

const INNER = { hx: FIELD.halfX - BALL_RADIUS, hz: FIELD.halfZ - BALL_RADIUS, cr: Math.max(FIELD.cornerRadius - BALL_RADIUS, 1) }
const RECESS = {
  hz: GOAL.halfWidth - BALL_RADIUS, // the ball must fit between the posts
  xFrom: FIELD.halfX - BALL_RADIUS - 1, // overlaps the pitch so the two regions join up
  xTo: FIELD.halfX + GOAL.depth - BALL_RADIUS,
}

/** Nearest point inside the recess behind the goal at side (+1 or -1). */
function projectRecess(px, pz, side) {
  const x = side * Math.min(Math.max(side * px, RECESS.xFrom), RECESS.xTo)
  const z = Math.min(Math.max(pz, -RECESS.hz), RECESS.hz)
  return { x, z }
}

/** Nearest allowed position for the ball's centre. */
export function nearestAllowed(px, pz) {
  const inner = projectRoundedRect(px, pz, INNER.hx, INNER.hz, INNER.cr)
  let best = inner
  let bestD = Math.hypot(inner.x - px, inner.z - pz)
  if (bestD < 1e-9) return best
  for (const side of [-1, 1]) {
    const r = projectRecess(px, pz, side)
    const d = Math.hypot(r.x - px, r.z - pz)
    if (d < bestD) { best = r; bestD = d }
  }
  return best
}

/** Is a ball centre at this point somewhere the ball is allowed to be? */
export function isAllowed(x, z, eps = 1e-6) {
  const p = nearestAllowed(x, z)
  return Math.hypot(p.x - x, p.z - z) <= eps
}

// ---------------------------------------------------------------- stepping

/** Advance the ball by dt seconds. Returns { wallHit, goalFor } where wallHit
 * is how hard it struck a wall (0 if none) and goalFor is 0 or 1 if the ball
 * is fully over a goal line (the team that scored), else null. */
export function stepBall(ball, dt, params = BALL_PHYSICS) {
  let wallHit = 0

  // fast balls move in two halves so they can't skip through a car or wall
  const parts = ballSpeed(ball) * dt > 1.6 ? 2 : 1
  const h = dt / parts
  for (let i = 0; i < parts; i++) {
    const k = Math.exp(-params.drag * h)
    ball.vx *= k
    ball.vz *= k
    if (ballSpeed(ball) < params.stopBelow) { ball.vx = 0; ball.vz = 0 }

    ball.x += ball.vx * h
    ball.z += ball.vz * h

    const p = nearestAllowed(ball.x, ball.z)
    const dx = p.x - ball.x
    const dz = p.z - ball.z
    const d = Math.hypot(dx, dz)
    if (d > 1e-9) {
      ball.x = p.x
      ball.z = p.z
      const nx = dx / d // inward normal
      const nz = dz / d
      const vn = ball.vx * nx + ball.vz * nz
      if (vn < 0) {
        ball.vx -= (1 + params.wallBounce) * vn * nx
        ball.vz -= (1 + params.wallBounce) * vn * nz
        wallHit = Math.max(wallHit, -vn)
      }
    }
  }

  const speed = ballSpeed(ball)
  if (speed > params.maxSpeed) {
    ball.vx *= params.maxSpeed / speed
    ball.vz *= params.maxSpeed / speed
  }

  let goalFor = null
  if (Math.abs(ball.z) <= GOAL.halfWidth) {
    if (ball.x > FIELD.halfX + BALL_RADIUS) goalFor = 0 // into the +x goal: Coral attacks +x
    else if (ball.x < -(FIELD.halfX + BALL_RADIUS)) goalFor = 1
  }
  return { wallHit, goalFor }
}

/** Knock the ball with a car. Cars are far heavier than the ball, so the
 * ball leaves along the contact normal at the car's speed plus a bounce.
 * `car` is { x, z, vx, vz }. Returns how hard the hit was (0 = no contact). */
export function collideCarBall(ball, car, carRadius, params = BALL_PHYSICS) {
  const dx = ball.x - car.x
  const dz = ball.z - car.z
  const dist = Math.hypot(dx, dz)
  const minDist = BALL_RADIUS + carRadius
  if (dist >= minDist || dist < 1e-4) return 0

  const nx = dx / dist
  const nz = dz / dist
  ball.x = car.x + nx * minDist // push the ball back out of the car
  ball.z = car.z + nz * minDist

  const ballVn = ball.vx * nx + ball.vz * nz
  const carVn = car.vx * nx + car.vz * nz
  const closing = carVn - ballVn // > 0: the car is moving into the ball
  if (closing <= 0) return 0

  const newVn = carVn + params.carBounce * closing
  ball.vx += (newVn - ballVn) * nx
  ball.vz += (newVn - ballVn) * nz
  const speed = ballSpeed(ball)
  if (speed > params.maxSpeed) {
    ball.vx *= params.maxSpeed / speed
    ball.vz *= params.maxSpeed / speed
  }
  return closing
}
