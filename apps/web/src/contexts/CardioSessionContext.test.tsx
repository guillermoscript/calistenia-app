import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { estimateCalories } from '@calistenia/core/lib/calories'
import type { CardioActivityType } from '@calistenia/core/types'

// i18n real inicializa recursos bundleados de forma síncrona, pero se mockea
// para no depender de esa carga en un test unitario — solo se usa `t()` una
// vez en el fuente (mensaje de "geolocalización no disponible").
vi.mock('../lib/i18n', () => ({
  default: { t: (key: string) => key },
}))

// pb.collection()/pb.filter() se mockean enteros: este context habla con
// PocketBase solo para crear/borrar/actualizar sesiones cardio e historial.
vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: {
    collection: vi.fn(),
    filter: vi.fn((raw: string) => raw),
  },
}))

import { pb } from '@calistenia/core/lib/pocketbase'
import { CardioSessionProvider, useCardioSessionContext } from './CardioSessionContext'

// ── Helpers de geolocalización ──────────────────────────────────────────────

type CapturedWatch = { success: (pos: unknown) => void; error?: (err: unknown) => void }

let watchCallbacks: CapturedWatch[]
let watchPositionMock: ReturnType<typeof vi.fn>
let clearWatchMock: ReturnType<typeof vi.fn>

function makePosition(
  lat: number,
  lng: number,
  timestamp: number,
  opts: { accuracy?: number; speed?: number | null; altitude?: number | null } = {},
) {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy: opts.accuracy ?? 5,
      altitude: opts.altitude ?? null,
      speed: opts.speed ?? null,
    },
    timestamp,
  }
}

function lastWatchCallback(): CapturedWatch {
  return watchCallbacks[watchCallbacks.length - 1]
}

// ── Wrapper ──────────────────────────────────────────────────────────────────

function makeWrapper(userId: string | null = 'user1', userWeight?: number) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CardioSessionProvider userId={userId} userWeight={userWeight}>
        {children}
      </CardioSessionProvider>
    </QueryClientProvider>
  )
  return { wrapper, queryClient, invalidateSpy }
}

function makePbCollection(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
    delete: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    getList: vi.fn().mockResolvedValue({ items: [] }),
    ...overrides,
  }
}

const STORAGE_KEY = 'calistenia_cardio_active'
const UNSAVED_KEY = 'calistenia_cardio_unsaved'

beforeEach(() => {
  watchCallbacks = []
  watchPositionMock = vi.fn((success: (pos: unknown) => void, error?: (err: unknown) => void) => {
    watchCallbacks.push({ success, error })
    return watchCallbacks.length
  })
  clearWatchMock = vi.fn()

  Object.defineProperty(navigator, 'geolocation', {
    value: {
      watchPosition: watchPositionMock,
      clearWatch: clearWatchMock,
      getCurrentPosition: vi.fn(),
    },
    writable: true,
    configurable: true,
  })
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }) },
    writable: true,
    configurable: true,
  })

  vi.mocked(pb.collection).mockReset()
  vi.mocked(pb.collection).mockReturnValue(makePbCollection() as never)
  vi.mocked(pb.filter).mockClear()
})

describe('CardioSessionContext', () => {
  it('useCardioSessionContext lanza si no hay provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useCardioSessionContext())).toThrow(
      'useCardioSessionContext must be used within CardioSessionProvider',
    )
    spy.mockRestore()
  })

  it('estado inicial: idle, sin distancia/duración/puntos', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
    expect(result.current.state).toBe('idle')
    expect(result.current.distance).toBe(0)
    expect(result.current.duration).toBe(0)
    expect(result.current.pointsCount).toBe(0)
    expect(result.current.error).toBeNull()
  })

  describe('start', () => {
    it('activa la sesión, fija el tipo de actividad y arranca GPS', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      act(() => result.current.start('running'))

      expect(result.current.state).toBe('tracking')
      expect(result.current.activityType).toBe('running')
      expect(watchPositionMock).toHaveBeenCalledTimes(1)
      expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen')
    })

    it('guarda programId/programDayKey cuando se pasan', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      act(() => result.current.start('cycling', 'prog-1', 'day-3'))

      expect(result.current.activityType).toBe('cycling')
      expect(result.current.programId).toBe('prog-1')
      expect(result.current.programDayKey).toBe('day-3')
    })
  })

  describe('procesamiento de fixes GPS', () => {
    it('el primer fix agrega el punto pero no suma distancia (no hay punto previo)', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 1_000)))

      expect(result.current.pointsCount).toBe(1)
      expect(result.current.distance).toBe(0)
    })

    it('fixes subsecuentes válidos suman distancia y cuentan puntos', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      // ~111m entre cada fix (0.001° lat), 10s de separación → ~11 m/s, por
      // debajo del límite de 14 m/s y sin ser "gap" (<30s).
      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))
      act(() => lastWatchCallback().success(makePosition(40.001, -3.0, 10_000)))
      const afterSecond = result.current.distance
      act(() => lastWatchCallback().success(makePosition(40.002, -3.0, 20_000)))

      expect(result.current.pointsCount).toBe(3)
      expect(afterSecond).toBeGreaterThan(0)
      expect(result.current.distance).toBeGreaterThan(afterSecond)
    })

    it('descarta un fix con accuracy peor que el máximo, pero igual actualiza gpsAccuracy', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0, { accuracy: 25 })))

      expect(result.current.pointsCount).toBe(0)
      expect(result.current.gpsAccuracy).toBe(25)
    })

    it('filtro de jitter: descarta un fix a menos de 3m del anterior', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))
      // ~1.1m de diferencia — por debajo del piso de ruido.
      act(() => lastWatchCallback().success(makePosition(40.00001, -3.0, 5_000)))

      expect(result.current.pointsCount).toBe(1)
      expect(result.current.distance).toBe(0)
    })

    it('descarta un salto de velocidad implausible sin ser gap (>14 m/s)', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))
      // ~222m en 5s → ~44 m/s, imposible corriendo y no es gap (<30s).
      act(() => lastWatchCallback().success(makePosition(40.002, -3.0, 5_000)))

      expect(result.current.pointsCount).toBe(1)
      expect(result.current.distance).toBe(0)
    })

    it('un salto >30s plausible se marca como gap y suma distancia', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))
      // ~55m en 35s → ~1.6 m/s, plausible para "running" (límite 6 m/s).
      act(() => lastWatchCallback().success(makePosition(40.0005, -3.0, 35_000)))

      expect(result.current.pointsCount).toBe(2)
      expect(result.current.points.current[1].gap).toBe(true)
      expect(result.current.distance).toBeGreaterThan(0)
    })
  })

  describe('pause / resume', () => {
    it('pause detiene el watch de GPS y cambia el estado', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))

      act(() => result.current.pause())

      expect(result.current.state).toBe('paused')
      expect(clearWatchMock).toHaveBeenCalledTimes(1)
    })

    it('un fix tardío tras pause() se descarta (guarda de estado en el callback)', () => {
      // Condición de carrera real-GPS: un fix en vuelo puede llegar después de
      // pause() aunque clearWatch ya se haya llamado. El callback consulta
      // stateRef y fuera de 'tracking' no muta distancia ni puntos.
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))
      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))
      act(() => result.current.pause())

      act(() => lastWatchCallback().success(makePosition(40.001, -3.0, 10_000)))

      expect(result.current.state).toBe('paused')
      expect(result.current.distance).toBe(0)
      expect(result.current.pointsCount).toBe(1)
    })

    it('resume vuelve a tracking y reinicia el watch de GPS', () => {
      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
      act(() => result.current.start('running'))
      act(() => result.current.pause())

      act(() => result.current.resume())

      expect(result.current.state).toBe('tracking')
      expect(watchPositionMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('finish', () => {
    it('guarda la sesión en PocketBase con los campos clave y limpia el estado', async () => {
      const create = vi.fn().mockResolvedValue({ id: 'sess-1' })
      vi.mocked(pb.collection).mockReturnValue(makePbCollection({ create }) as never)
      const { wrapper, invalidateSpy } = makeWrapper('user1', 80)
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      act(() => result.current.start('running'))
      act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))
      act(() => lastWatchCallback().success(makePosition(40.001, -3.0, 10_000)))

      let saved: unknown
      await act(async () => {
        saved = await result.current.finish('nota de prueba')
      })

      expect(result.current.state).toBe('finished')
      expect(create).toHaveBeenCalledTimes(1)
      const payload = create.mock.calls[0][0]
      expect(payload.user).toBe('user1')
      expect(payload.activity_type).toBe('running')
      expect(payload.note).toBe('nota de prueba')
      expect(payload.distance_km).toBeGreaterThan(0)
      expect(typeof payload.duration_seconds).toBe('number')
      // Calorías calculadas por la misma fórmula pura que usa el fuente.
      expect(payload.calories_burned).toBe(
        estimateCalories('running' as CardioActivityType, payload.duration_seconds, 80),
      )
      expect(saved).toEqual(expect.objectContaining({ id: 'sess-1' }))
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(invalidateSpy).toHaveBeenCalled()
    })

    it('sin userId no llama a PocketBase pero igual retorna la sesión calculada', async () => {
      const { wrapper } = makeWrapper(null)
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      act(() => result.current.start('walking'))

      let saved: unknown
      await act(async () => {
        saved = await result.current.finish()
      })

      expect(pb.collection).not.toHaveBeenCalledWith('cardio_sessions')
      expect(saved).toEqual(expect.objectContaining({ activity_type: 'walking' }))
    })

    it('si PocketBase falla, encola la sesión en la cola de reintento (unsaved)', async () => {
      const create = vi.fn().mockRejectedValue(new Error('network down'))
      vi.mocked(pb.collection).mockReturnValue(makePbCollection({ create }) as never)
      const { wrapper } = makeWrapper('user1')
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      act(() => result.current.start('running'))
      await act(async () => {
        await result.current.finish()
      })

      const queued = JSON.parse(localStorage.getItem(UNSAVED_KEY) ?? '[]')
      expect(queued).toHaveLength(1)
      expect(queued[0].user).toBe('user1')
      expect(result.current.unsavedCount).toBe(1)
    })
  })

  it('discard resetea la sesión a idle y detiene el GPS', () => {
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCardioSessionContext(), { wrapper })
    act(() => result.current.start('running'))
    act(() => lastWatchCallback().success(makePosition(40.0, -3.0, 0)))

    act(() => result.current.discard())

    expect(result.current.state).toBe('idle')
    expect(result.current.pointsCount).toBe(0)
    expect(result.current.distance).toBe(0)
    expect(clearWatchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  describe('historial y edición', () => {
    it('getHistory mapea los resultados de PocketBase y retorna [] sin userId', async () => {
      const getList = vi.fn().mockResolvedValue({
        items: [{ id: 'a', user: 'user1', activity_type: 'running', distance_km: 5, duration_seconds: 1800 }],
      })
      vi.mocked(pb.collection).mockReturnValue(makePbCollection({ getList }) as never)
      const { wrapper } = makeWrapper('user1')
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      const history = await result.current.getHistory(10)
      expect(getList).toHaveBeenCalledWith(1, 10, expect.objectContaining({ sort: '-started_at' }))
      expect(history).toEqual([
        expect.objectContaining({ id: 'a', activity_type: 'running', distance_km: 5, gps_points: [] }),
      ])

      const { wrapper: noUserWrapper } = makeWrapper(null)
      const { result: noUserResult } = renderHook(() => useCardioSessionContext(), { wrapper: noUserWrapper })
      expect(await noUserResult.current.getHistory()).toEqual([])
    })

    it('deleteSession y updateSessionNote llaman a PocketBase e invalidan el query', async () => {
      const del = vi.fn().mockResolvedValue(undefined)
      const update = vi.fn().mockResolvedValue(undefined)
      vi.mocked(pb.collection).mockReturnValue(makePbCollection({ delete: del, update }) as never)
      const { wrapper, invalidateSpy } = makeWrapper('user1')
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      await result.current.deleteSession('sess-1')
      expect(del).toHaveBeenCalledWith('sess-1')

      await result.current.updateSessionNote('sess-1', 'nueva nota')
      expect(update).toHaveBeenCalledWith('sess-1', { note: 'nueva nota' })
      expect(invalidateSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('persistencia en localStorage', () => {
    it('restaura una sesión "tracking" guardada al montar el provider', () => {
      const persisted = {
        state: 'tracking' as const,
        activityType: 'cycling' as CardioActivityType,
        startTime: Date.now() - 60_000,
        pausedDuration: 0,
        pauseStart: null,
        points: [{ lat: 40.0, lng: -3.0, timestamp: Date.now() - 60_000 }],
        distance: 2.5,
        lastSplitKm: 2,
        lastSplitTime: Date.now() - 30_000,
        maxSpeed: 20,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      expect(result.current.state).toBe('tracking')
      expect(result.current.activityType).toBe('cycling')
      expect(result.current.distance).toBe(2.5)
      expect(result.current.pointsCount).toBe(1)
      // Al restaurar como "tracking" retoma el GPS.
      expect(watchPositionMock).toHaveBeenCalledTimes(1)
    })

    it('descarta una sesión guardada de más de 24h (zombie) y no la restaura', () => {
      const persisted = {
        state: 'tracking' as const,
        activityType: 'running' as CardioActivityType,
        startTime: Date.now() - 25 * 60 * 60 * 1000,
        pausedDuration: 0,
        pauseStart: null,
        points: [],
        distance: 0,
        lastSplitKm: 0,
        lastSplitTime: 0,
        maxSpeed: 0,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))

      const { wrapper } = makeWrapper()
      const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

      expect(result.current.state).toBe('idle')
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      expect(watchPositionMock).not.toHaveBeenCalled()
    })
  })

  it('al montar, reintenta la cola de sesiones no guardadas y la limpia si PocketBase responde bien', async () => {
    localStorage.setItem(
      UNSAVED_KEY,
      JSON.stringify([{ user: 'user1', activity_type: 'running', distance_km: 1, duration_seconds: 60 }]),
    )
    const create = vi.fn().mockResolvedValue({ id: 'retried' })
    vi.mocked(pb.collection).mockReturnValue(makePbCollection({ create }) as never)
    const { wrapper } = makeWrapper('user1')
    const { result } = renderHook(() => useCardioSessionContext(), { wrapper })

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.unsavedCount).toBe(0))
    expect(localStorage.getItem(UNSAVED_KEY)).toBeNull()
  })
})
