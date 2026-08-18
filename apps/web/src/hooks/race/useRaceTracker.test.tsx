import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef, type MutableRefObject } from 'react'
import type { Race } from '@calistenia/core/types/race'

// El reintento del push sólo se observa por telemetría: no cambia nada en
// pantalla, así que el espía sobre Sentry es la única prueba de que reporta.
vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}))

vi.mock('../../lib/race/raceApi', () => ({
  updateProgress: vi.fn(),
}))

vi.mock('../../lib/race/raceSnapshot', () => ({
  loadRaceSnapshot: vi.fn().mockReturnValue(null),
  saveRaceSnapshot: vi.fn(),
}))

// El tracker real habla con la Geolocation API. Aquí sólo hace falta poder
// empujar unas stats a mano para que el tick del push tenga algo que mandar.
let emitStats: ((stats: RaceTrackerStats) => void) | null = null
vi.mock('../../lib/race/raceTracker', () => ({
  createRaceTracker: vi.fn((opts: { onUpdate: (s: RaceTrackerStats) => void }) => {
    emitStats = opts.onUpdate
    return {
      start: vi.fn(),
      stop: vi.fn(),
      getStats: vi.fn().mockReturnValue(null),
      getGpsTrack: vi.fn().mockReturnValue([]),
      dispose: vi.fn(),
    }
  }),
}))

import * as Sentry from '@sentry/react'
import { updateProgress } from '../../lib/race/raceApi'
import { useRaceTracker } from './useRaceTracker'
import { RaceAuthError } from '../../lib/race/errors'
import type { RaceTracker, RaceTrackerStats } from '../../lib/race/raceTracker'

const PUSH_INTERVAL_MS = 3000
const FIRST_BACKOFF_MS = 1000

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    id: 'race-1', creator: 'user-1', name: 'Test', mode: 'distance',
    // Objetivos altos: estas pruebas no deben disparar "objetivo alcanzado".
    target_distance_km: 999, target_duration_seconds: 999_999, status: 'active',
    starts_at: '2026-08-17T10:00:00Z', ends_at: '2026-08-17T11:00:00Z',
    finished_at: null, route_points: null, is_public: true,
    origin_lat: 40, origin_lng: -3, activity_type: 'running',
    created: '', updated: '', ...overrides,
  }
}

const STATS: RaceTrackerStats = {
  distance_km: 1.2, duration_seconds: 300, avg_pace: 5,
  last_lat: 40.1, last_lng: -3.1,
}

function setup() {
  const onError = vi.fn()
  const trackerRef = createRef<RaceTracker>() as MutableRefObject<RaceTracker | null>
  const latestStatsRef = createRef<RaceTrackerStats>() as MutableRefObject<RaceTrackerStats | null>

  const view = renderHook(() =>
    useRaceTracker({
      raceId: 'race-1',
      active: true,
      meId: 'part-1',
      startsAt: '2026-08-17T10:00:00Z',
      trackerRef,
      latestStatsRef,
      getRace: () => makeRace(),
      hasFinishedSelf: () => false,
      onTargetReached: vi.fn(),
      onStop: vi.fn(),
      onError,
      onGpsFix: vi.fn(),
    }),
  )

  return { view, onError }
}

/** Un fix de GPS: llena `latestStatsRef` para que el tick del push mande algo. */
async function emitFix() {
  await act(async () => { emitStats?.(STATS) })
}

describe('useRaceTracker — reporte del reintento del push', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(Sentry.captureException).mockClear()
    vi.mocked(updateProgress).mockReset()
    emitStats = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reporta a Sentry con los tags de móvil cuando el reintento también falla', async () => {
    const boom = new Error('network down')
    vi.mocked(updateProgress).mockRejectedValue(boom)

    setup()
    await emitFix()

    // Tick del push → falla → programa el reintento con el primer backoff.
    await act(async () => { await vi.advanceTimersByTimeAsync(PUSH_INTERVAL_MS) })
    expect(Sentry.captureException).not.toHaveBeenCalled()

    // Vence el backoff → el reintento falla → esto es lo que la web se tragaba.
    await act(async () => { await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS) })

    expect(Sentry.captureException).toHaveBeenCalledWith(boom, {
      tags: { feature: 'race', op: 'push_progress_retry' },
    })
  })

  it('no reporta nada si el reintento sale bien', async () => {
    vi.mocked(updateProgress)
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValue(undefined)

    setup()
    await emitFix()

    await act(async () => { await vi.advanceTimersByTimeAsync(PUSH_INTERVAL_MS) })
    await act(async () => { await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS) })

    expect(updateProgress).toHaveBeenCalledTimes(2)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('un fallo de auth ni reintenta ni reporta: lo cuenta por onError', async () => {
    vi.mocked(updateProgress).mockRejectedValue(new RaceAuthError('401'))

    const { onError } = setup()
    await emitFix()

    await act(async () => { await vi.advanceTimersByTimeAsync(PUSH_INTERVAL_MS) })
    await act(async () => { await vi.advanceTimersByTimeAsync(FIRST_BACKOFF_MS) })

    expect(onError).toHaveBeenCalledWith('auth', 'race.sessionExpired')
    expect(updateProgress).toHaveBeenCalledTimes(1)
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })
})
