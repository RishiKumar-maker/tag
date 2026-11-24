// The rules of a Car Soccer match as a small state machine. No three.js, no
// network: the host owns the real one and broadcasts its snapshots; guests
// only mirror them. Pure, so tools/test-soccer.mjs can run it.
//
//   COUNTDOWN --(3s)--> PLAYING --goal--> GOAL --(celebration)--> COUNTDOWN ...
//                          |                                  \--> ENDED   (a golden goal)
//                          +--clock hits 0--> ENDED  or  overtime (sudden death) if level

export const PHASE = { COUNTDOWN: 'countdown', PLAYING: 'playing', GOAL: 'goal', ENDED: 'ended' }

export class SoccerMatch {
  /** practice: no clock and no countdown, goals just reset the ball. */
  constructor({ durationMs = 180000, practice = false, countdownMs = 3000, goalMs = 3200 } = {}) {
    this.practice = practice
    this.durationMs = durationMs
    this.countdownMs = countdownMs
    this.goalMs = practice ? 2000 : goalMs
    this.scores = [0, 0]
    this.remainingMs = durationMs
    this.overtime = false
    this.decided = false // a golden goal was scored: the match ends after its celebration
    this.phase = practice ? PHASE.PLAYING : PHASE.COUNTDOWN
    this.phaseMs = practice ? 0 : countdownMs
  }

  snapshot() {
    return {
      phase: this.phase,
      phaseMs: Math.max(0, Math.round(this.phaseMs)),
      remainingMs: Math.max(0, Math.round(this.remainingMs)),
      overtime: this.overtime,
      scores: [...this.scores],
    }
  }

  /** Guests copy the host's state. Accepts only well-formed values. */
  applySnapshot(s) {
    if (!s || !Object.values(PHASE).includes(s.phase)) return
    const num = (v, fallback) => (Number.isFinite(v) ? v : fallback)
    this.phase = s.phase
    this.phaseMs = Math.max(0, num(s.phaseMs, 0))
    this.remainingMs = Math.max(0, num(s.remainingMs, this.remainingMs))
    this.overtime = !!s.overtime
    if (Array.isArray(s.scores)) this.scores = [Math.max(0, num(s.scores[0], 0)), Math.max(0, num(s.scores[1], 0))]
  }

  /** Team 0, team 1, or null when level. */
  winner() {
    if (this.scores[0] === this.scores[1]) return null
    return this.scores[0] > this.scores[1] ? 0 : 1
  }

  /** The ball went in. `team` is who scored. Returns the event, or null if a
   * goal can't count right now (already celebrating, or the match is over). */
  scoreGoal(team, scorerId = null, ownGoal = false) {
    if (this.phase !== PHASE.PLAYING || (team !== 0 && team !== 1)) return null
    this.scores[team]++
    this.decided = this.overtime
    this.phase = PHASE.GOAL
    this.phaseMs = this.goalMs
    return { type: 'goal', team, scorerId, ownGoal, state: this.snapshot() }
  }

  /** Advance by dtMs. Returns the events that happened, each carrying a snapshot. */
  update(dtMs) {
    const events = []
    const emit = (e) => events.push({ ...e, state: this.snapshot() })

    if (this.phase === PHASE.COUNTDOWN) {
      this.phaseMs -= dtMs
      if (this.phaseMs <= 0) {
        this.phase = PHASE.PLAYING
        this.phaseMs = 0
        emit({ type: 'play' })
      }
    } else if (this.phase === PHASE.PLAYING) {
      if (!this.practice && !this.overtime) {
        this.remainingMs -= dtMs
        if (this.remainingMs <= 0) {
          this.remainingMs = 0
          if (this.scores[0] === this.scores[1]) {
            this.overtime = true
            emit({ type: 'overtime' })
          } else {
            this.phase = PHASE.ENDED
            emit({ type: 'end', winner: this.winner() })
          }
        }
      }
    } else if (this.phase === PHASE.GOAL) {
      this.phaseMs -= dtMs
      if (this.phaseMs <= 0) {
        if (this.decided) {
          this.phase = PHASE.ENDED
          emit({ type: 'end', winner: this.winner() })
        } else if (this.practice) {
          this.phase = PHASE.PLAYING
          this.phaseMs = 0
          emit({ type: 'kickoff' })
          emit({ type: 'play' })
        } else {
          this.phase = PHASE.COUNTDOWN
          this.phaseMs = this.countdownMs
          emit({ type: 'kickoff' })
        }
      }
    }
    return events
  }
}
