import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../platform'
import { op } from './analytics'
import { getCatalogIndexSync } from './catalogIndex'
import {
  FIRST_WORKOUT_EXERCISE_IDS,
  FIRST_WORKOUT_KEY_PREFIX,
  FIRST_WORKOUT_PENDING_KEY,
  buildFirstWorkout,
  estimateFirstWorkoutMinutes,
  firstWorkoutKey,
  isFirstWorkoutKey,
  markFirstWorkoutPending,
  normalizeFirstWorkoutLevel,
  takeFirstWorkoutPending,
  trackFirstWorkoutStarted,
} from './first-workout'
import { isFreeSessionKey } from './session-key'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('./analytics', () => ({
  op: { track: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(storage.getItem).mockReset()
  vi.mocked(storage.setItem).mockReset()
  vi.mocked(storage.removeItem).mockReset()
  vi.mocked(op.track).mockReset()
})

describe('buildFirstWorkout', () => {
  // vitest.setup.ts prima el índice del catálogo (#486): aquí está cargado.
  it('cada id curado existe en el catálogo empaquetado y no necesita material', () => {
    const index = getCatalogIndexSync()
    expect(index).not.toBeNull()
    for (const id of FIRST_WORKOUT_EXERCISE_IDS) {
      const entry = index!.byId.get(id)
      expect(entry, `falta ${id} en exercise-catalog.json`).toBeDefined()
      expect(entry!.equipment ?? ['ninguno'], `${id} pide material`).toEqual(['ninguno'])
    }
  })

  it.each(['principiante', 'intermedio', 'avanzado'] as const)('%s: 4 ejercicios, 2 series, ~6 min, sin material', (level) => {
    const w = buildFirstWorkout(level, 'es')
    expect(w.exercises).toHaveLength(4)
    expect(w.exercises.every(e => e.sets === 2)).toBe(true)
    expect(w.exercises.every(e => e.rest === 30)).toBe(true)
    expect(w.exercises.every(e => e.equipment?.length === 1 && e.equipment[0] === 'ninguno')).toBe(true)
    expect(w.exercises.every(e => e.section === 'main')).toBe(true)
    const minutes = estimateFirstWorkoutMinutes(level)
    expect(minutes).toBeGreaterThanOrEqual(4)
    expect(minutes).toBeLessThanOrEqual(8)
  })

  it('toma nombre y músculos del catálogo en el idioma pedido', () => {
    const es = buildFirstWorkout('principiante', 'es')
    const en = buildFirstWorkout('principiante', 'en')
    const squatEs = es.exercises.find(e => e.id === 'bodyweight_squat')!
    const squatEn = en.exercises.find(e => e.id === 'bodyweight_squat')!
    expect(squatEs.name).not.toBe(squatEn.name)
    expect(es.title).toBe('Tu primer entreno')
    expect(en.title).toBe('Your first workout')
  })

  it('un nivel desconocido cae a principiante', () => {
    expect(normalizeFirstWorkoutLevel(undefined)).toBe('principiante')
    expect(normalizeFirstWorkoutLevel('')).toBe('principiante')
    expect(normalizeFirstWorkoutLevel('avanzado')).toBe('avanzado')
    expect(buildFirstWorkout('lo que sea', 'es').exercises.map(e => e.id))
      .toEqual(buildFirstWorkout('principiante', 'es').exercises.map(e => e.id))
  })

  it('el ejercicio con temporizador lleva isTimer y timerSeconds', () => {
    const plank = buildFirstWorkout('principiante', 'es').exercises.find(e => e.id === 'plank')!
    expect(plank.isTimer).toBe(true)
    expect(plank.timerSeconds).toBe(20)
  })
})

describe('firstWorkoutKey', () => {
  it('es una clave de sesión libre para el resto de la app', () => {
    const key = firstWorkoutKey(1_700_000_000_000)
    expect(key).toBe(`${FIRST_WORKOUT_KEY_PREFIX}1700000000000`)
    expect(isFreeSessionKey(key)).toBe(true)
    expect(isFirstWorkoutKey(key)).toBe(true)
    expect(isFirstWorkoutKey('free_1700000000000')).toBe(false)
    expect(isFirstWorkoutKey('p1_lun')).toBe(false)
  })
})

describe('handoff pendiente (web)', () => {
  it('markFirstWorkoutPending guarda usuario, nivel normalizado y origen', () => {
    markFirstWorkoutPending('u1', 'intermedio')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    const [key, raw] = vi.mocked(storage.setItem).mock.calls[0]
    expect(key).toBe(FIRST_WORKOUT_PENDING_KEY)
    expect(JSON.parse(raw)).toMatchObject({ userId: 'u1', level: 'intermedio', source: 'onboarding' })
  })

  it('takeFirstWorkoutPending devuelve la intención una sola vez', () => {
    const now = 1_700_000_000_000
    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'u1', level: 'avanzado', source: 'home', createdAt: now - 1000 }))
    expect(takeFirstWorkoutPending('u1', now)).toEqual({ userId: 'u1', level: 'avanzado', source: 'home', createdAt: now - 1000 })
    expect(storage.removeItem).toHaveBeenCalledWith(FIRST_WORKOUT_PENDING_KEY)
  })

  it('no devuelve nada si es de otro usuario, caducó o está corrupto (y siempre limpia)', () => {
    const now = 1_700_000_000_000
    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'u1', level: 'principiante', source: 'onboarding', createdAt: now }))
    expect(takeFirstWorkoutPending('u2', now)).toBeNull()

    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'u1', level: 'principiante', source: 'onboarding', createdAt: now - 11 * 60 * 1000 }))
    expect(takeFirstWorkoutPending('u1', now)).toBeNull()

    vi.mocked(storage.getItem).mockReturnValue('{nope')
    expect(takeFirstWorkoutPending('u1', now)).toBeNull()

    expect(storage.removeItem).toHaveBeenCalledTimes(3)
  })

  it('sin usuario no consume la intención (auth aún resolviéndose)', () => {
    vi.mocked(storage.getItem).mockReturnValue(JSON.stringify({ userId: 'u1', level: 'principiante', source: 'onboarding', createdAt: Date.now() }))
    expect(takeFirstWorkoutPending(undefined)).toBeNull()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })

  it('sin intención guardada no toca el storage', () => {
    vi.mocked(storage.getItem).mockReturnValue(null)
    expect(takeFirstWorkoutPending('u1')).toBeNull()
    expect(storage.removeItem).not.toHaveBeenCalled()
  })
})

describe('trackFirstWorkoutStarted', () => {
  it('emite first_workout_started con origen, nivel y clave', () => {
    trackFirstWorkoutStarted({ source: 'onboarding', level: 'principiante', workoutKey: 'free_first_1' })
    expect(op.track).toHaveBeenCalledWith('first_workout_started', expect.objectContaining({
      source: 'onboarding', level: 'principiante', workout_key: 'free_first_1', exercise_count: 4,
    }))
  })
})
