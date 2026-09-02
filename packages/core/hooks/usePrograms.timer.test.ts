/**
 * Cronómetro deducido en el mapa de entrenamientos (#690).
 *
 * Producción tiene filas de `program_exercises` con `is_timer: false`,
 * `timer_seconds: 0` y la duración escrita en `reps` («30-45 seg»). La pantalla
 * de ejercicio sólo pinta el cronómetro cuando `isTimer` es cierto, así que el
 * usuario leía los segundos y no tenía nada que los contara. Estos tests fijan
 * las dos mitades: que la duración se deduzca, y que NO se toque nada más.
 */

import { describe, it, expect, vi } from 'vitest'
import type { RecordModel } from 'pocketbase'

// Igual que en `usePrograms.circuit.test.ts`: el módulo importa `pb` al
// evaluarse, y las funciones bajo test son puras.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { isValid: false }, files: { getURL: vi.fn() } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { buildWorkoutsMap, toCircuitExercises } from './usePrograms'

const row = (over: Record<string, unknown>): RecordModel => ({
  id: `ex-${String(over.exercise_id)}`,
  collectionId: 'program_exercises',
  collectionName: 'program_exercises',
  phase_number: 1,
  day_id: 'lun',
  workout_title: { es: 'Empuje', en: 'Push' },
  sets: 3,
  reps: '10',
  rest_seconds: 90,
  priority: 1,
  is_timer: false,
  timer_seconds: 0,
  ...over,
} as unknown as RecordModel)

const first = (records: RecordModel[]) => buildWorkoutsMap(records).p1_lun.exercises[0]

describe('buildWorkoutsMap — cronómetro deducido', () => {
  it('una fila mal sembrada («30-45 seg», is_timer false) sale como ejercicio por tiempo', () => {
    const ex = first([row({ exercise_id: 'plank', exercise_name: 'Plancha', reps: '30-45 seg' })])
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
  })

  it('el `reps` original se conserva: es lo que lee la persona', () => {
    const ex = first([row({ exercise_id: 'plank', exercise_name: 'Plancha', reps: '20-30s por lado' })])
    expect(ex.reps).toBe('20-30s por lado')
    expect(ex.timerSeconds).toBe(30)
  })

  it('no toca `id` ni `name`', () => {
    const ex = first([row({ exercise_id: 'lun_1_9', exercise_name: 'Plancha lateral', reps: '45s' })])
    expect(ex.id).toBe('lun_1_9')
    expect(ex.name).toBe('Plancha lateral')
  })

  it('un `timer_seconds` ya guardado manda sobre lo deducido', () => {
    const ex = first([row({ exercise_id: 'plank', exercise_name: 'Plancha', reps: '30-45 seg', timer_seconds: 20 })])
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(20)
  })

  it('una fila correcta se respeta tal cual', () => {
    const ex = first([row({ exercise_id: 'plank', exercise_name: 'Plancha', reps: '45s', is_timer: true, timer_seconds: 45 })])
    expect(ex.isTimer).toBe(true)
    expect(ex.timerSeconds).toBe(45)
  })

  it('un ejercicio de repeticiones se queda SIN cronómetro', () => {
    const ex = first([row({ exercise_id: 'pushups', exercise_name: 'Flexiones', reps: '12-15' })])
    expect(ex.isTimer).toBe(false)
    expect(ex.timerSeconds).toBe(0)
  })

  it('«6x10s hold» son series de aguante, no una duración de serie', () => {
    const ex = first([row({ exercise_id: 'lsit', exercise_name: 'L-sit', reps: '6x10s hold' })])
    expect(ex.isTimer).toBe(false)
  })
})

describe('toCircuitExercises — cronómetro deducido', () => {
  it('una estación con la duración sólo en `reps` aporta `workSecondsOverride`', () => {
    const [ex] = toCircuitExercises([row({ exercise_id: 'plank', exercise_name: 'Plancha', reps: '40s' })])
    expect(ex.workSecondsOverride).toBe(40)
  })

  it('una estación de repeticiones no aporta ningún trabajo cronometrado', () => {
    const [ex] = toCircuitExercises([row({ exercise_id: 'burpees', exercise_name: 'Burpees', reps: '10' })])
    expect(ex.workSecondsOverride).toBeUndefined()
  })
})
