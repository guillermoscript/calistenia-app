import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef, type MutableRefObject } from 'react'
import type { Race, RaceParticipant } from '@calistenia/core/types/race'

// La capa de API se mockea entera: aquí sólo se prueba QUIÉN llama a qué y
// cuántas veces, que es justo lo que el #479 arregla.
vi.mock('../../lib/race/raceApi', () => ({
  finishParticipant: vi.fn().mockResolvedValue(undefined),
  finishRace: vi.fn().mockResolvedValue(undefined),
  markDnf: vi.fn().mockResolvedValue(undefined),
}))

import { finishParticipant, finishRace, markDnf } from '../../lib/race/raceApi'
import { useRaceFinish } from './useRaceFinish'
import type { RaceTracker, RaceTrackerStats } from '../../lib/race/raceTracker'

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    id: 'race-1', creator: 'user-1', name: 'Test', mode: 'distance',
    target_distance_km: 5, target_duration_seconds: 1800, status: 'active',
    starts_at: '2026-08-17T10:00:00Z', ends_at: '2026-08-17T11:00:00Z',
    finished_at: null, route_points: null, is_public: true,
    origin_lat: 40, origin_lng: -3, activity_type: 'running',
    created: '', updated: '', ...overrides,
  }
}

function makeMe(overrides: Partial<RaceParticipant> = {}): RaceParticipant {
  return {
    id: 'part-1', race: 'race-1', user: 'user-1', display_name: 'Yo',
    status: 'racing', distance_km: 2, duration_seconds: 600, avg_pace: 5,
    last_lat: 40, last_lng: -3, last_update: null, finished_at: null, ...overrides,
  }
}

function makeStats(overrides: Partial<RaceTrackerStats> = {}): RaceTrackerStats {
  return {
    distance_km: 5.2, duration_seconds: 1500, avg_pace: 4.8,
    last_lat: 40.1, last_lng: -3.1, ...overrides,
  }
}

function makeTracker(): RaceTracker {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getGpsTrack: vi.fn().mockReturnValue([{ lat: 40, lng: -3, t: 1 }]),
    dispose: vi.fn(),
  } as unknown as RaceTracker
}

interface SetupOptions {
  race?: Race | null
  me?: RaceParticipant | null
  stats?: RaceTrackerStats | null
  tracker?: RaceTracker | null
}

function setup({ race = makeRace(), me = makeMe(), stats = makeStats(), tracker = makeTracker() }: SetupOptions = {}) {
  const trackerRef = createRef() as MutableRefObject<RaceTracker | null>
  trackerRef.current = tracker
  const latestStatsRef = createRef() as MutableRefObject<RaceTrackerStats | null>
  latestStatsRef.current = stats
  const onError = vi.fn()

  const { result } = renderHook(() => useRaceFinish({
    raceId: 'race-1',
    getRace: () => race,
    getMe: () => me,
    trackerRef,
    latestStatsRef,
    onError,
  }))

  return { result, onError, tracker }
}

beforeEach(() => {
  vi.mocked(finishParticipant).mockReset().mockResolvedValue(undefined as never)
  vi.mocked(finishRace).mockReset().mockResolvedValue(undefined as never)
  vi.mocked(markDnf).mockReset().mockResolvedValue(undefined as never)
})

// ── endRace: el punto que antes se llamaba desde tres sitios ────────────────

describe('endRace', () => {
  it('varios disparadores concurrentes producen UNA sola petición', async () => {
    const { result } = setup()

    // Auto-finish (todos terminaron), watchdog de ends_at y fin manual, a la vez.
    await act(async () => {
      await Promise.all([
        result.current.endRace(),
        result.current.endRace(),
        result.current.endRace(),
      ])
    })

    expect(finishRace).toHaveBeenCalledTimes(1)
    expect(finishRace).toHaveBeenCalledWith('race-1')
  })

  it('llamadas posteriores tampoco repiten la petición', async () => {
    const { result } = setup()

    await act(async () => { await result.current.endRace() })
    await act(async () => { await result.current.endRace() })

    expect(finishRace).toHaveBeenCalledTimes(1)
  })

  it('si la petición falla se libera el guard y el watchdog puede reintentar', async () => {
    // El riesgo de colapsar tres disparadores en uno es dejar la carrera
    // abierta para siempre si el primer intento se pierde por red.
    vi.mocked(finishRace)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(undefined as never)
    const { result } = setup()

    let firstError: Error | null = null
    await act(async () => { firstError = await result.current.endRace() })
    expect(firstError).toBeInstanceOf(Error)

    let secondError: Error | null = new Error('placeholder')
    await act(async () => { secondError = await result.current.endRace() })

    expect(finishRace).toHaveBeenCalledTimes(2)
    expect(secondError).toBeNull()
  })
})

// ── finishSelf: los tres caminos que antes duplicaban el payload ───────────

describe('finishSelf', () => {
  it('manual con el objetivo alcanzado congela al participante con la traza', async () => {
    const { result, tracker } = setup({ stats: makeStats({ distance_km: 5.2 }) })

    await act(async () => { await result.current.finishSelf('manual') })

    expect(markDnf).not.toHaveBeenCalled()
    expect(finishParticipant).toHaveBeenCalledWith('part-1', expect.objectContaining({
      distance_km: 5.2,
      duration_seconds: 1500,
      gps_track: [{ lat: 40, lng: -3, t: 1 }],
    }))
    // El manual deja el tracker vivo: lo libera el cleanup de la fase.
    expect(tracker.stop).not.toHaveBeenCalled()
  })

  it('manual sin llegar al objetivo marca DNF', async () => {
    const { result } = setup({
      race: makeRace({ mode: 'distance', target_distance_km: 5 }),
      stats: makeStats({ distance_km: 1.2 }),
    })

    await act(async () => { await result.current.finishSelf('manual') })

    expect(markDnf).toHaveBeenCalledWith('part-1')
    expect(finishParticipant).not.toHaveBeenCalled()
  })

  it('es idempotente: el segundo disparo no manda nada', async () => {
    const { result } = setup()

    await act(async () => { await result.current.finishSelf('target_reached') })
    await act(async () => { await result.current.finishSelf('manual') })

    expect(finishParticipant).toHaveBeenCalledTimes(1)
    expect(markDnf).not.toHaveBeenCalled()
  })

  it('target_reached para el tracker en el acto', async () => {
    const { result, tracker } = setup()

    await act(async () => { await result.current.finishSelf('target_reached') })

    expect(tracker.stop).toHaveBeenCalledTimes(1)
  })

  it('el deadline de tiempo cierra sin stats ni tracker, con la duración objetivo', async () => {
    // Caso real: correr en interior o con el permiso de GPS denegado. El reloj
    // llega al objetivo y el tracker nunca emitió nada.
    const { result } = setup({
      race: makeRace({ mode: 'time', target_duration_seconds: 1800 }),
      me: makeMe({ distance_km: 3.5, avg_pace: 6, last_lat: 41, last_lng: -4 }),
      stats: null,
      tracker: null,
    })

    await act(async () => { await result.current.finishSelf('time_deadline') })

    expect(finishParticipant).toHaveBeenCalledWith('part-1', {
      distance_km: 3.5,
      duration_seconds: 1800,
      avg_pace: 6,
      last_lat: 41,
      last_lng: -4,
      gps_track: [],
    })
  })

  it('target_reached sin tracker no manda nada y no bloquea un cierre posterior', async () => {
    const { result } = setup({ tracker: null })

    await act(async () => { await result.current.finishSelf('target_reached') })
    expect(finishParticipant).not.toHaveBeenCalled()

    // El guard no se consumió: el fin manual todavía puede congelar.
    await act(async () => { await result.current.finishSelf('manual') })
    expect(finishParticipant).not.toHaveBeenCalled()
    expect(markDnf).not.toHaveBeenCalled()
  })

  it('sin participante no hace nada', async () => {
    const { result } = setup({ me: null })

    await act(async () => { await result.current.finishSelf('manual') })

    expect(finishParticipant).not.toHaveBeenCalled()
    expect(markDnf).not.toHaveBeenCalled()
  })

  it('propaga el fallo al banner de error', async () => {
    vi.mocked(finishParticipant).mockRejectedValueOnce(new Error('sin conexión'))
    const { result, onError } = setup()

    await act(async () => { await result.current.finishSelf('manual') })

    expect(onError).toHaveBeenCalledWith('push', 'sin conexión')
  })

  it('reset permite volver a terminar en una carrera nueva', async () => {
    const { result } = setup()

    await act(async () => { await result.current.finishSelf('target_reached') })
    expect(result.current.hasFinishedSelf()).toBe(true)

    act(() => result.current.reset())
    expect(result.current.hasFinishedSelf()).toBe(false)

    await act(async () => { await result.current.finishSelf('target_reached') })
    expect(finishParticipant).toHaveBeenCalledTimes(2)
  })
})
