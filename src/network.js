import { joinRoom, selfId } from '../lib/trystero-nostr.min.js'

// Fixed namespace so every deployed copy of this game finds the same peers.
// Change this if you fork the project and don't want to share signaling with the original.
const APP_ID = 'drift-tag-arena-v1'

// Trystero's default WebRTC config is STUN-only (Google + Cloudflare STUN).
// STUN alone is enough when peers can reach each other via straightforward
// NAT hole-punching, which is why two tabs on one machine -- or two devices
// on the same LAN -- connect fine. Across real, separate networks, at least
// one side is often behind a NAT (mobile carrier NAT and many corporate
// networks especially) that STUN alone can't traverse, and the connection
// needs a relay server.
//
// Free public TURN credentials are notoriously short-lived across the whole
// industry -- the old widely-shared openrelayproject/openrelayproject pair
// (previously used here) has since been deprecated by its provider. What's
// used below instead is Metered's "static auth" scheme, which is still
// current: rather than a fixed username/password, a shared secret is used
// to compute a fresh, time-limited credential on the fly (the same
// mechanism Nextcloud Talk and Matrix/Synapse use it for). No backend
// needed -- just an HMAC computed in the browser via the Web Crypto API.
const TURN_STATIC_AUTH_SECRET = 'openrelayprojectsecret'
const TURN_STATIC_AUTH_HOST = 'staticauth.openrelay.metered.ca'

async function computeTurnCredentials(secret, ttlSeconds = 86400) {
  const username = String(Math.floor(Date.now() / 1000) + ttlSeconds)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username))
  const credential = btoa(String.fromCharCode(...new Uint8Array(sig)))
  return { username, credential }
}

async function buildTurnConfig() {
  try {
    const { username, credential } = await computeTurnCredentials(TURN_STATIC_AUTH_SECRET)
    return [
      { urls: `turn:${TURN_STATIC_AUTH_HOST}:80`, username, credential },
      { urls: `turn:${TURN_STATIC_AUTH_HOST}:443`, username, credential },
      { urls: `turn:${TURN_STATIC_AUTH_HOST}:443?transport=tcp`, username, credential },
    ]
  } catch (e) {
    console.warn('Could not compute TURN credentials (crypto.subtle unavailable?):', e)
    return []
  }
}

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
    this.onJoinError = null
    this.onPlayerCrash = null
  }

  get selfId() {
    return selfId
  }

  async join(roomId, isHost) {
    this.roomId = roomId
    this.isHost = isHost
    const turnConfig = await buildTurnConfig()
    this.room = joinRoom(
      { appId: APP_ID, turnConfig },
      roomId,
      { onJoinError: (details) => this.onJoinError?.(details) }
    )

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
      playerCrash: make('player-crash'),
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
    this._actions.playerCrash.onMessage = (data, ctx) => this.onPlayerCrash?.(data, ctx.peerId)

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

  /** Diagnostic only: logs each known peer's actual WebRTC connection state.
   * If a peer never appears here at all, signaling never found them. If it
   * appears but stays stuck on "checking" or reaches "failed", that's ICE/
   * TURN not completing -- open the console (F12) on both devices to see
   * this while stuck in the lobby. */
  logConnectionStates() {
    if (!this.room) return
    const peers = this.room.getPeers()
    const ids = Object.keys(peers)
    if (ids.length === 0) {
      console.log('[net] no peers known yet (still discovering via signaling, or alone in the room)')
      return
    }
    for (const id of ids) {
      const pc = peers[id]
      console.log(`[net] peer ${id.slice(0, 8)}… connectionState=${pc.connectionState} iceConnectionState=${pc.iceConnectionState} iceGatheringState=${pc.iceGatheringState}`)
    }
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
  sendPlayerCrash(payload) {
    this._actions.playerCrash?.send(payload)
  }
}
