/**
 * Circuitos de un día de programa (#625).
 *
 * Hasta este issue `circuitConfig.exercises` salía vacío SIEMPRE, así que el
 * runner no tenía nada que ejecutar y la única rama que lo pintaba era
 * inalcanzable. Estos tests fijan las dos cosas que hacían falta: que los
 * ejercicios lleguen, y que lleguen los de la FASE correcta.
 */

import { describe, it, expect, vi } from 'vitest'
import type { RecordModel } from 'pocketbase'

// El módulo importa `pb` al evaluarse, que exige initCore(); las funciones bajo
// test son puras, así que basta con un doble mínimo del cliente.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { isValid: false }, files: { getURL: vi.fn() } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { buildCircuitDayConfigs, toCircuitExercises } from './usePrograms'

const dayConfig = (over: Record<string, unknown>): RecordModel => ({
  id: `dc-${String(over.day_id)}-${String(over.phase_number)}`,
  collectionId: 'program_day_config',
  collectionName: 'program_day_config',
  day_type: 'circuit',
  circuit_mode: 'circuit',
  circuit_rounds: 3,
  circuit_rest_between_exercises: 15,
  circuit_rest_between_rounds: 60,
  ...over,
} as unknown as RecordModel)

const exerciseRow = (over: Record<string, unknown>): RecordModel => ({
  id: `ex-${String(over.exercise_id)}-${String(over.phase_number)}`,
  collectionId: 'program_exercises',
  collectionName: 'program_exercises',
  is_timer: false,
  timer_seconds: 0,
  rest_seconds: 90,
  ...over,
} as unknown as RecordModel)

describe('toCircuitExercises', () => {
  it('mapea id, nombre y reps de `program_exercises`', () => {
    const out = toCircuitExercises([
      exerciseRow({
        day_id: 'lun', phase_number: 1,
        exercise_id: 'burpees', exercise_name: { es: 'Burpees', en: 'Burpees' }, reps: '10',
      }),
    ])
    expect(out).toEqual([{ exerciseId: 'burpees', name: { es: 'Burpees', en: 'Burpees' }, reps: '10' }])
  })

  it('deja el nombre CRUDO: es el json {es,en} que espera CircuitDefinition', () => {
    const [ex] = toCircuitExercises([
      exerciseRow({ exercise_id: 'plank', exercise_name: { es: 'Plancha', en: 'Plank' } }),
    ])
    expect(ex.name).toEqual({ es: 'Plancha', en: 'Plank' })
  })

  it('un ejercicio por tiempo aporta `workSecondsOverride` desde `timer_seconds`', () => {
    const [ex] = toCircuitExercises([
      exerciseRow({ exercise_id: 'plank', exercise_name: 'Plancha', is_timer: true, timer_seconds: 45 }),
    ])
    expect(ex.workSecondsOverride).toBe(45)
  })

  it('NO convierte `rest_seconds` en `restSecondsOverride`: es el descanso de fuerza', () => {
    // 90 s entre series de fuerza como override de circuito destrozaría la
    // cadencia; el descanso del circuito se configura a nivel de día.
    const [ex] = toCircuitExercises([
      exerciseRow({ exercise_id: 'burpees', exercise_name: 'Burpees', rest_seconds: 90 }),
    ])
    expect(ex.restSecondsOverride).toBeUndefined()
  })

  it('omite `reps` cuando la fila no lo trae', () => {
    const [ex] = toCircuitExercises([
      exerciseRow({ exercise_id: 'plank', exercise_name: 'Plancha', reps: '' }),
    ])
    expect(ex.reps).toBeUndefined()
  })
})

describe('buildCircuitDayConfigs', () => {
  it('indexa por `p{fase}_{día}` y trae los ejercicios de ese día', () => {
    const configs = buildCircuitDayConfigs(
      [dayConfig({ day_id: 'mie', phase_number: 1, circuit_rounds: 4 })],
      [
        exerciseRow({ day_id: 'mie', phase_number: 1, exercise_id: 'burpees', exercise_name: 'Burpees', reps: '10' }),
        exerciseRow({ day_id: 'mie', phase_number: 1, exercise_id: 'jump_squats', exercise_name: 'Sentadillas', reps: '15' }),
      ],
    )
    expect(Object.keys(configs)).toEqual(['p1_mie'])
    expect(configs.p1_mie.rounds).toBe(4)
    expect(configs.p1_mie.exercises.map(e => e.exerciseId)).toEqual(['burpees', 'jump_squats'])
  })

  it('no mezcla fases: cada clave lleva solo los ejercicios de la suya', () => {
    // Es exactamente el caso que `weekDays[].circuitConfig` no puede representar:
    // esa lista es plana y se queda con la fase más baja.
    const configs = buildCircuitDayConfigs(
      [
        dayConfig({ day_id: 'mie', phase_number: 1, circuit_rounds: 3 }),
        dayConfig({ day_id: 'mie', phase_number: 2, circuit_rounds: 5 }),
      ],
      [
        exerciseRow({ day_id: 'mie', phase_number: 1, exercise_id: 'burpees', exercise_name: 'Burpees' }),
        exerciseRow({ day_id: 'mie', phase_number: 2, exercise_id: 'pull_ups', exercise_name: 'Dominadas' }),
      ],
    )
    expect(configs.p1_mie.rounds).toBe(3)
    expect(configs.p1_mie.exercises.map(e => e.exerciseId)).toEqual(['burpees'])
    expect(configs.p2_mie.rounds).toBe(5)
    expect(configs.p2_mie.exercises.map(e => e.exerciseId)).toEqual(['pull_ups'])
  })

  it('no coge los ejercicios de OTRO día de la misma fase', () => {
    const configs = buildCircuitDayConfigs(
      [dayConfig({ day_id: 'mie', phase_number: 1 })],
      [
        exerciseRow({ day_id: 'lun', phase_number: 1, exercise_id: 'push_ups', exercise_name: 'Flexiones' }),
        exerciseRow({ day_id: 'mie', phase_number: 1, exercise_id: 'burpees', exercise_name: 'Burpees' }),
      ],
    )
    expect(configs.p1_mie.exercises.map(e => e.exerciseId)).toEqual(['burpees'])
  })

  it('ignora los días que no son de circuito', () => {
    const configs = buildCircuitDayConfigs(
      [
        dayConfig({ day_id: 'lun', phase_number: 1, day_type: 'push' }),
        dayConfig({ day_id: 'mar', phase_number: 1, day_type: 'cardio' }),
      ],
      [exerciseRow({ day_id: 'lun', phase_number: 1, exercise_id: 'push_ups', exercise_name: 'Flexiones' })],
    )
    expect(configs).toEqual({})
  })

  it('un día de circuito sin ejercicios sigue saliendo, con la lista vacía', () => {
    // Sale igualmente para que la UI pueda decir «configura ejercicios» en vez
    // de caer a la pantalla de fuerza.
    const configs = buildCircuitDayConfigs([dayConfig({ day_id: 'vie', phase_number: 1 })], [])
    expect(configs.p1_vie.exercises).toEqual([])
  })

  it('rellena los valores por defecto que falten en la fila de configuración', () => {
    const configs = buildCircuitDayConfigs(
      [{ id: 'dc1', day_id: 'jue', phase_number: 1, day_type: 'circuit' } as unknown as RecordModel],
      [],
    )
    expect(configs.p1_jue).toMatchObject({
      mode: 'circuit',
      rounds: 3,
      restBetweenExercises: 0,
      restBetweenRounds: 60,
    })
  })

  it('conserva el modo cronometrado y sus tiempos', () => {
    const configs = buildCircuitDayConfigs(
      [dayConfig({
        day_id: 'vie', phase_number: 2, circuit_mode: 'timed',
        circuit_work_seconds: 40, circuit_rest_seconds: 20,
      })],
      [],
    )
    expect(configs.p2_vie).toMatchObject({ mode: 'timed', workSeconds: 40, restSeconds: 20 })
  })
})
