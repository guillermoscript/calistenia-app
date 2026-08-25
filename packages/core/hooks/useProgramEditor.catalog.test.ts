/**
 * Campos de catálogo del editor de programas (#613).
 *
 * Va en un fichero propio y no en `useProgramEditor.test.ts` porque ese lo está
 * creando el PR #630 (#610), todavía abierto: dos ramas añadiendo el mismo
 * fichero chocarían al mezclar.
 *
 * Lo que se afirma aquí es la cadena entera que el issue denuncia rota: lo que
 * el editor construye tiene que ser suficiente para que `matchPrograms` —el
 * «PARA TI» del onboarding— recomiende el programa. Por eso el test no se
 * conforma con comprobar que `buildProgramCatalogFields` devuelve las claves
 * correctas: monta el `ProgramMeta` con esos valores y lo pasa por el matcher
 * de verdad, que es quien tiene la última palabra.
 */
import { describe, it, expect, vi } from 'vitest'

// Importar el hook arrastra `lib/pocketbase`, que en el arranque pide un
// `initCore()` que en Node no existe. El stub solo sirve para que el módulo se
// pueda importar: todo lo que se ejercita aquí abajo es puro y no toca la red.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})), authStore: { record: null } },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import {
  buildProgramCatalogFields,
  deriveDaysPerWeek,
  type EditorDay,
  type ProgramEditorState,
} from './useProgramEditor'
import { matchUserToPrograms } from '../lib/matchPrograms'
import type { ProgramMeta } from '../types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeInfo(overrides: Partial<ProgramEditorState['info']> = {}): ProgramEditorState['info'] {
  return {
    name: 'Mi programa',
    description: '',
    durationWeeks: 12,
    isOfficial: false,
    visibility: 'public',
    difficulty: 'beginner',
    goalType: '',
    skill: '',
    intensity: '',
    daysPerWeek: null,
    equipmentRequired: [],
    contraindications: [],
    ...overrides,
  }
}

function day(dayId: string, type: string): EditorDay {
  return { dayId, dayName: dayId, focus: '', type, color: '#fff', exercises: [] }
}

/**
 * Días de una fase. `types` va en orden de lunes a domingo, y las claves salen
 * como `${phaseIndex}_${dayId}`, que es la forma que usa el editor.
 */
function makeDays(phaseIndex: number, types: string[]): Record<string, EditorDay> {
  const ids = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
  const days: Record<string, EditorDay> = {}
  types.forEach((type, i) => {
    days[`${phaseIndex}_${ids[i]}`] = day(ids[i], type)
  })
  return days
}

const FIVE_TRAINING_DAYS = ['push', 'pull', 'legs', 'full', 'core', 'rest', 'rest']

/** Convierte lo que el editor manda a PocketBase en el `ProgramMeta` que lee el catálogo. */
function asProgramMeta(id: string, info: ProgramEditorState['info'], fields: Record<string, unknown>): ProgramMeta {
  return {
    id,
    name: info.name,
    description: info.description,
    duration_weeks: info.durationWeeks,
    difficulty: info.difficulty,
    goal_type: (fields.goal_type as ProgramMeta['goal_type']) || undefined,
    skill: (fields.skill as ProgramMeta['skill']) || undefined,
    intensity: (fields.intensity as ProgramMeta['intensity']) || undefined,
    days_per_week: typeof fields.days_per_week === 'number' ? fields.days_per_week : undefined,
    equipment_required: fields.equipment_required as string[] | undefined,
    contraindications: fields.contraindications as string[] | undefined,
  }
}

// ─── El test que pide el issue ───────────────────────────────────────────────

describe('un programa guardado desde el editor entra en matchPrograms', () => {
  it('sale como primary para el usuario cuyo objetivo y nivel coinciden', () => {
    // Lo que un autor rellenaría en el paso 1 del editor.
    const info = makeInfo({ difficulty: 'intermediate', goalType: 'muscle_gain' })
    const days = makeDays(0, FIVE_TRAINING_DAYS)

    const saved = asProgramMeta('mi-programa', info, buildProgramCatalogFields(info, days))

    const result = matchUserToPrograms(
      { level: 'intermedio', primary_goal: 'ganar_musculo', training_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      [saved],
    )

    expect(result.primary?.id).toBe('mi-programa')
    // Cinco días entrenados contra cinco días disponibles: sin penalización.
    expect(result.penalties.get('mi-programa')).toBeUndefined()
  })

  it('NO sale cuando el autor deja el objetivo sin fijar — que es el estado de hoy', () => {
    // Este es exactamente el bug de #613: sin `goal_type` el programa existe,
    // se guarda y se ve en el catálogo, pero el matcher no puede elegirlo nunca.
    const info = makeInfo({ difficulty: 'intermediate' })
    const saved = asProgramMeta('sin-objetivo', info, buildProgramCatalogFields(info, makeDays(0, FIVE_TRAINING_DAYS)))

    const result = matchUserToPrograms(
      { level: 'intermedio', primary_goal: 'ganar_musculo' },
      [saved],
    )

    expect(result.primary).toBeNull()
  })

  it('un programa de skill sale como secondary del foco correspondiente', () => {
    const info = makeInfo({ goalType: 'skill', skill: 'handstand', difficulty: 'beginner' })
    const saved = asProgramMeta('skill-handstand', info, buildProgramCatalogFields(info, makeDays(0, FIVE_TRAINING_DAYS)))

    const result = matchUserToPrograms(
      { level: 'principiante', primary_goal: 'habilidades', focus_areas: ['handstand'] },
      [saved],
    )

    expect(result.secondary?.id).toBe('skill-handstand')
  })

  it('las contraindicaciones elegidas en el editor penalizan a quien las tiene', () => {
    const info = makeInfo({ difficulty: 'beginner', goalType: 'maintain', contraindications: ['lower_back'] })
    const saved = asProgramMeta('con-contra', info, buildProgramCatalogFields(info, makeDays(0, FIVE_TRAINING_DAYS)))

    const result = matchUserToPrograms(
      { level: 'principiante', primary_goal: 'salud_general', injuries: ['lower_back'], training_days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      [saved],
    )

    expect(result.primary?.id).toBe('con-contra')
    expect(result.penalties.get('con-contra')).toContain('health_flag')
  })
})

// ─── Derivación de days_per_week ─────────────────────────────────────────────

describe('deriveDaysPerWeek', () => {
  it('cuenta los días no-rest de la fase 1', () => {
    expect(deriveDaysPerWeek(makeDays(0, FIVE_TRAINING_DAYS))).toBe(5)
  })

  it('ignora las fases que no son la primera', () => {
    const days = { ...makeDays(0, ['push', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']), ...makeDays(1, FIVE_TRAINING_DAYS) }
    expect(deriveDaysPerWeek(days)).toBe(1)
  })

  it('devuelve 0 cuando la fase 1 es todo descanso', () => {
    expect(deriveDaysPerWeek(makeDays(0, ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest']))).toBe(0)
  })
})

describe('buildProgramCatalogFields — days_per_week', () => {
  it('deriva de la fase 1 mientras el autor no lo toque', () => {
    const fields = buildProgramCatalogFields(makeInfo(), makeDays(0, FIVE_TRAINING_DAYS))
    expect(fields.days_per_week).toBe(5)
  })

  it('una elección explícita gana sobre la derivada', () => {
    const fields = buildProgramCatalogFields(makeInfo({ daysPerWeek: 3 }), makeDays(0, FIVE_TRAINING_DAYS))
    expect(fields.days_per_week).toBe(3)
  })

  // PB aceptaría también el 0 (el campo no es `required`, así que se salta el
  // `min: 1`), pero `null` es lo que distingue «no lo sé» de «entrena 0 días».
  it('manda null en vez de 0 cuando no hay ni un día de entrenamiento', () => {
    const allRest = makeDays(0, ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'])
    const fields = buildProgramCatalogFields(makeInfo(), allRest)
    expect(fields.days_per_week).toBeNull()
  })

  it('no se pasa del tope de 7 del esquema', () => {
    const fields = buildProgramCatalogFields(makeInfo({ daysPerWeek: 9 }), makeDays(0, FIVE_TRAINING_DAYS))
    expect(fields.days_per_week).toBe(7)
  })
})

// ─── skill colgando de goal_type ─────────────────────────────────────────────

describe('buildProgramCatalogFields — skill', () => {
  it('conserva la skill cuando el objetivo es skill', () => {
    const fields = buildProgramCatalogFields(makeInfo({ goalType: 'skill', skill: 'planche' }), {})
    expect(fields.skill).toBe('planche')
  })

  it('la limpia cuando el objetivo ya no es skill', () => {
    // Si se arrastrara, el programa seguiría saliendo como match secundario de
    // una habilidad que ya no entrena.
    const fields = buildProgramCatalogFields(makeInfo({ goalType: 'fat_loss', skill: 'planche' }), {})
    expect(fields.skill).toBe('')
  })
})

// ─── Equipo y contraindicaciones ─────────────────────────────────────────────

describe('buildProgramCatalogFields — listas', () => {
  it('pasa equipo y contraindicaciones tal cual', () => {
    const info = makeInfo({ equipmentRequired: ['barra_dominadas', 'anillas'], contraindications: ['shoulder', 'hypertension'] })
    const fields = buildProgramCatalogFields(info, {})
    expect(fields.equipment_required).toEqual(['barra_dominadas', 'anillas'])
    expect(fields.contraindications).toEqual(['shoulder', 'hypertension'])
  })

  it('manda listas vacías, no undefined, para poder vaciarlas al editar', () => {
    const fields = buildProgramCatalogFields(makeInfo(), {})
    expect(fields.equipment_required).toEqual([])
    expect(fields.contraindications).toEqual([])
  })
})
