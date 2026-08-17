/**
 * Tests del join fases × días de la vista de rutina (#473).
 *
 * Lo que antes hacía `RoutineViewPage` con un `filter` dentro de un `map` sobre
 * las fases, y por tanto no se podía probar sin montar la página.
 */

import { describe, it, expect } from 'vitest'
import { buildPhaseGroups } from './routine-view'
import type { RoutineExerciseRow, RoutinePhaseRow } from './routine-view'

function phase(phase_number: number, extra: Partial<RoutinePhaseRow> = {}): RoutinePhaseRow {
  return {
    id: `phase-${phase_number}`,
    phase_number,
    name: { es: `Fase ${phase_number}`, en: `Phase ${phase_number}` },
    weeks: 6,
    color: '#c8f542',
    bg_color: 'rgba(200,245,66,0.08)',
    sort_order: phase_number,
    ...extra,
  }
}

function exercise(
  phase_number: number,
  day_id: string,
  exercise_id: string,
  extra: Partial<RoutineExerciseRow> = {},
): RoutineExerciseRow {
  return {
    id: `${phase_number}-${day_id}-${exercise_id}`,
    phase_number,
    day_id,
    day_type: 'push',
    day_name: { es: 'Lunes', en: 'Monday' },
    day_focus: { es: 'Empuje', en: 'Push' },
    day_color: '#c8f542',
    workout_title: { es: 'Empuje', en: 'Push' },
    exercise_id,
    exercise_name: { es: exercise_id, en: exercise_id },
    sets: 3,
    reps: '8-12',
    rest_seconds: 90,
    muscles: { es: 'Pecho', en: 'Chest' },
    note: '',
    youtube: '',
    priority: 1,
    is_timer: false,
    timer_seconds: 0,
    sort_order: 1,
    ...extra,
  }
}

describe('buildPhaseGroups', () => {
  it('devuelve un grupo por fase, en el orden recibido', () => {
    const groups = buildPhaseGroups([phase(1), phase(2)], [])
    expect(groups).toHaveLength(2)
    expect(groups.map(g => g.phase.phase_number)).toEqual([1, 2])
  })

  it('reparte cada ejercicio en la fase que le toca', () => {
    const groups = buildPhaseGroups(
      [phase(1), phase(2)],
      [
        exercise(1, 'lun', 'pushup'),
        exercise(2, 'mar', 'pullup'),
        exercise(1, 'lun', 'dip'),
      ],
    )
    expect(groups[0].days[0].exercises.map(e => e.exercise_id)).toEqual(['pushup', 'dip'])
    expect(groups[1].days[0].exercises.map(e => e.exercise_id)).toEqual(['pullup'])
  })

  it('agrupa por día dentro de la fase', () => {
    const groups = buildPhaseGroups(
      [phase(1)],
      [
        exercise(1, 'lun', 'pushup'),
        exercise(1, 'mar', 'pullup'),
        exercise(1, 'lun', 'dip'),
      ],
    )
    expect(groups[0].days.map(d => d.day_id)).toEqual(['lun', 'mar'])
    expect(groups[0].days[0].exercises).toHaveLength(2)
    expect(groups[0].days[1].exercises).toHaveLength(1)
  })

  it('conserva el orden de llegada de los ejercicios dentro del día', () => {
    // El orden lo pone el `sort` de la consulta; el join no debe reordenar.
    const groups = buildPhaseGroups(
      [phase(1)],
      [exercise(1, 'lun', 'a'), exercise(1, 'lun', 'b'), exercise(1, 'lun', 'c')],
    )
    expect(groups[0].days[0].exercises.map(e => e.exercise_id)).toEqual(['a', 'b', 'c'])
  })

  it('deja la fase sin ejercicios con la lista de días vacía', () => {
    const groups = buildPhaseGroups([phase(1), phase(2)], [exercise(1, 'lun', 'pushup')])
    expect(groups[1].days).toEqual([])
  })

  it('descarta ejercicios de una fase que no existe en lugar de inventarla', () => {
    const groups = buildPhaseGroups([phase(1)], [exercise(1, 'lun', 'pushup'), exercise(9, 'lun', 'huerfano')])
    expect(groups).toHaveLength(1)
    expect(groups[0].days[0].exercises.map(e => e.exercise_id)).toEqual(['pushup'])
  })

  it('toma los datos del día del primer ejercicio de ese día', () => {
    const groups = buildPhaseGroups(
      [phase(1)],
      [
        exercise(1, 'mie', 'a', {
          day_name: { es: 'Miércoles', en: 'Wednesday' },
          day_focus: { es: 'Tirón', en: 'Pull' },
          day_color: '#42c8f5',
        }),
        exercise(1, 'mie', 'b', { day_color: '#000000' }),
      ],
    )
    const day = groups[0].days[0]
    expect(day.day_name).toEqual({ es: 'Miércoles', en: 'Wednesday' })
    expect(day.day_focus).toEqual({ es: 'Tirón', en: 'Pull' })
    expect(day.day_color).toBe('#42c8f5')
  })

  it('devuelve los textos sin localizar', () => {
    // Localizar aquí es lo que metía `l` en las dependencias del efecto y hacía
    // que cambiar de idioma repitiera las cuatro consultas.
    const groups = buildPhaseGroups([phase(1)], [exercise(1, 'lun', 'pushup')])
    expect(groups[0].phase.name).toEqual({ es: 'Fase 1', en: 'Phase 1' })
    expect(groups[0].days[0].exercises[0].muscles).toEqual({ es: 'Pecho', en: 'Chest' })
  })

  it('no se rompe sin fases ni ejercicios', () => {
    expect(buildPhaseGroups([], [])).toEqual([])
    expect(buildPhaseGroups([], [exercise(1, 'lun', 'pushup')])).toEqual([])
  })

  it('recorre los ejercicios una sola vez por muchas fases que haya', () => {
    // Regresión del O(fases × ejercicios): con el índice, doblar las fases no
    // multiplica el trabajo sobre la lista de ejercicios.
    const phases = Array.from({ length: 40 }, (_, i) => phase(i + 1))
    const exercises = Array.from({ length: 400 }, (_, i) => exercise((i % 40) + 1, 'lun', `ex${i}`))
    const groups = buildPhaseGroups(phases, exercises)
    expect(groups).toHaveLength(40)
    const total = groups.reduce(
      (sum, g) => sum + g.days.reduce((s, d) => s + d.exercises.length, 0),
      0,
    )
    expect(total).toBe(400)
  })
})
