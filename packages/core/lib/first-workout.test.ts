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
import { localize } from './i18n-db'
import { isFreeSessionKey } from './session-key'

const LEVELS = ['principiante', 'intermedio', 'avanzado'] as const

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
  it('cada id curado existe en el catálogo empaquetado y no necesita material (ejercicio principal + regresión)', () => {
    const index = getCatalogIndexSync()
    expect(index).not.toBeNull()
    for (const id of FIRST_WORKOUT_EXERCISE_IDS) {
      const entry = index!.byId.get(id)
      expect(entry, `falta ${id} en exercise-catalog.json`).toBeDefined()
      expect(entry!.equipment ?? ['ninguno'], `${id} pide material`).toEqual(['ninguno'])
    }
  })

  it('FIRST_WORKOUT_EXERCISE_IDS incluye los regressionId, no solo los ejercicios principales (#812)', () => {
    expect(FIRST_WORKOUT_EXERCISE_IDS).toEqual(
      expect.arrayContaining(['bodyweight_squat', 'knee_push_up', 'pushup_std', 'dead_bug']),
    )
  })

  it.each(LEVELS)('%s: 3 ejercicios, 2 series, sin material (#812, antes eran 4)', (level) => {
    const w = buildFirstWorkout(level, 'es')
    expect(w.exercises).toHaveLength(3)
    expect(w.exercises.every(e => e.sets === 2)).toBe(true)
    expect(w.exercises.every(e => e.rest === 30)).toBe(true)
    expect(w.exercises.every(e => e.equipment?.length === 1 && e.equipment[0] === 'ninguno')).toBe(true)
    expect(w.exercises.every(e => e.section === 'main')).toBe(true)
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

describe('nota de técnica + regresión (#812)', () => {
  it.each(LEVELS)('%s: cada ejercicio trae nota no vacía en es y en, con el prefijo de regresión y sin quedar colgando', (level) => {
    for (const locale of ['es', 'en'] as const) {
      const w = buildFirstWorkout(level, locale)
      const marker = locale === 'en' ? 'Too hard? Try' : 'Si no te sale:'
      for (const ex of w.exercises) {
        expect(ex.note.trim().length, `${level}/${ex.id}/${locale}`).toBeGreaterThan(0)
        expect(ex.note, `${level}/${ex.id}/${locale}`).toContain(marker)
        // El prefijo nunca se queda sin regresión detrás.
        expect(ex.note.trim().endsWith(marker) || ex.note.trim().endsWith(`${marker}.`), `${level}/${ex.id}/${locale}`).toBe(false)
      }
    }
  })

  it('bodyweight_squat (sin regressionId): la nota contiene la regresión embebida en es y en', () => {
    const es = buildFirstWorkout('principiante', 'es').exercises.find(e => e.id === 'bodyweight_squat')!
    const en = buildFirstWorkout('principiante', 'en').exercises.find(e => e.id === 'bodyweight_squat')!
    expect(es.note).toContain('siéntate y levántate de una silla')
    expect(en.note).toContain('sit and stand up from a chair')
  })

  it('knee_push_up (sin regressionId, sin material: incline_push_up del catálogo pide banco)', () => {
    const es = buildFirstWorkout('principiante', 'es').exercises.find(e => e.id === 'knee_push_up')!
    const en = buildFirstWorkout('principiante', 'en').exercises.find(e => e.id === 'knee_push_up')!
    expect(es.note).toContain('mesa o el sofá')
    expect(en.note).toContain('table or the couch')
  })

  it('pushup_std (intermedio, regressionId: knee_push_up) resuelve la regresión contra el nombre del catálogo', () => {
    const index = getCatalogIndexSync()!
    const catalogName = index.byId.get('knee_push_up')!.name
    const es = buildFirstWorkout('intermedio', 'es').exercises.find(e => e.id === 'pushup_std')!
    const en = buildFirstWorkout('intermedio', 'en').exercises.find(e => e.id === 'pushup_std')!
    expect(es.note).toContain(localize(catalogName, 'es'))
    expect(en.note).toContain(localize(catalogName, 'en'))
  })

  it('jump_squat (avanzado, regressionId: bodyweight_squat) y diamond_pushup (regressionId: pushup_std) resuelven contra el catálogo', () => {
    const index = getCatalogIndexSync()!
    const es = buildFirstWorkout('avanzado', 'es').exercises
    expect(es.find(e => e.id === 'jump_squat')!.note).toContain(localize(index.byId.get('bodyweight_squat')!.name, 'es'))
    expect(es.find(e => e.id === 'diamond_pushup')!.note).toContain(localize(index.byId.get('pushup_std')!.name, 'es'))
  })

  it('hollow_hold (avanzado, regressionId: dead_bug) es un ejercicio del catálogo sin material', () => {
    const index = getCatalogIndexSync()!
    const deadBug = index.byId.get('dead_bug')!
    expect(deadBug.equipment ?? ['ninguno']).toEqual(['ninguno'])
    const es = buildFirstWorkout('avanzado', 'es').exercises.find(e => e.id === 'hollow_hold')!
    expect(es.note).toContain(localize(deadBug.name, 'es'))
  })

  it('la nota curada GANA a la del catálogo, aunque el catálogo tenga note vacío ({es:"",en:""}) o no', () => {
    const index = getCatalogIndexSync()!
    // bodyweight_squat y knee_push_up traen note: {es:'',en:''} en el catálogo — es un
    // objeto no nulo, así que `cat?.note ?? entry.note` (lo que proponía la issue) habría
    // devuelto ese objeto vacío y la nota habría salido en blanco.
    expect(localize(index.byId.get('bodyweight_squat')!.note, 'es')).toBe('')
    expect(localize(index.byId.get('knee_push_up')!.note, 'es')).toBe('')
    const squat = buildFirstWorkout('principiante', 'es').exercises.find(e => e.id === 'bodyweight_squat')!
    expect(squat.note.trim().length).toBeGreaterThan(0)

    // plank SÍ trae note no vacío en el catálogo, y aun así pierde frente a la nota
    // curada del primer entreno, escrita para alguien que lo hace por primera vez.
    const catalogPlankNote = localize(index.byId.get('plank')!.note, 'es')
    expect(catalogPlankNote.length).toBeGreaterThan(0)
    const plank = buildFirstWorkout('principiante', 'es').exercises.find(e => e.id === 'plank')!
    expect(plank.note).not.toContain(catalogPlankNote)
    expect(plank.note).toContain('línea recta de la cabeza a los talones')
  })
})

describe('estimateFirstWorkoutMinutes (#812: 3 ejercicios bajan el tiempo frente a los 4 originales)', () => {
  it.each([
    ['principiante', 5],
    ['intermedio', 5],
    ['avanzado', 5],
  ] as const)('%s: %i min exactos', (level, minutes) => {
    expect(estimateFirstWorkoutMinutes(level)).toBe(minutes)
  })

  it('baja frente a los ~7 min que daban los 4 ejercicios originales', () => {
    for (const level of LEVELS) {
      expect(estimateFirstWorkoutMinutes(level)).toBeLessThan(7)
    }
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
      source: 'onboarding', level: 'principiante', workout_key: 'free_first_1', exercise_count: 3,
    }))
  })
})
