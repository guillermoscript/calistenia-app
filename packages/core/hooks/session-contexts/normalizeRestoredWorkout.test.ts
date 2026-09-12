/**
 * Sesión a medias empezada ANTES del arreglo del #690.
 *
 * El entreno vive congelado en el snapshot de la sesión (storage local y
 * registro `active_sessions`), y nadie vuelve a consultar el programa mientras
 * dura. Estos tests fijan que al restaurarlo se repase, y —lo más importante—
 * que el repaso no toque `id`: es la clave con la que se guardan series, PRs y
 * overrides de descanso.
 */
import { describe, it, expect } from 'vitest'
import type { CircuitDefinition, Exercise, Workout } from '../../types'
import { getOrLoadCatalogIndex } from '../../lib/catalogIndex'
import { localize } from '../../lib/i18n-db'
import { normalizeRestoredCircuit, normalizeRestoredWorkout } from './normalizeRestoredWorkout'

// El nombre esperado se LEE del catálogo, no se escribe a mano: el contenido
// del catálogo se retoca (traducciones, #689) y un literal aquí convertiría
// este test en un guardián del copy en vez de del repaso del snapshot.
const catalogName = (id: string, locale = 'es') =>
  localize(getOrLoadCatalogIndex()?.byId.get(id)?.name, locale)

const exercise = (over: Partial<Exercise>): Exercise => ({
  id: 'lun_1_1',
  name: 'Plancha lateral',
  sets: 3,
  reps: '10',
  rest: 90,
  muscles: 'Core',
  note: '',
  youtube: '',
  priority: 'med' as Exercise['priority'],
  isTimer: false,
  timerSeconds: 0,
  ...over,
})

const workout = (exercises: Exercise[]): Workout => ({
  phase: 1, day: 'lun', title: 'Empuje', exercises,
})

describe('normalizeRestoredWorkout', () => {
  it('un snapshot con slug y `reps` de duración sale con nombre de catálogo y cronómetro', () => {
    const w = workout([exercise({
      id: 'lun_1_1', name: 'arm_circles', isTimer: false, timerSeconds: 0, reps: '30-45 seg',
    })])
    const ex = normalizeRestoredWorkout(w, 'es').exercises[0]
    expect(ex.name).toBe(catalogName('arm_circles'))
    expect(ex.name).not.toBe('arm_circles')
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
  })

  it('el `id` del snapshot NO cambia — es la clave del historial de series', () => {
    const w = workout([exercise({ id: 'lun_1_1', name: 'arm_circles', reps: '30-45 seg' })])
    expect(normalizeRestoredWorkout(w, 'es').exercises[0].id).toBe('lun_1_1')
  })

  it('el `reps` original se conserva: es el texto que lee la persona', () => {
    const w = workout([exercise({ name: 'plank', reps: '20-30s por lado' })])
    const ex = normalizeRestoredWorkout(w, 'es').exercises[0]
    expect(ex.reps).toBe('20-30s por lado')
    expect(ex.timerSeconds).toBe(30)
  })

  it('un snapshot ya sano vuelve con LA MISMA referencia (no re-renderiza ni reescribe)', () => {
    const w = workout([exercise({ name: 'Plancha lateral', reps: '10', isTimer: false, timerSeconds: 0 })])
    expect(normalizeRestoredWorkout(w, 'es')).toBe(w)
    expect(normalizeRestoredWorkout(w, 'es').exercises[0]).toBe(w.exercises[0])
  })

  it('un nombre escrito por una persona pasa intacto aunque el id sea de catálogo', () => {
    const w = workout([exercise({ id: 'plank', name: 'Plancha con mi apodo', reps: '10' })])
    expect(normalizeRestoredWorkout(w, 'es').exercises[0].name).toBe('Plancha con mi apodo')
  })

  it('un `timerSeconds` ya guardado manda sobre lo deducido', () => {
    const w = workout([exercise({ name: 'Plancha', reps: '30-45 seg', isTimer: false, timerSeconds: 20 })])
    const ex = normalizeRestoredWorkout(w, 'es').exercises[0]
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(20)
  })

  it('un `reps` que NO es una duración pura no inventa cronómetro', () => {
    const w = workout([exercise({ name: 'Plancha', reps: '6x10s hold' })])
    const ex = normalizeRestoredWorkout(w, 'es').exercises[0]
    expect(ex.isTimer).toBe(false)
    expect(ex.timerSeconds).toBe(0)
  })

  it('sólo cambia el ejercicio afectado; los demás conservan su referencia', () => {
    const sano = exercise({ id: 'lun_1_2', name: 'Dominadas', reps: '8' })
    const roto = exercise({ id: 'lun_1_1', name: 'arm_circles', reps: '45s' })
    const w = workout([sano, roto])
    const out = normalizeRestoredWorkout(w, 'es')
    expect(out).not.toBe(w)
    expect(out.exercises[0]).toBe(sano)
    expect(out.exercises[1]).not.toBe(roto)
  })
})

const circuit = (exercises: CircuitDefinition['exercises']): CircuitDefinition => ({
  id: 'lun_circuit',
  name: { es: 'Circuito', en: 'Circuit' },
  mode: 'timed',
  exercises,
  rounds: 3,
  restBetweenExercises: 15,
  restBetweenRounds: 60,
})

describe('normalizeRestoredCircuit', () => {
  it('una estación con slug y `reps` de duración sale con nombre de catálogo y trabajo', () => {
    const c = circuit([{ exerciseId: 'lun_1_1', name: 'arm_circles', reps: '45s' }])
    const ex = normalizeRestoredCircuit(c).exercises[0]
    expect(ex.name).toEqual(getOrLoadCatalogIndex()!.byId.get('arm_circles')!.name)
    expect(ex.workSecondsOverride).toBe(45)
    expect(ex.exerciseId).toBe('lun_1_1')
  })

  it('un override ya guardado manda sobre lo deducido', () => {
    const c = circuit([{ exerciseId: 'plank', name: { es: 'Plancha', en: 'Plank' }, reps: '45s', workSecondsOverride: 20 }])
    expect(normalizeRestoredCircuit(c).exercises[0].workSecondsOverride).toBe(20)
  })

  it('un circuito ya sano vuelve con LA MISMA referencia', () => {
    const c = circuit([{ exerciseId: 'lun_1_1', name: { es: 'Plancha', en: 'Plank' }, reps: '10', workSecondsOverride: 30 }])
    expect(normalizeRestoredCircuit(c)).toBe(c)
  })
})
