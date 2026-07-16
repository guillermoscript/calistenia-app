import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Exercise, Workout } from '@calistenia/core/types'

// op (core) hace tracking de analytics — se mockea entero; aquí solo se
// verifica que el context llame a track() con los eventos/props correctos.
// vi.hoisted porque vi.mock se hoistea sobre las declaraciones del archivo.
const { mockTrack } = vi.hoisted(() => ({ mockTrack: vi.fn() }))
vi.mock('@calistenia/core/lib/analytics', () => ({
  op: { track: mockTrack },
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

import { ActiveSessionProvider, useActiveSession, getCurrentSection } from './ActiveSessionContext'

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
    const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
    expect(result.current.isActive).toBe(false)
    expect(result.current.workout).toBeNull()
    expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    expect(result.current.sectionStartTime).toBeNull()
  })

  describe('startSession', () => {
    it('activa la sesión, setea workout/key/source, resetea progress y persiste', () => {
      const workout = makeWorkout([makeExercise({ section: 'main', sets: 2 })])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })

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

    it('trackea session_started con workout_key y source', () => {
      const workout = makeWorkout([makeExercise()])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })

      act(() => { result.current.startSession(workout, 'free_123', 'free') })

      expect(mockTrack).toHaveBeenCalledWith('session_started', { workout_key: 'free_123', source: 'free' })
    })
  })

  it('setProgress hace merge parcial sin perder los demás campos', () => {
    const workout = makeWorkout([makeExercise()])
    const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
    act(() => { result.current.startSession(workout, 'k', 'program') })

    act(() => { result.current.setProgress({ stepIdx: 2 }) })
    expect(result.current.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 0 })

    act(() => { result.current.setProgress({ setsCount: 5 }) })
    expect(result.current.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 5 })
  })

  it('endSession desactiva, limpia el storage de la sesión y la cola de sesión libre', () => {
    const workout = makeWorkout([makeExercise()])
    const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
    act(() => { result.current.startSession(workout, 'k', 'program') })
    localStorage.setItem(FREE_QUEUE_KEY, JSON.stringify([{ some: 'queued-item' }]))

    act(() => { result.current.endSession() })

    expect(result.current.isActive).toBe(false)
    expect(result.current.workout).toBeNull()
    expect(result.current.progress).toEqual(INITIAL_PROGRESS)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(FREE_QUEUE_KEY)).toBeNull()
  })

  describe('skipWarmup', () => {
    it('salta al primer step no-warmup (sets="múltiples" expande a 3 steps)', () => {
      const workout = makeWorkout([
        makeExercise({ id: 'w1', section: 'warmup', sets: 'múltiples' }), // 3 steps → idx 0-2
        makeExercise({ id: 'm1', section: 'main', sets: 2 }), // 2 steps → idx 3-4
      ])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipWarmup() })

      expect(result.current.progress.stepIdx).toBe(3)
      expect(result.current.progress.phase).toBe('exercise')
      expect(result.current.getWarmupCooldownData().warmupSkipped).toBe(true)
    })

    it('usa fallback de 1 step cuando sets no es un número parseable', () => {
      const workout = makeWorkout([
        makeExercise({ id: 'w1', section: 'warmup', sets: 1 }), // 1 step → idx 0
        makeExercise({ id: 'm1', section: 'main', sets: 'texto-no-numerico' }), // fallback 1 step → idx 1
      ])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipWarmup() })

      expect(result.current.progress.stepIdx).toBe(1)
    })

    it('sets=0 explícito aporta 0 steps (no genera step fantasma)', () => {
      // El fallback de 1 queda solo para sets no parseable; un 0 explícito
      // significa que el ejercicio no participa en el flujo.
      const workout = makeWorkout([
        makeExercise({ id: 'w1', section: 'warmup', sets: 0 }),
        makeExercise({ id: 'm1', section: 'main', sets: 1 }),
      ])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipWarmup() })

      // El warmup con sets=0 no aporta steps: el main queda en stepIdx 0.
      expect(result.current.progress.stepIdx).toBe(0)
    })

    it('resetea sectionStartTime al momento actual', () => {
      vi.useFakeTimers()
      const start = new Date('2026-01-01T00:00:00Z')
      vi.setSystemTime(start)
      const workout = makeWorkout([
        makeExercise({ section: 'warmup' }),
        makeExercise({ section: 'main' }),
      ])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })
      const initialSectionStart = result.current.sectionStartTime

      vi.setSystemTime(new Date(start.getTime() + 60_000))
      act(() => { result.current.skipWarmup() })

      expect(result.current.sectionStartTime).not.toBe(initialSectionStart)
      expect(result.current.sectionStartTime).toBe(start.getTime() + 60_000)
    })

    it('no hace nada si no hay sesión activa (guard !workout)', () => {
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.skipWarmup() })
      expect(result.current.progress).toEqual(INITIAL_PROGRESS)
      expect(result.current.isActive).toBe(false)
    })
  })

  describe('skipCooldown / skipRemainingCooldown', () => {
    it('skipCooldown mueve la fase a "note" y marca cooldownSkipped', () => {
      const workout = makeWorkout([makeExercise({ section: 'main' })])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipCooldown() })

      expect(result.current.progress.phase).toBe('note')
      expect(result.current.getWarmupCooldownData().cooldownSkipped).toBe(true)
    })

    it('skipRemainingCooldown delega en skipCooldown (mismo efecto)', () => {
      const workout = makeWorkout([makeExercise({ section: 'main' })])
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
      act(() => { result.current.startSession(workout, 'k', 'program') })

      act(() => { result.current.skipRemainingCooldown() })

      expect(result.current.progress.phase).toBe('note')
      expect(result.current.getWarmupCooldownData().cooldownSkipped).toBe(true)
    })

    it('no hace nada si no hay sesión activa (guard !workout)', () => {
      const { result } = renderHook(() => useActiveSession(), { wrapper: ActiveSessionProvider })
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
      const { result } = renderHook(() => mod.useActiveSession(), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(true)
      expect(result.current.workoutKey).toBe('p1_lun')
      expect(result.current.source).toBe('program')
      expect(result.current.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 1 })
    })

    it('descarta y borra una sesión de más de 24h', async () => {
      const old = Date.now() - 25 * 60 * 60 * 1000
      const persisted = {
        workout: makeWorkout([makeExercise()]),
        workoutKey: 'k',
        source: 'program',
        progress: INITIAL_PROGRESS,
        startedAt: old,
        sectionStartTime: null,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => mod.useActiveSession(), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('descarta JSON corrupto y limpia el storage', async () => {
      localStorage.setItem(STORAGE_KEY, '{esto no es json válido')

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => mod.useActiveSession(), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })

    it('descarta shape inválido (sin workout/workoutKey/progress)', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ startedAt: Date.now() }))

      vi.resetModules()
      const mod = await import('./ActiveSessionContext')
      const { result } = renderHook(() => mod.useActiveSession(), { wrapper: mod.ActiveSessionProvider })

      expect(result.current.isActive).toBe(false)
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    })
  })
})
