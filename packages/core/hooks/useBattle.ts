/**
 * State hub for one collaborative circuit battle (#356).
 *
 * Shared between platforms because none of it is platform-specific: the snapshot is
 * pushed to us by the realtime signal, and every action is a call to the battle API
 * that returns the next authoritative snapshot.
 *
 * This hook deliberately does not use TanStack Query. A battle is not cached server
 * state we poll — it is a live session whose only valid representation is the newest
 * snapshot, replaced wholesale. Caching it would invite exactly the stale-merge the
 * contract forbids.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BattleApiError,
  cancelBattle,
  createBattleInvite,
  finishBattleParticipant,
  joinBattle,
  leaveBattle,
  newIdempotencyKey,
  publishBattle,
  reportBattleProgress,
  revokeBattleInvites,
  setBattleReady,
  startBattle,
} from '../lib/battleApi'
import { subscribeBattle } from '../lib/battleRealtime'
import { measureOffset, msUntil, serverNow } from '../lib/serverClock'
import { canMutateBattle } from '../lib/battle'
import type {
  BattleInviteIssued,
  BattleProgress,
  BattleSnapshot,
  BattleStanding,
} from '../types/battle'

/** What the UI renders. Derived from the battle status plus the server countdown. */
export type BattlePhase =
  | 'loading'
  | 'not_found'
  | 'forbidden'
  | 'draft'
  | 'lobby'
  | 'countdown'
  | 'live'
  | 'finished'
  | 'expired'
  | 'cancelled'

export type ProgressInput = Pick<
  BattleProgress,
  'completed_rounds' | 'completed_reps' | 'completed_time_seconds' | 'current_exercise_position'
>

export interface UseBattleResult {
  phase: BattlePhase
  snapshot: BattleSnapshot | null
  standings: BattleStanding[]
  isCreator: boolean
  /** Seconds until `starts_at`, corrected for clock offset. 0 outside the countdown. */
  secondsToStart: number
  /** True while a mutation is in flight, so the UI can disable its buttons. */
  busy: boolean
  error: BattleApiError | null
  clearError: () => void
  /** Whether the server would accept each action, mirrored client-side for enablement. */
  can: {
    ready: boolean
    unready: boolean
    start: boolean
    progress: boolean
    finish: boolean
    leave: boolean
    cancel: boolean
    invite: boolean
  }
  actions: {
    refresh: () => void
    publish: () => Promise<void>
    invite: () => Promise<BattleInviteIssued>
    revokeInvites: () => Promise<void>
    setReady: (ready: boolean) => Promise<void>
    start: () => Promise<void>
    reportProgress: (progress: ProgressInput) => Promise<void>
    finish: (progress?: ProgressInput) => Promise<void>
    leave: () => Promise<void>
    cancel: () => Promise<void>
  }
}

function phaseFor(snapshot: BattleSnapshot | null): BattlePhase {
  if (!snapshot) return 'loading'
  switch (snapshot.battle.status) {
    case 'draft': return 'draft'
    case 'lobby':
    case 'ready': return 'lobby'
    case 'live':
      // `live` covers both the countdown and the workout itself; `starts_at` is what
      // separates them, and it is the server's value, not the device's.
      return msUntil(snapshot.battle.starts_at) > 0 ? 'countdown' : 'live'
    case 'finished': return 'finished'
    case 'expired': return 'expired'
    case 'cancelled': return 'cancelled'
    default: return 'loading'
  }
}

export function useBattle(battleId: string, currentUserId: string | null): UseBattleResult {
  const [snapshot, setSnapshot] = useState<BattleSnapshot | null>(null)
  const [phase, setPhase] = useState<BattlePhase>('loading')
  const [error, setError] = useState<BattleApiError | null>(null)
  const [busy, setBusy] = useState(false)
  const [secondsToStart, setSecondsToStart] = useState(0)

  const refreshRef = useRef<(() => void) | null>(null)

  useEffect(() => { void measureOffset() }, [])

  // ── Snapshot + realtime ────────────────────────────────────────────────────
  useEffect(() => {
    if (!battleId) return
    setSnapshot(null)
    setPhase('loading')

    const unsubscribe = subscribeBattle(battleId, {
      onSnapshot: (next) => {
        setSnapshot(next)
        setPhase(phaseFor(next))
        setError(null)
      },
      onError: (err) => {
        const apiError = err instanceof BattleApiError
          ? err
          : new BattleApiError(0, 'realtime_error', err.message)
        if (apiError.status === 404) { setPhase('not_found'); return }
        if (apiError.status === 403) { setPhase('forbidden'); return }
        setError(apiError)
      },
    })
    refreshRef.current = (unsubscribe as unknown as { refresh: () => void }).refresh

    return () => {
      refreshRef.current = null
      unsubscribe()
    }
  }, [battleId])

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const startsAt = snapshot?.battle.starts_at
    if (phase !== 'countdown' || !startsAt) {
      setSecondsToStart(0)
      return
    }
    const tick = () => {
      const remaining = msUntil(startsAt)
      setSecondsToStart(Math.max(0, Math.ceil(remaining / 1000)))
      // The battle status does not change when the countdown lapses — only the
      // derived phase does — so recompute it locally instead of waiting for a write.
      if (remaining <= 0) setPhase('live')
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [phase, snapshot?.battle.starts_at])

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Every mutation returns the authoritative snapshot, so we apply it directly instead
   * of waiting for the realtime round-trip: the actor sees their own action land
   * immediately, and everyone else sees it via the subscription.
   */
  const run = useCallback(async <T,>(fn: () => Promise<T>, applies = true): Promise<T> => {
    setBusy(true)
    try {
      const result = await fn()
      if (applies) {
        const next = result as unknown as BattleSnapshot
        setSnapshot(next)
        setPhase(phaseFor(next))
      }
      setError(null)
      return result
    } catch (err) {
      const apiError = err instanceof BattleApiError
        ? err
        : new BattleApiError(0, 'unknown', (err as Error).message)
      setError(apiError)
      // A refusal usually means our view of the battle is behind. Re-sync rather than
      // leaving the UI offering an action the server just rejected.
      if (apiError.isStale) refreshRef.current?.()
      throw apiError
    } finally {
      setBusy(false)
    }
  }, [])

  const refresh = useCallback(() => { refreshRef.current?.() }, [])

  const publish = useCallback(async () => {
    await run(() => publishBattle(battleId, newIdempotencyKey()))
  }, [battleId, run])

  const invite = useCallback(async () => {
    // The raw token in the result must go straight into the share link. Never log it,
    // never send it to analytics, never persist it.
    return run(() => createBattleInvite(battleId), false)
  }, [battleId, run])

  const revokeInvitesAction = useCallback(async () => {
    await run(() => revokeBattleInvites(battleId), false)
    refreshRef.current?.()
  }, [battleId, run])

  const setReady = useCallback(async (ready: boolean) => {
    await run(() => setBattleReady(battleId, ready, newIdempotencyKey()))
  }, [battleId, run])

  const start = useCallback(async () => {
    await run(() => startBattle(battleId, newIdempotencyKey()))
  }, [battleId, run])

  const reportProgress = useCallback(async (progress: ProgressInput) => {
    await run(() => reportBattleProgress(battleId, progress))
  }, [battleId, run])

  const finish = useCallback(async (progress?: ProgressInput) => {
    await run(() => finishBattleParticipant(battleId, progress, newIdempotencyKey()))
  }, [battleId, run])

  const leave = useCallback(async () => {
    await run(() => leaveBattle(battleId, newIdempotencyKey()))
  }, [battleId, run])

  const cancel = useCallback(async () => {
    await run(() => cancelBattle(battleId, newIdempotencyKey()))
  }, [battleId, run])

  // ── Derived ────────────────────────────────────────────────────────────────

  const isCreator = !!(snapshot && currentUserId && snapshot.battle.creator === currentUserId)

  const can = useMemo(() => {
    const none = {
      ready: false, unready: false, start: false, progress: false,
      finish: false, leave: false, cancel: false, invite: false,
    }
    if (!snapshot || !currentUserId) return none

    const battle = snapshot.battle
    const me = snapshot.me
    // `canMutateBattle` is the shared client-side mirror of the server contract. It is
    // explicitly non-authoritative: it exists so the UI never offers an impossible
    // write, not to decide anything.
    const mine = me ? { user: me.user, status: me.status } : null
    const readyCount = snapshot.participants.filter(p => p.status === 'ready').length

    return {
      ready: me?.status === 'joined' && canMutateBattle(currentUserId, battle, mine, { kind: 'mark_ready' }),
      unready: me?.status === 'ready' && (battle.status === 'lobby' || battle.status === 'ready'),
      start: battle.creator === currentUserId && battle.status === 'ready' && readyCount >= 2,
      // `phase`, not `msUntil(starts_at)`: the countdown lapsing changes nothing on the
      // server, so a memo keyed only on the snapshot kept the controls disabled after the
      // countdown ended and only unstuck itself when some unrelated snapshot arrived. With
      // no other participant still moving, none ever did and the battle was unplayable.
      progress: canMutateBattle(currentUserId, battle, mine, { kind: 'update_progress' }) &&
        phase === 'live',
      finish: me?.status === 'active' && phase === 'live',
      leave: canMutateBattle(currentUserId, battle, mine, { kind: 'leave' }),
      cancel: battle.creator === currentUserId &&
        ['draft', 'lobby', 'ready', 'live'].includes(battle.status),
      invite: battle.creator === currentUserId && battle.status === 'lobby',
    }
  }, [snapshot, currentUserId, phase])

  const clearError = useCallback(() => setError(null), [])

  return {
    phase,
    snapshot,
    standings: snapshot?.standings ?? [],
    isCreator,
    secondsToStart,
    busy,
    error,
    clearError,
    can,
    actions: {
      refresh,
      publish,
      invite,
      revokeInvites: revokeInvitesAction,
      setReady,
      start,
      reportProgress,
      finish,
      leave,
      cancel,
    },
  }
}

/** Milliseconds of workout elapsed, corrected for clock offset. 0 before the start. */
export function battleElapsedMs(startsAt: string | null): number {
  if (!startsAt) return 0
  const elapsed = serverNow() - new Date(startsAt).getTime()
  return elapsed > 0 ? elapsed : 0
}

export { joinBattle }
