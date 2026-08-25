import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Exercise, Workout } from '@calistenia/core/types'

// op (core) hace tracking de analytics — se mockea entero; aquí solo se
// verifica que el context llame a track() con los eventos/props correctos.
// vi.hoisted porque vi.mock se hoistea sobre las declaraciones del archivo.
const { mockTrack, lifecycleBus, activeProgramId } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  activeProgramId: { current: null as string | null },
  // #482: el estado bajó a `useActiveSessionState` de core, que resuelve el
  // primer plano / segundo plano por el adapter de plataforma en vez de
  // `document.visibilitychange`. Los tests lo disparan por aquí.
  lifecycleBus: {
    foreground: new Set<() => void>(),
    background: new Set<() => void>(),
  },
}))
// #636: `lib/session-funnel` lee la plataforma y el programa activo de este
// mismo módulo, así que el mock tiene que traerlos o el bloque de propiedades
// revienta con un TypeError en cada evento.
vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: mockTrack },
  analyticsPlatform: () => 'web',
  getAnalyticsProgramId: () => activeProgramId.current,
  setAnalyticsProgramId: (id: string | null) => { activeProgramId.current = id },
}))

// #482: el storage del entreno pasó de `localStorage` global al facade de core,
// que exige initCore(). Se inyecta aquí respaldado por el localStorage de jsdom,
// para que los tests sigan asertando sobre `window.localStorage`.
vi.mock('@calistenia/core/platform', () => ({
  storage: {
    getItem: (k: string) => window.localStorage.getItem(k),
    setItem: (k: string, v: string) => window.localStorage.setItem(k, v),
    removeItem: (k: string) => window.localStorage.removeItem(k),
  },
  lifecycle: {
    isForeground: () => true,
    onForeground: (handler: () => void) => {
      lifecycleBus.foreground.add(handler)
      return () => lifecycleBus.foreground.delete(handler)
    },
    onBackground: (handler: () => void) => {
      lifecycleBus.background.add(handler)
      return () => lifecycleBus.background.delete(handler)
    },
  },
  getPlatform: () => ({ reportError: vi.fn() }),
}))

// El singleton pb exige initCore() al evaluarse y el sync con el server no
// aplica a estos tests (sin auth) — ambos se mockean enteros.
vi.mock('@calistenia/core/lib/pocketbase', () => ({
  pb: { authStore: { isValid: false, onChange: vi.fn(() => () => {}) } },
}))
vi.mock('@calistenia/core/lib/activeSessionSync', () => ({
  scheduleActiveSessionPush: vi.fn(),
  flushActiveSessionPush: vi.fn(),
  pushActiveSessionNow: vi.fn(),
  fetchRemoteActiveSession: vi.fn(async () => null),
  clearRemoteActiveSession: vi.fn(),
}))

import { ActiveSessionProvider, useActiveSession, useActiveSessionProgress, getCurrentSection } from './ActiveSessionContext'

const STORAGE_KEY = 'calistenia_strength_active'
const FREE_QUEUE_KEY = 'calistenia_free_session_queue'
const INITIAL_PROGRESS = { stepIdx: 0, phase: 'exercise', setsCount: 0 }

// Solo los campos que usa ActiveSessionContext: `section` y `sets` en
// flatSteps/getCurrentSection. El resto se rellena para tener un shape
// plausible, pero se castea porque no importa a los tests.
function makeExercise(overrides: { id?: string; section?: 'warmup' | 'main' | 'cooldown'; sets?: number | string } = {}): Exercise {
  return {
    id: overrides.id ?? 'ex',
    name: 'Ejercicio',
    sets: overrides.sets ?? 3,
    reps: '10',
    rest: 60,
    muscles: '',
    note: '',
    youtube: '',
    priority: 'alta',
    section: overrides.section,
  } as unknown as Exercise
}

function makeWorkout(exercises: Exercise[]): Workout {
  return {
    phase: 1,
    day: 'lun',
    title: 'Test workout',
    exercises,
  } as unknown as Workout
}

afterEach(() => {
  vi.useRealTimers()
})

describe('ActiveSessionContext', () => {
  it('useActiveSession lanza si no hay ActiveSessionProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useActiveSession())).toThrow(
      'useActiveSession must be used within ActiveSessionProvider',
    )
    spy.mockRestore()
  })

  it('estado inicial sin sesión activa', () => {
    const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
    expect(result.current.isActive).toBe(false)
    expect(result.current.workout).toBeNull()
    expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    expect(result.current.sectionStartTime).toBeNull()
  })

  describe('startSession', () => {
    it('activa la sesión, setea workout/key/source, resetea progress y persiste', () => {
      const workout = makeWorkout([makeExercise({ section: 'main', sets: 2 })])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })

      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })

      expect(result.current.isActive).toBe(true)
      expect(result.current.workout).toBe(workout)
      expect(result.current.workoutKey).toBe('p1_lun')
      expect(result.current.source).toBe('program')
      expect(result.current.progress).toEqual(INITIAL_PROGRESS)

      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
      expect(saved.workoutKey).toBe('p1_lun')
      expect(saved.source).toBe('program')
    })

    it('trackea session_started con el bloque completo del embudo', () => {
      const workout = makeWorkout([makeExercise({ sets: 3 }), makeExercise({ sets: 2 })])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })

      act(() => { result.current.startSession(workout, 'free_123', 'free') })

      expect(mockTrack).toHaveBeenCalledWith('session_started', expect.objectContaining({
        event_version: 1,
        platform: 'web',
        surface: 'session',
        workout_key: 'free_123',
        source: 'free',
        is_free_session: true,
        exercise_count: 2,
        sets_logged: 0,
        completion_pct: 0,
      }))
    })
  })

  it('setProgress hace merge parcial sin perder los demás campos', () => {
    const workout = makeWorkout([makeExercise()])
    const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
    act(() => { result.current.startSession(workout, 'k', 'program') })

    act(() => { result.current.setProgress({ stepIdx: 2 }) })
    expect(result.current.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 0 })

    act(() => { result.current.setProgress({ setsCount: 5 }) })
    expect(result.current.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 5 })
  })

  it('endSession desactiva, limpia el storage de la sesión y la cola de sesión libre', () => {
    const workout = makeWorkout([makeExercise()])
    const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
    act(() => { result.current.startSession(workout, 'k', 'program') })
    localStorage.setItem(FREE_QUEUE_KEY, JSON.stringify([{ some: 'queued-item' }]))

    act(() => { result.current.endSession() })

    expect(result.current.isActive).toBe(false)
    expect(result.current.workout).toBeNull()
    expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(FREE_QUEUE_KEY)).toBeNull()
  })

  // #636: una sesión arrancada tiene que acabar en EXACTAMENTE un evento
  // terminal. Antes la decisión estaba repartida entre tres sitios que no se
  // hablaban, así que había sesiones con cero (salir a propósito, y todo el
  // móvil) y sesiones con dos (completar y cerrar después la pestaña).
  describe('desenlace único de la sesión', () => {
    const terminals = () => mockTrack.mock.calls
      .filter(([name]) => name === 'session_exited' || name === 'workout_abandoned')

    beforeEach(() => { mockTrack.mockClear() })

    it('salir sin completar emite session_exited una sola vez', () => {
      const workout = makeWorkout([makeExercise({ sets: 4 })])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })
      act(() => { result.current.setProgress({ setsCount: 2 }) })

      act(() => { result.current.endSession() })

      expect(terminals()).toHaveLength(1)
      expect(mockTrack).toHaveBeenCalledWith('session_exited', expect.objectContaining({
        workout_key: 'p1_lun', phase: 1, day_id: 'lun', sets_logged: 2, completion_pct: 50,
      }))
    })

    // La fase `celebrate` la pone `session-machine` en el `dispatch({type:'finish'})`
    // que va justo después de `onMarkDone`, o sea después de `workout_completed`.
    // Sin este pestillo, el cierre del panel de celebración emitía un segundo
    // evento terminal para una sesión que ya estaba contada como completada.
    it('cerrar desde el panel de celebración NO emite nada más', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })
      act(() => { result.current.setProgress({ phase: 'celebrate' }) })

      act(() => { result.current.endSession() })

      expect(terminals()).toHaveLength(0)
    })

    it('completar y cerrar después la pestaña tampoco cuenta como abandono', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })
      act(() => { result.current.setProgress({ phase: 'celebrate' }) })

      act(() => { window.dispatchEvent(new Event('beforeunload')) })

      expect(terminals()).toHaveLength(0)
    })

    // `beforeunload` y `pagehide` pueden dispararse los dos en la misma salida.
    it('cerrar la pestaña emite un solo workout_abandoned aunque salten los dos eventos', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })

      act(() => {
        window.dispatchEvent(new Event('beforeunload'))
        window.dispatchEvent(new Event('pagehide'))
      })

      expect(terminals()).toHaveLength(1)
      expect(mockTrack).toHaveBeenCalledWith('workout_abandoned', expect.objectContaining({
        workout_key: 'p1_lun', reason: 'page_closed',
      }))
    })

    // El listener recibe el evento del DOM como primer argumento: si
    // `trackAbandon` aceptase la causa por parámetro, `reason` sería un
    // `BeforeUnloadEvent`.
    it('el objeto del evento del DOM no se cuela como causa del abandono', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })

      act(() => { window.dispatchEvent(new Event('beforeunload')) })

      expect(terminals()[0][1]).toMatchObject({ reason: 'page_closed' })
    })

    // Esta es una de las dos señales de abandono que SÍ funcionan en nativo,
    // donde no hay `beforeunload` de ningún tipo.
    it('arrancar otro entreno abandona el anterior, con sus propios datos', () => {
      const first = makeWorkout([makeExercise({ sets: 4 })])
      const second = makeWorkout([makeExercise({ sets: 3 })])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(first, 'p1_lun', 'program') })
      act(() => { result.current.setProgress({ setsCount: 1 }) })

      act(() => { result.current.startSession(second, 'p2_mar', 'program') })

      expect(terminals()).toHaveLength(1)
      expect(mockTrack).toHaveBeenCalledWith('workout_abandoned', expect.objectContaining({
        workout_key: 'p1_lun', phase: 1, reason: 'replaced', sets_logged: 1,
      }))
    })

    it('reanudar el MISMO entreno no es un abandono', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })

      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })

      expect(terminals()).toHaveLength(0)
    })

    it('el pestillo se rearma con cada sesión nueva', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })
      act(() => { result.current.endSession() })
      act(() => { result.current.startSession(workout, 'p1_lun', 'program') })
      act(() => { result.current.endSession() })

      expect(terminals()).toHaveLength(2)
    })
  })

  it('getProgressSnapshot devuelve el progreso actual sin suscribirse a él', () => {
    const workout = makeWorkout([makeExercise()])
    const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
    act(() => { result.current.startSession(workout, 'k', 'program') })

    expect(result.current.getProgressSnapshot()).toEqual(INITIAL_PROGRESS)

    act(() => { result.current.setProgress({ stepIdx: 4, setsCount: 3 }) })

    expect(result.current.getProgressSnapshot()).toEqual({ stepIdx: 4, phase: 'exercise', setsCount: 3 })
  })

  describe('skipWarmup', () => {
    // Desde el #475 el contexto SOLO registra la metadata de la sección
    // saltada: quién mueve el paso y la fase es SessionView, el dueño del
    // estado. A qué paso se salta lo cubre `createSessionReducer` en core.
    it('marca warmupSkipped sin tocar el progreso', () => {
      const workout = makeWorkout([
        makeExercise({ id: 'w1', section: 'warmup', sets: 'múltiples' }),
        makeExercise({ id: 'm1', section: 'main', sets: 2 }),
      ])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipWarmup() })

      expect(result.current.getWarmupCooldownData().warmupSkipped).toBe(true)
      expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    })

    it('registra la duración del calentamiento a partir de sectionStartTime', () => {
      vi.useFakeTimers()
      const start = new Date('2026-01-01T00:00:00Z')
      vi.setSystemTime(start)
      const workout = makeWorkout([
        makeExercise({ section: 'warmup' }),
        makeExercise({ section: 'main' }),
      ])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      vi.setSystemTime(new Date(start.getTime() + 90_000))
      act(() => { result.current.skipWarmup() })

      expect(result.current.getWarmupCooldownData().warmupDurationSeconds).toBe(90)
    })

    it('resetea sectionStartTime al momento actual', () => {
      vi.useFakeTimers()
      const start = new Date('2026-01-01T00:00:00Z')
      vi.setSystemTime(start)
      const workout = makeWorkout([
        makeExercise({ section: 'warmup' }),
        makeExercise({ section: 'main' }),
      ])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })
      const initialSectionStart = result.current.sectionStartTime

      vi.setSystemTime(new Date(start.getTime() + 60_000))
      act(() => { result.current.skipWarmup() })

      expect(result.current.sectionStartTime).not.toBe(initialSectionStart)
      expect(result.current.sectionStartTime).toBe(start.getTime() + 60_000)
    })

    it('no hace nada si no hay sesión activa (guard !workout)', () => {
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.skipWarmup() })
      expect(result.current.progress).toEqual(INITIAL_PROGRESS)
      expect(result.current.isActive).toBe(false)
    })
  })

  describe('skipCooldown / skipRemainingCooldown', () => {
    it('skipCooldown marca cooldownSkipped sin tocar el progreso', () => {
      const workout = makeWorkout([makeExercise({ section: 'main' })])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipCooldown() })

      expect(result.current.getWarmupCooldownData().cooldownSkipped).toBe(true)
      expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    })

    it('skipRemainingCooldown delega en skipCooldown (mismo efecto)', () => {
      const workout = makeWorkout([makeExercise({ section: 'main' })])
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipRemainingCooldown() })

      expect(result.current.getWarmupCooldownData().cooldownSkipped).toBe(true)
    })

    it('no hace nada si no hay sesión activa (guard !workout)', () => {
      const { result } = renderHook(() => ({ ...useActiveSession(), progress: useActiveSessionProgress() }), { wrapper: ActiveSessionProvider })
      act(() => { result.current.skipCooldown() })
      expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    })
  })

  describe('getCurrentSection (helper puro)', () => {
    it('retorna la sección del ejercicio en stepIdx', () => {
      const exercises = [makeExercise({ section: 'warmup' }), makeExercise({ section: 'cooldown' })]
      expect(getCurrentSection(exercises, 0)).toBe('warmup')
      expect(getCurrentSection(exercises, 1)).toBe('cooldown')
    })

    it('default a "main" cuando el ejercicio no tiene section', () => {
      const exercises = [makeExercise({ section: undefined })]
      expect(getCurrentSection(exercises, 0)).toBe('main')
    })

    it('default a "main" cuando stepIdx está fuera de rango', () => {
      const exercises = [makeExercise({ section: 'warmup' })]
      expect(getCurrentSection(exercises, 5)).toBe('main')
      expect(getCurrentSection(exercises, -1)).toBe('main')
    })
  })

  describe('persistencia y restauración desde localStorage', () => {
    // El módulo calcula `const restored = loadFromStorage()` UNA sola vez al
    // importarse. Para probar la restauración hay que sembrar localStorage
    // ANTES de que el módulo se evalúe: vi.resetModules() + import dinámico.

    it('restaura una sesión válida guardada', async () => {
      const workout = makeWorkout([makeExercise({ section: 'main' })])
      const persisted = {
        workout,
        workoutKey: 'p1_lun',
        source: 'program',
        progress: { stepIdx: 2, phase: 'exercise', setsCount: 1 },
        startedAt: Date.now(),
        sectionStartTime: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => ({ ...mod.useActiveSession(), progress: mod.useActiveSessionProgress() }), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(true)
      expect(result.current.workoutKey).toBe('p1_lun')
      expect(result.current.source).toBe('program')
      expect(result.current.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 1 })
    })

    // #636: caducar es la otra señal de abandono que funciona en nativo. Antes
    // la sesión se tiraba en silencio y el entreno que el usuario nunca terminó
    // no dejaba ni un evento.
    it('descarta una sesión de más de 24h y la declara abandonada', async () => {
      mockTrack.mockClear()
      const old = Date.now() - 25 * 60 * 60 * 1000
      const persisted = {
        workout: makeWorkout([makeExercise({ sets: 4 })]),
        workoutKey: 'p2_mie',
        source: 'program',
        progress: { stepIdx: 3, phase: 'exercise', setsCount: 2 },
        startedAt: old,
        savedAt: old + 600_000,
        sectionStartTime: null,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => ({ ...mod.useActiveSession(), progress: mod.useActiveSessionProgress() }), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
      // La duración es la REAL del entreno (arranque → último guardado), no el
      // tiempo transcurrido hasta que la app volvió a abrirse.
      expect(mockTrack).toHaveBeenCalledWith('workout_abandoned', expect.objectContaining({
        workout_key: 'p2_mie', reason: 'expired', duration_seconds: 600, sets_logged: 2,
      }))
    })

    // Una entrada corrupta no es un entreno abandonado: emitir por ella
    // inflaría la cifra con basura de storage.
    it('el shape inválido no se declara abandonado', async () => {
      mockTrack.mockClear()
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ startedAt: Date.now() - 25 * 60 * 60 * 1000 }))

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      renderHook(() => mod.useActiveSession(), { wrapper: mod.ActiveSessionProvider })

      expect(mockTrack).not.toHaveBeenCalledWith('workout_abandoned', expect.anything())
    })

    it('descarta JSON corrupto y limpia el storage', async () => {
      localStorage.setItem(STORAGE_KEY, '{esto no es json válido')

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => ({ ...mod.useActiveSession(), progress: mod.useActiveSessionProgress() }), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('descarta shape inválido (sin workout/workoutKey/progress)', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ startedAt: Date.now() }))

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => ({ ...mod.useActiveSession(), progress: mod.useActiveSessionProgress() }), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })
})
