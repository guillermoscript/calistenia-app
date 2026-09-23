/**
 * Restaurar una sesión de fuerza guardada ANTES del arreglo del #690.
 *
 * El hook no se monta aquí (core no tiene DOM ni testing-library): se ejercita
 * `loadFromStorage`, que es exactamente lo que alimenta el `useState` perezoso
 * del provider. Lo que se protege es que el snapshot congelado salga repasado
 * —nombre de catálogo y cronómetro deducido— sin que el `id` cambie nunca.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { initCore } from '../../platform'
import { STRENGTH_ACTIVE_KEY } from '../../lib/storage-keys'
import { getOrLoadCatalogIndex } from '../../lib/catalogIndex'
import { localize } from '../../lib/i18n-db'
import { firstWorkoutKey } from '../../lib/first-workout'
import type { Exercise } from '../../types'

// El módulo importa `pb` al evaluarse; nada de lo que se prueba aquí sale a red.
vi.mock('../../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { isValid: false, onChange: vi.fn(() => () => {}) }, files: { getURL: vi.fn() } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

// El nombre esperado se LEE del catálogo, no se escribe a mano: el contenido
// del catálogo se retoca (traducciones, #689) y un literal aquí convertiría
// este test en un guardián del copy en vez de del repaso del snapshot.
const catalogName = (id: string, locale = 'es') =>
  localize(getOrLoadCatalogIndex()?.byId.get(id)?.name, locale)

const memory = new Map<string, string>()

initCore({
  storage: {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => { memory.set(k, v) },
    removeItem: (k) => { memory.delete(k) },
  },
  env: { pbUrl: 'http://localhost:8090', aiApiUrl: '', isDev: true },
  analytics: { track: () => {}, identify: () => {}, clear: () => {} },
  connectivity: { isOnline: () => true, onOnline: () => () => {} },
})

const {
  loadFromStorage, normalizeRemoteSession,
  currentExerciseAnalytics, abandonPhase, abandonedWorkoutProperties,
} = await import('./useActiveSessionState')

const persist = (exercises: Record<string, unknown>[]) => {
  memory.set(STRENGTH_ACTIVE_KEY, JSON.stringify({
    workout: { phase: 1, day: 'lun', title: 'Empuje', exercises },
    workoutKey: 'p1_lun',
    source: 'program',
    progress: { stepIdx: 2, phase: 'exercise', setsCount: 4 },
    startedAt: Date.now() - 60_000,
    sectionStartTime: Date.now() - 60_000,
    savedAt: Date.now() - 1_000,
  }))
}

const base = {
  id: 'lun_1_1', name: 'Plancha lateral', sets: 3, reps: '10', rest: 90,
  muscles: 'Core', note: '', youtube: '', priority: 'med', isTimer: false, timerSeconds: 0,
}

describe('loadFromStorage — snapshot repasado al restaurar (#690)', () => {
  beforeEach(() => { memory.clear() })

  it('el slug guardado sale con el nombre del catálogo y con cronómetro', () => {
    persist([{ ...base, name: 'arm_circles', reps: '30-45 seg' }])
    const ex = loadFromStorage().session!.workout.exercises[0]
    expect(ex.name).toBe(catalogName('arm_circles'))
    expect(ex.name).not.toBe('arm_circles')
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
  })

  it('el `id` sobrevive intacto: el historial de series de la sesión no se parte', () => {
    persist([{ ...base, id: 'lun_1_1', name: 'arm_circles', reps: '30-45 seg' }])
    expect(loadFromStorage().session!.workout.exercises[0].id).toBe('lun_1_1')
  })

  it('el resto de la sesión (progreso, clave, origen) no se toca', () => {
    persist([{ ...base, name: 'arm_circles', reps: '30-45 seg' }])
    const s = loadFromStorage().session!
    expect(s.workoutKey).toBe('p1_lun')
    expect(s.source).toBe('program')
    expect(s.progress).toEqual({ stepIdx: 2, phase: 'exercise', setsCount: 4 })
  })

  it('un snapshot ya sano se restaura sin cambios', () => {
    persist([{ ...base, name: 'Plancha lateral', reps: '10' }])
    const ex = loadFromStorage().session!.workout.exercises[0]
    expect(ex.name).toBe('Plancha lateral')
    expect(ex.isTimer).toBe(false)
    expect(ex.timerSeconds).toBe(0)
  })

  it('una sesión de más de 24 h sigue caducando (no se repasa lo que se tira)', () => {
    memory.set(STRENGTH_ACTIVE_KEY, JSON.stringify({
      workout: { phase: 1, day: 'lun', title: 'Empuje', exercises: [{ ...base, name: 'arm_circles' }] },
      workoutKey: 'p1_lun', source: 'program',
      progress: { stepIdx: 0, phase: 'exercise', setsCount: 0 },
      startedAt: Date.now() - 25 * 60 * 60 * 1000,
      sectionStartTime: null,
    }))
    const { session, expired } = loadFromStorage()
    expect(session).toBeNull()
    expect(expired?.workoutKey).toBe('p1_lun')
    expect(memory.has(STRENGTH_ACTIVE_KEY)).toBe(false)
  })
})

describe('normalizeRemoteSession — la adopción entre dispositivos repasa igual (#690)', () => {
  const remote = (exercises: Record<string, unknown>[]) => ({
    workout: { phase: 1, day: 'lun', title: 'Empuje', exercises },
    workoutKey: 'p1_lun',
    source: 'program' as const,
    progress: { stepIdx: 2, phase: 'exercise' as const, setsCount: 4 },
    startedAt: Date.now() - 60_000,
    sectionStartTime: null,
    savedAt: Date.now() - 1_000,
    platform: 'mobile',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  it('la sesión que llega del server sale con nombre de catálogo y cronómetro', () => {
    const ex = normalizeRemoteSession(remote([{ ...base, name: 'arm_circles', reps: '30-45 seg' }])).workout.exercises[0]
    expect(ex.name).toBe(catalogName('arm_circles'))
    expect(ex.name).not.toBe('arm_circles')
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
    expect(ex.id).toBe('lun_1_1')
  })

  it('una sesión remota sana se adopta con LA MISMA referencia', () => {
    const r = remote([{ ...base, name: 'Plancha lateral', reps: '10' }])
    expect(normalizeRemoteSession(r)).toBe(r)
  })

  it('los metadatos de la sesión remota no se tocan', () => {
    const r = remote([{ ...base, name: 'arm_circles', reps: '45s' }])
    const out = normalizeRemoteSession(r)
    expect(out.workoutKey).toBe(r.workoutKey)
    expect(out.savedAt).toBe(r.savedAt)
    expect(out.progress).toBe(r.progress)
  })
})

// #823: contexto de `workout_abandoned` (ejercicio, sección, fase, primer
// entreno). Igual que arriba, el hook no se monta — se afirma sobre las
// funciones puras que `abandon()` y el `useEffect` de expirado comparten, que
// es la única forma de probar esto sin DOM/testing-library en core.
describe('currentExerciseAnalytics — contexto del ejercicio en curso (#823)', () => {
  const exercises: Exercise[] = [
    { ...base, id: 'bodyweight_squat', section: 'warmup' },
    { ...base, id: 'knee_push_up', section: 'main' },
    { ...base, id: 'glute_bridge' }, // sin `section` — ejercicio antiguo
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any

  it('un índice dentro de rango da índice, id y sección', () => {
    expect(currentExerciseAnalytics(exercises, 1)).toEqual({
      currentExerciseIndex: 1, currentExerciseId: 'knee_push_up', currentSection: 'main',
    })
  })

  // `stepIdx: 0` es el primer ejercicio, no "sin dato".
  it('el índice 0 no se trata como ausente', () => {
    expect(currentExerciseAnalytics(exercises, 0)).toEqual({
      currentExerciseIndex: 0, currentExerciseId: 'bodyweight_squat', currentSection: 'warmup',
    })
  })

  it('sin `section` en el ejercicio, cae a "main" (igual que `getCurrentSection`)', () => {
    expect(currentExerciseAnalytics(exercises, 2)).toMatchObject({ currentSection: 'main' })
  })

  // Una transición de sección puede dejar `stepIdx` un paso por delante del
  // último ejercicio: el índice viaja (es real), pero id/sección NO se
  // fabrican.
  it('un índice fuera de rango manda el índice pero no inventa id ni sección', () => {
    expect(currentExerciseAnalytics(exercises, 3)).toEqual({ currentExerciseIndex: 3 })
  })

  it('un índice negativo o no numérico no manda nada', () => {
    expect(currentExerciseAnalytics(exercises, -1)).toEqual({})
    expect(currentExerciseAnalytics(exercises, NaN)).toEqual({})
  })

  it('un entreno vacío no revienta', () => {
    expect(currentExerciseAnalytics([], 0)).toEqual({ currentExerciseIndex: 0 })
  })
})

describe('abandonPhase — fase de abandono (#823)', () => {
  it('deja pasar las fases de abandono tal cual', () => {
    expect(abandonPhase('exercise')).toBe('exercise')
    expect(abandonPhase('rest')).toBe('rest')
    expect(abandonPhase('note')).toBe('note')
    expect(abandonPhase('section-transition')).toBe('section-transition')
  })

  // No debería llegar nunca (el pestillo `claimOutcome` lo intercepta antes),
  // pero si llegase, se omite en vez de mandar una fase que no es de abandono.
  it('«celebrate» se omite en vez de mandarse como fase de abandono', () => {
    expect(abandonPhase('celebrate')).toBeUndefined()
  })
})

describe('abandonedWorkoutProperties — lo que manda `workout_abandoned` (#823)', () => {
  const exercises: Exercise[] = [
    { ...base, id: 'bodyweight_squat', section: 'main' },
    { ...base, id: 'knee_push_up', section: 'main' },
    { ...base, id: 'glute_bridge', section: 'main' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any

  // QA manual del issue: abandonar en el 2.º ejercicio (índice 1) de la
  // sesión curada del primer entreno.
  it('primer entreno curado, abandonado en el 2.º ejercicio: is_first_workout true e índice 1', () => {
    const key = firstWorkoutKey(1_700_000_000_000)
    const props = abandonedWorkoutProperties({
      workoutKey: key, source: 'free', startedAt: 1_700_000_000_000, endedAt: 1_700_000_090_000,
      exercises, progress: { stepIdx: 1, phase: 'exercise', setsCount: 1 },
      setsLogged: 1, reason: 'page_closed',
    })
    expect(props).toMatchObject({
      is_first_workout: true,
      current_exercise_index: 1,
      current_exercise_id: 'knee_push_up',
      current_section: 'main',
      current_phase: 'exercise',
      reason: 'page_closed',
    })
  })

  it('una sesión de programa normal no es el primer entreno', () => {
    const props = abandonedWorkoutProperties({
      workoutKey: 'p2_mie', source: 'program', startedAt: 0, endedAt: 0,
      exercises, progress: { stepIdx: 0, phase: 'rest', setsCount: 0 },
      setsLogged: 0, reason: 'expired',
    })
    expect(props).toMatchObject({ is_first_workout: false, current_phase: 'rest', current_exercise_index: 0 })
  })

  // Compatibilidad hacia atrás y privacidad (§6 del #636): los campos nuevos
  // son ids de catálogo y booleanos, nunca texto libre ni un objeto anidado.
  it('no expone nada identificable ni de forma libre', () => {
    const props = abandonedWorkoutProperties({
      workoutKey: 'p2_mie', source: 'program', startedAt: 0, endedAt: 0,
      exercises, progress: { stepIdx: 1, phase: 'exercise', setsCount: 1 },
      setsLogged: 1, reason: 'page_closed',
    })
    for (const forbidden of ['note', 'email', 'name', 'lat', 'lng', 'notes']) {
      expect(props).not.toHaveProperty(forbidden)
    }
    expect(Object.values(props).every(v => typeof v !== 'object' || v === null)).toBe(true)
  })
})
