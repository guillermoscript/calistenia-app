/**
 * check-program-content.test.mjs — Unit tests for checkProgram().
 *
 * Fixtures live in memory (no disk I/O): each test builds a minimal-but-valid
 * program doc via `baseProgram()` and mutates only the field under test, so a
 * failing assertion points at exactly one broken rule instead of a pile of
 * unrelated content gaps.
 *
 * `baseProgram()` uses real exercise-catalog ids (bodyweight, no equipment) and
 * a real `program-catalog.mjs` slug (`principiante-fundamentos`: generalist,
 * no declared equipment) so the catalog-cross-checks (#2, #6) exercise their
 * real lookup tables instead of a synthetic stand-in.
 *
 * Run with: pnpm --filter @calistenia/core exec vitest run ../../scripts/check-program-content.test.mjs
 * Or:       node --experimental-vm-modules packages/core/node_modules/.bin/vitest run scripts/check-program-content.test.mjs
 */

import { describe, it, expect } from 'vitest'
import { checkProgram } from './check-program-content.mjs'

const SLUG = 'principiante-fundamentos' // generalist, equipment_required: []

function exercise(overrides = {}) {
  return {
    sort_order: 1,
    name: 'Ejercicio de prueba',
    exercise_id: '90_degree_push_up',
    muscles: '',
    sets: 10,
    reps: '10',
    rest_seconds: 60,
    priority: 'primary',
    ...overrides,
  }
}

/** Programa mínimo que pasa las 9 comprobaciones sin errores ni avisos. */
function baseProgram() {
  return {
    program: {
      name: 'Principiante · Fundamentos',
      description: 'Programa de prueba',
      difficulty: 'beginner',
      duration_weeks: 8,
      instructions: { es: 'Sube el peso cuando completes todas las series.', en: 'Add weight once you complete every set.' },
    },
    phases: [
      {
        phase_number: 1,
        name: 'Fase 1',
        weeks: '1-4',
        days: [
          {
            day_id: 'lun',
            day_name: 'Lunes',
            exercises: [
              exercise({ sort_order: 1, name: '90° Push-up', exercise_id: '90_degree_push_up' }), // push
              exercise({ sort_order: 2, name: 'Arquero de pie', exercise_id: 'standing_archer' }), // pull
              exercise({ sort_order: 3, name: 'Abdominal con patada de piernas', exercise_id: 'kick_out_sit' }), // legs
            ],
          },
        ],
      },
    ],
  }
}

describe('checkProgram — programa correcto', () => {
  it('un programa bien formado no reporta errores', () => {
    const { errors } = checkProgram(SLUG, baseProgram())
    expect(errors).toEqual([])
  })
})

describe('checkProgram — exercise_id que no resuelve', () => {
  it('un id ausente del catálogo es un error', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].exercise_id = 'ejercicio_que_no_existe_en_el_catalogo'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('no resuelve contra el catálogo'))).toBe(true)
  })
})

describe('checkProgram — name como slug', () => {
  it('un nombre con forma de slug (snake_case) es un error', () => {
    const doc = baseProgram()
    doc.phases[0].days[0].exercises[0].name = 'pushup_std'
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('es un slug, no un nombre'))).toBe(true)
  })
})

describe('checkProgram — patrón de movimiento a 0 series', () => {
  it('0 series de push en un programa generalista es un error', () => {
    const doc = baseProgram()
    // Quita el ejercicio de push; deja solo pull y legs.
    doc.phases[0].days[0].exercises = doc.phases[0].days[0].exercises.filter(
      ex => ex.exercise_id !== '90_degree_push_up',
    )
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('0 series de push'))).toBe(true)
  })
})

describe('checkProgram — instructions vacío', () => {
  it('sin program.instructions es un error', () => {
    const doc = baseProgram()
    doc.program.instructions = ''
    const { errors } = checkProgram(SLUG, doc)
    expect(errors.some(e => e.includes('instructions vacío'))).toBe(true)
  })
})
