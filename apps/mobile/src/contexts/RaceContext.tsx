/**
 * Port del RaceContext web a React Native.
 * Cambios: wake lock → expo-keep-awake, visibilitychange → (innecesario con
 * keep-awake), useAuthState → useAuthUser. El resto (realtime, countdown,
 * push cada 3s con backoff, auto-finish, watchdog) es idéntico a la web.
 */
import {
  createContext, useContext, useEffect, useRef, useState, useMemo, useCallback,
  type ReactNode,
} from 'react'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { op } from '@calistenia/core/lib/analytics'
import type { Race, RaceParticipant } from '@calistenia/core/types/race'

import { useAuthUser } from '@/lib/use-auth-user'
import {
  loadRace,
  joinRace as apiJoinRace,
  markReady as apiMarkReady,
  startCountdown as apiStartCountdown,
  activateRace,
  updateProgress,
  finishParticipant,
  finishRace as apiFinishRace,
  cancelRace as apiCancelRace,
  markDnf,
  leaveRace,
  type ProgressUpdate,
} from '@/lib/race/raceApi'
import { subscribeRace } from '@/lib/race/raceRealtime'
import { measureOffset, serverNow, msUntil } from '@/lib/race/raceClock'
import { createRaceTracker, type RaceTracker, type RaceTrackerStats } from '@/lib/race/raceTracker'
import { saveRaceSnapshot, loadRaceSnapshot, clearRaceSnapshot } from '@/lib/race/raceSnapshot'
import { RaceAuthError, RaceNotFoundError } from '@/lib/race/errors'

// ── Types ───────────────────────────────────────────────────────────────────

export type RacePhase =
  | 'loading'
  | 'not_found'
  | 'lobby'
  | 'countdown'
  | 'racing'
  | 'finished'
  | 'cancelled'

export type RaceErrorKind = 'auth' | 'push' | 'gps' | 'realtime' | 'load'

export interface RaceErrorState {
  kind: RaceErrorKind
  message: string
}

interface RaceContextValue {
  phase: RacePhase
  race: Race | null
  participants: RaceParticipant[]
  me: RaceParticipant | null
  isCreator: boolean
  hasJoined: boolean
  myStats: RaceTrackerStats | null
  lastError: RaceErrorState | null
  clearError: () => void
  actions: {
    join: (displayName: string) => Promise<void>
    markReady: () => Promise<void>
    startCountdown: () => Promise<void>
    cancelRace: () => Promise<void>
    finishRace: () => Promise<void>
    leave: () => Promise<void>
  }
}

const RaceContext = createContext<RaceContextValue | null>(null)

const PUSH_INTERVAL_MS = 3000
const PUSH_RETRY_BACKOFF_MS = [1000, 3000, 9000]
const KEEP_AWAKE_TAG = 'race'

function computePhase(race: Race | null): RacePhase {
  if (!race) return 'loading'
  switch (race.status) {
    case 'waiting':   return 'lobby'
    case 'countdown': return 'countdown'
    case 'active':    return 'racing'
    case 'finished':  return 'finished'
    case 'cancelled': return 'cancelled'
    default:          return 'loading'
  }
}

interface RaceProviderProps {
  raceId: string
  children: ReactNode
}

export function RaceProvider({ raceId, children }: RaceProviderProps) {
  const user = useAuthUser()
  const userId = user?.id ?? null

  const [race, setRace] = useState<Race | null>(null)
  const [participants, setParticipants] = useState<RaceParticipant[]>([])
  const [phase, setPhase] = useState<RacePhase>('loading')
  const [myStats, setMyStats] = useState<RaceTrackerStats | null>(null)
  const [lastError, setLastError] = useState<RaceErrorState | null>(null)

  const trackerRef = useRef<RaceTracker | null>(null)
  const pushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoFinishedRef = useRef(false)
  const retryCountRef = useRef(0)
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const raceRef = useRef<Race | null>(null)
  const latestStatsRef = useRef<RaceTrackerStats | null>(null)

  useEffect(() => { raceRef.current = race }, [race])
  useEffect(() => { latestStatsRef.current = myStats }, [myStats])

  useEffect(() => {
    if (phase === 'finished' || phase === 'cancelled') clearRaceSnapshot()
  }, [phase])

  // Auto-finish cuando todos terminaron o DNF (cualquier cliente, idempotente)
  useEffect(() => {
    if (phase !== 'racing') return
    if (participants.length === 0) return
    const allDone = participants.every(p => p.status === 'finished' || p.status === 'dnf')
    if (!allDone) return
    apiFinishRace(raceId).catch(() => { /* ya cerrada */ })
  }, [phase, participants, raceId])

  // Watchdog: cierra races pasadas de ends_at
  useEffect(() => {
    if (phase !== 'racing' || !race?.ends_at) return
    const check = () => {
      if (msUntil(race.ends_at) <= 0) {
        apiFinishRace(raceId).catch(() => { /* ignore */ })
      }
    }
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [phase, race?.ends_at, raceId])

  const me = useMemo<RaceParticipant | null>(
    () => participants.find(p => p.user === userId) ?? null,
    [participants, userId],
  )
  const isCreator = !!(race && userId && race.creator === userId)
  const hasJoined = !!me

  // Deadline duro en modo tiempo (clock-only, 500ms)
  useEffect(() => {
    if (phase !== 'racing' || !me || !race) return
    if (race.mode !== 'time' || race.target_duration_seconds <= 0) return
    if (!race.starts_at) return
    const startAtMs = new Date(race.starts_at).getTime()
    const targetMs = race.target_duration_seconds * 1000

    const check = () => {
      if (autoFinishedRef.current) return
      const elapsed = serverNow() - startAtMs
      if (elapsed < targetMs) return
      autoFinishedRef.current = true
      const trk = trackerRef.current
      const stats = latestStatsRef.current
      const finalStats = stats ?? {
        distance_km: me.distance_km ?? 0,
        duration_seconds: race.target_duration_seconds,
        avg_pace: me.avg_pace ?? 0,
        last_lat: me.last_lat ?? 0,
        last_lng: me.last_lng ?? 0,
      }
      finishParticipant(me.id, {
        distance_km: finalStats.distance_km,
        duration_seconds: race.target_duration_seconds,
        avg_pace: finalStats.avg_pace,
        last_lat: finalStats.last_lat,
        last_lng: finalStats.last_lng,
        gps_track: trk ? trk.getGpsTrack() : [],
      }).catch(err => {
        setLastError({ kind: 'push', message: (err as Error).message })
      })
      trk?.stop()
    }
    check()
    const id = setInterval(check, 500)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, me?.id, race?.starts_at, race?.mode, race?.target_duration_seconds, raceId])

  useEffect(() => {
    measureOffset().catch(() => {})
  }, [])

  // Carga + realtime
  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    loadRace(raceId)
      .then(data => {
        if (cancelled) return
        setRace(data.race)
        setParticipants(data.participants)
        setPhase(computePhase(data.race))
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof RaceNotFoundError) {
          setPhase('not_found')
        } else {
          setLastError({ kind: 'load', message: err?.message || 'Load error' })
        }
      })

    const unsub = subscribeRace(raceId, {
      onRace: updated => {
        if (cancelled) return
        setRace(updated)
        setPhase(computePhase(updated))
      },
      onParticipants: next => {
        if (cancelled) return
        setParticipants(next)
      },
      onError: err => {
        if (cancelled) return
        setLastError({ kind: 'realtime', message: err.message })
      },
    })

    return () => {
      cancelled = true
      unsub()
    }
  }, [raceId])

  // Countdown → activar race (cualquier cliente; first-wins vía PB rule)
  useEffect(() => {
    if (phase !== 'countdown' || !race || !race.starts_at) return
    const delay = Math.max(0, msUntil(race.starts_at))
    countdownTimerRef.current = setTimeout(() => {
      activateRace(raceId).catch(() => { /* ya activa */ })
    }, delay)
    return () => {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [phase, race, raceId])

  // Ciclo de vida del tracker
  useEffect(() => {
    if (phase !== 'racing' || !me) return
    if (!race || !race.starts_at) return

    const snap = loadRaceSnapshot(raceId)
    const rehydrate = snap && snap.participantId === me.id ? snap : null

    const tracker = createRaceTracker({
      startAtMs: new Date(race.starts_at).getTime(),
      initialDistanceKm: rehydrate?.distanceKm,
      initialGpsTrack: rehydrate?.gpsTrack,
      onUpdate: (stats) => {
        setMyStats(stats)
        setLastError(prev => (prev?.kind === 'gps' ? null : prev))
        const r = raceRef.current
        if (!r || autoFinishedRef.current) return
        let shouldFinish = false
        if (r.mode === 'distance' && r.target_distance_km > 0) {
          if (stats.distance_km >= r.target_distance_km) shouldFinish = true
        } else if (r.mode === 'time' && r.target_duration_seconds > 0) {
          if (stats.duration_seconds >= r.target_duration_seconds) shouldFinish = true
        }
        if (shouldFinish) {
          autoFinishedRef.current = true
          const trk = trackerRef.current
          if (trk) {
            finishParticipant(me.id, {
              distance_km: stats.distance_km,
              duration_seconds: stats.duration_seconds,
              avg_pace: stats.avg_pace,
              last_lat: stats.last_lat,
              last_lng: stats.last_lng,
              gps_track: trk.getGpsTrack(),
            }).catch(err => {
              setLastError({ kind: 'push', message: err?.message || 'Finish failed' })
            })
            trk.stop()
          }
        }
      },
      onError: (err) => {
        setLastError({ kind: 'gps', message: err.message })
      },
    })
    trackerRef.current = tracker
    tracker.start()

    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})

    pushTimerRef.current = setInterval(async () => {
      const stats = latestStatsRef.current
      if (!stats || autoFinishedRef.current) return
      saveRaceSnapshot({
        raceId,
        participantId: me.id,
        startAtMs: new Date(race.starts_at).getTime(),
        distanceKm: stats.distance_km,
        gpsTrack: tracker.getGpsTrack(),
      })
      const payload: ProgressUpdate = {
        distance_km: stats.distance_km,
        duration_seconds: stats.duration_seconds,
        avg_pace: stats.avg_pace,
        last_lat: stats.last_lat,
        last_lng: stats.last_lng,
      }
      try {
        await updateProgress(me.id, payload)
        retryCountRef.current = 0
      } catch (err) {
        if (err instanceof RaceAuthError) {
          setLastError({ kind: 'auth', message: 'race.sessionExpired' })
          return
        }
        const count = retryCountRef.current + 1
        retryCountRef.current = count
        const backoff = PUSH_RETRY_BACKOFF_MS[Math.min(count - 1, PUSH_RETRY_BACKOFF_MS.length - 1)]
        setTimeout(() => {
          updateProgress(me.id, payload).catch(() => {})
        }, backoff)
        if (count >= 3) {
          setLastError({ kind: 'push', message: (err as Error)?.message || 'Push failed repeatedly' })
        }
      }
    }, PUSH_INTERVAL_MS)

    return () => {
      tracker.stop()
      tracker.dispose()
      trackerRef.current = null
      if (pushTimerRef.current) clearInterval(pushTimerRef.current)
      pushTimerRef.current = null
      autoFinishedRef.current = false
      setMyStats(null)
      deactivateKeepAwake(KEEP_AWAKE_TAG)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, me?.id, raceId, race?.starts_at, race?.mode, race?.target_distance_km, race?.target_duration_seconds])

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      trackerRef.current?.dispose()
      trackerRef.current = null
      if (pushTimerRef.current) clearInterval(pushTimerRef.current)
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current)
      deactivateKeepAwake(KEEP_AWAKE_TAG)
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  const join = useCallback(async (displayName: string) => {
    try {
      await apiJoinRace(raceId, displayName)
      op.track('race_joined', { race_id: raceId, platform: 'mobile' })
    } catch (err) {
      setLastError({ kind: 'push', message: (err as Error).message })
      throw err
    }
  }, [raceId])

  const markReadyAction = useCallback(async () => {
    if (!me) return
    try {
      await apiMarkReady(me.id)
    } catch (err) {
      setLastError({ kind: 'push', message: (err as Error).message })
    }
  }, [me])

  const startCountdownAction = useCallback(async () => {
    try {
      await apiStartCountdown(raceId)
      op.track('race_started', {
        race_id: raceId,
        participants: participants.length,
        mode: race?.mode,
        platform: 'mobile',
      })
    } catch (err) {
      setLastError({ kind: 'push', message: (err as Error).message })
      throw err
    }
  }, [raceId, participants.length, race?.mode])

  const cancelRaceAction = useCallback(async () => {
    try {
      await apiCancelRace(raceId)
      clearRaceSnapshot()
      op.track('race_cancelled', { race_id: raceId, platform: 'mobile' })
    } catch (err) {
      setLastError({ kind: 'push', message: (err as Error).message })
    }
  }, [raceId])

  const finishRaceAction = useCallback(async () => {
    const stats = latestStatsRef.current
    const trk = trackerRef.current
    if (me && stats && trk && !autoFinishedRef.current) {
      autoFinishedRef.current = true
      try {
        const r = raceRef.current
        const reachedTarget = r
          ? (r.mode === 'distance'
              ? stats.distance_km >= r.target_distance_km
              : stats.duration_seconds >= r.target_duration_seconds)
          : true
        if (reachedTarget) {
          await finishParticipant(me.id, {
            distance_km: stats.distance_km,
            duration_seconds: stats.duration_seconds,
            avg_pace: stats.avg_pace,
            last_lat: stats.last_lat,
            last_lng: stats.last_lng,
            gps_track: trk.getGpsTrack(),
          })
        } else {
          await markDnf(me.id)
        }
      } catch (err) {
        setLastError({ kind: 'push', message: (err as Error).message })
      }
    }
    try {
      await apiFinishRace(raceId)
      clearRaceSnapshot()
      const s = latestStatsRef.current
      op.track('race_finished', {
        race_id: raceId,
        my_distance_km: s?.distance_km ?? 0,
        my_duration_seconds: Math.floor(s?.duration_seconds ?? 0),
        platform: 'mobile',
      })
    } catch (err) {
      setLastError({ kind: 'push', message: (err as Error).message })
    }
  }, [raceId, me])

  const leaveAction = useCallback(async () => {
    if (!me) return
    try {
      // DNF voluntario si ya corre; borrar fila si sigue en lobby
      if (me.status === 'joined' || me.status === 'ready') {
        await leaveRace(me.id)
      } else {
        await markDnf(me.id)
      }
    } catch (err) {
      setLastError({ kind: 'push', message: (err as Error).message })
    }
  }, [me])

  const clearError = useCallback(() => setLastError(null), [])

  const value: RaceContextValue = {
    phase, race, participants, me, isCreator, hasJoined, myStats, lastError, clearError,
    actions: {
      join,
      markReady: markReadyAction,
      startCountdown: startCountdownAction,
      cancelRace: cancelRaceAction,
      finishRace: finishRaceAction,
      leave: leaveAction,
    },
  }

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>
}

export function useRaceContext(): RaceContextValue {
  const ctx = useContext(RaceContext)
  if (!ctx) throw new Error('useRaceContext must be used within RaceProvider')
  return ctx
}

/** Countdown sincronizado con el servidor: segundos hasta el inicio. */
export function useRaceCountdown(): { secondsLeft: number; isCounting: boolean } {
  const { race, phase } = useRaceContext()
  const [secondsLeft, setSecondsLeft] = useState(0)

  useEffect(() => {
    if (phase !== 'countdown' || !race?.starts_at) {
      setSecondsLeft(0)
      return
    }
    const tick = () => {
      const ms = msUntil(race.starts_at)
      setSecondsLeft(Math.max(0, Math.ceil(ms / 1000)))
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [phase, race?.starts_at])

  return { secondsLeft, isCounting: phase === 'countdown' }
}
