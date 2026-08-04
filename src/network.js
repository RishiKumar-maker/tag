import { joinRoom, selfId } from '../lib/trystero-nostr.min.js'

// Fixed namespace so every deployed copy of this game finds the same peers.
// Change this if you fork the project and don't want to share signaling with the original.
const APP_ID = 'drift-tag-arena-v1'

export class Network {
  constructor() {
    this.room = null
    this.isHost = false
    this.roomId = null
    this._actions = {}

    // Assign these from outside to react to network events.
    this.onPeerJoin = null
    this.onPeerLeave = null
    this.onPlayerInfo = null
    this.onModeSelect = null
    this.onRoundStart = null
    this.onCarState = null
    this.onTagEvent = null
    this.onRoundEnd = null
    this.onItemPickup = null
    this.onAbilityUse = null
    this.onAbilityHit = null
  }

  get selfId() {
    return selfId
  }

  join(roomId, isHost) {
    this.roomId = roomId
    this.isHost = isHost
    this.room = joinRoom({ appId: APP_ID }, roomId)

    const make = (name) => this.room.makeAction(name)
    this._actions = {
      playerInfo: make('player-info'),
      modeSelect: make('mode-select'),
      roundStart: make('round-start'),
      carState: make('car-state'),
      tagEvent: make('tag-event'),
      roundEnd: make('round-end'),
      itemPickup: make('item-pickup'),
      abilityUse: make('ability-use'),
      abilityHit: make('ability-hit'),
    }

    this._actions.playerInfo.onMessage = (data, ctx) => this.onPlayerInfo?.(data, ctx.peerId)
    this._actions.modeSelect.onMessage = (data) => this.onModeSelect?.(data)
    this._actions.roundStart.onMessage = (data) => this.onRoundStart?.(data)
    this._actions.carState.onMessage = (data, ctx) => this.onCarState?.(data, ctx.peerId)
    this._actions.tagEvent.onMessage = (data) => this.onTagEvent?.(data)
    this._actions.roundEnd.onMessage = (data) => this.onRoundEnd?.(data)
    this._actions.itemPickup.onMessage = (data) => this.onItemPickup?.(data)
    this._actions.abilityUse.onMessage = (data) => this.onAbilityUse?.(data)
    this._actions.abilityHit.onMessage = (data) => this.onAbilityHit?.(data)

    this.room.onPeerJoin = (peerId) => this.onPeerJoin?.(peerId)
    this.room.onPeerLeave = (peerId) => this.onPeerLeave?.(peerId)
  }

  leave() {
    if (this.room) {
      try { this.room.leave() } catch (e) { /* already gone */ }
      this.room = null
    }
  }

  getPeerIds() {
    if (!this.room) return []
    return Object.keys(this.room.getPeers())
  }

  sendPlayerInfo(info, target) {
    this._actions.playerInfo?.send(info, target ? { target } : undefined)
  }
  sendModeSelect(mode) {
    this._actions.modeSelect?.send({ mode })
  }
  sendRoundStart(payload) {
    this._actions.roundStart?.send(payload)
  }
  sendCarState(state) {
    this._actions.carState?.send(state)
  }
  sendTagEvent(payload) {
    this._actions.tagEvent?.send(payload)
  }
  sendRoundEnd(payload) {
    this._actions.roundEnd?.send(payload)
  }
  sendItemPickup(payload) {
    this._actions.itemPickup?.send(payload)
  }
  sendAbilityUse(payload) {
    this._actions.abilityUse?.send(payload)
  }
  sendAbilityHit(payload) {
    this._actions.abilityHit?.send(payload)
  }
}
