/**
 * Realtime transport for battles (#356).
 *
 * Deliberately different from `raceRealtime`, which merges individual record events
 * into a local array. The battle contract forbids that: a client must never merge a
 * realtime event into stale local state, because progress is server-clamped and the
 * `revision` counter is what detects gaps.
 *
 * So realtime is used purely as a *signal*. Any event on the battle or its participants
 * schedules a coalesced snapshot fetch, and the snapshot **replaces** local state
 * wholesale. That makes reconnects, missed events, out-of-order deliveries and revision
 * gaps all the same case, handled by one code path.
 */
import { pb } from './pocketbase'
import { getBattleSnapshot } from './battleApi'
import type { BattleSnapshot } from '../types/battle'

export interface BattleRealtimeHandlers {
  /** Called with each accepted snapshot. Replace local state with it; do not merge. */
  onSnapshot: (snapshot: BattleSnapshot) => void
  onError?: (error: Error) => void
}

/**
 * Minimum gap between snapshot fetches. With several participants writing progress
 * every few seconds, un-coalesced fetches would multiply; a short trailing window
 * collapses a burst of events into one refresh without making the UI feel laggy.
 */
const COALESCE_MS = 350

export function subscribeBattle(
  battleId: string,
  handlers: BattleRealtimeHandlers,
): () => void {
  let cancelled = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let pending = false
  // Responses can land out of order; anything not newer than what we already applied
  // is dropped rather than rendered.
  let appliedRevision = -1
  const unsubs: Array<() => void> = []

  const applySnapshot = (snapshot: BattleSnapshot) => {
    if (cancelled) return
    if (snapshot.battle.revision < appliedRevision) return
    appliedRevision = snapshot.battle.revision
    handlers.onSnapshot(snapshot)
  }

  const fetchNow = () => {
    if (cancelled) return
    if (inFlight) { pending = true; return }
    inFlight = true
    getBattleSnapshot(battleId)
      .then(applySnapshot)
      .catch(err => { if (!cancelled) handlers.onError?.(err as Error) })
      .finally(() => {
        inFlight = false
        if (pending && !cancelled) { pending = false; schedule() }
      })
  }

  const schedule = () => {
    if (cancelled || timer) return
    timer = setTimeout(() => { timer = null; fetchNow() }, COALESCE_MS)
  }

  /** Refresh immediately — for mount, app resume, and reconnect. */
  const refreshNow = () => {
    if (timer) { clearTimeout(timer); timer = null }
    fetchNow()
  }

  refreshNow()

  pb.collection('battles').subscribe(battleId, () => {
    if (!cancelled) schedule()
  }).then(fn => {
    if (cancelled) { fn(); return }
    unsubs.push(fn)
  }).catch(err => { if (!cancelled) handlers.onError?.(err as Error) })

  // PocketBase has no server-side filter on wildcard subscriptions, so filter here.
  // The payload is ignored either way — it is only a signal to re-fetch.
  pb.collection('battle_participants').subscribe('*', (e) => {
    if (cancelled) return
    if ((e.record as unknown as { battle?: string })?.battle !== battleId) return
    schedule()
  }).then(fn => {
    if (cancelled) { fn(); return }
    unsubs.push(fn)
  }).catch(err => { if (!cancelled) handlers.onError?.(err as Error) })

  const unsubscribe = () => {
    cancelled = true
    if (timer) { clearTimeout(timer); timer = null }
    unsubs.forEach(fn => { try { fn() } catch { /* already gone */ } })
    unsubs.length = 0
  }

  // The caller can force a refresh (app resume, network back) without re-subscribing.
  ;(unsubscribe as unknown as { refresh: () => void }).refresh = refreshNow
  return unsubscribe
}

export type BattleSubscription = ReturnType<typeof subscribeBattle> & { refresh: () => void }
