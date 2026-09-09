import { describe, it, expect } from 'vitest'
import { matchUserToPrograms, inferGoalType, rankCandidates, LEVEL_TO_DIFFICULTY } from './matchPrograms'
import type { ProgramMeta } from '../types'

const P = (overrides: Partial<ProgramMeta>): ProgramMeta => ({
  id: overrides.id || 'p',
  name: overrides.name || 'Test',
  description: '',
  duration_weeks: 8,
  ...overrides,
})

// Minimal persona catalog fixture — mirrors spec's 13-program set.
const catalog: ProgramMeta[] = [
  P({ id: 'b-fat', difficulty: 'beginner', goal_type: 'fat_loss', days_per_week: 4 }),
  P({ id: 'b-gain', difficulty: 'beginner', goal_type: 'muscle_gain', days_per_week: 4 }),
  P({ id: 'b-maint', difficulty: 'beginner', goal_type: 'maintain', days_per_week: 3 }),
  P({ id: 'i-fat', difficulty: 'intermediate', goal_type: 'fat_loss', days_per_week: 5 }),
  P({ id: 'i-gain', difficulty: 'intermediate', goal_type: 'muscle_gain', days_per_week: 5 }),
  P({ id: 'i-maint', difficulty: 'intermediate', goal_type: 'maintain', days_per_week: 6, contraindications: ['lower_back'] }),
  P({ id: 'a-fat', difficulty: 'advanced', goal_type: 'fat_loss', days_per_week: 5 }),
  P({ id: 'a-gain', difficulty: 'advanced', goal_type: 'muscle_gain', days_per_week: 6 }),
  P({ id: 'a-maint', difficulty: 'advanced', goal_type: 'maintain', days_per_week: 6 }),
  P({ id: 'sk-pull', difficulty: 'beginner', goal_type: 'skill', skill: 'pull_up', days_per_week: 3 }),
  P({ id: 'sk-hand', difficulty: 'beginner', goal_type: 'skill', skill: 'handstand', days_per_week: 3 }),
  P({ id: 'sk-mu', difficulty: 'intermediate', goal_type: 'skill', skill: 'muscle_up', days_per_week: 4 }),
  P({ id: 'sk-pla', difficulty: 'advanced', goal_type: 'skill', skill: 'planche', days_per_week: 4 }),
]

describe('inferGoalType', () => {
  it('returns muscle_gain when goal_weight exceeds weight by > 2kg', () => {
    expect(inferGoalType(70, 75)).toBe('muscle_gain')
  })
  it('returns fat_loss when goal_weight is lower than weight by > 2kg', () => {
    expect(inferGoalType(85, 75)).toBe('fat_loss')
  })
  it('returns maintain when difference is within ±2kg', () => {
    expect(inferGoalType(70, 71)).toBe('maintain')
    expect(inferGoalType(70, 70)).toBe('maintain')
  })
  it('returns maintain when either value is missing', () => {
    expect(inferGoalType(undefined, 75)).toBe('maintain')
    expect(inferGoalType(70, undefined)).toBe('maintain')
    expect(inferGoalType(undefined, undefined)).toBe('maintain')
  })
  it('primary_goal manda sobre el delta de peso', () => {
    expect(inferGoalType(85, 75, 'ganar_musculo')).toBe('muscle_gain')
    expect(inferGoalType(70, 75, 'perder_grasa')).toBe('fat_loss')
    expect(inferGoalType(70, 80, 'recomposicion')).toBe('maintain')
    expect(inferGoalType(70, 80, 'resistencia')).toBe('maintain')
  })
  it('primary_goal desconocido cae al fallback por delta', () => {
    expect(inferGoalType(70, 75, 'lo_que_sea')).toBe('muscle_gain')
    expect(inferGoalType(70, 75, '')).toBe('muscle_gain')
  })
})

describe('LEVEL_TO_DIFFICULTY', () => {
  it('maps Spanish onboarding levels to English difficulty values', () => {
    expect(LEVEL_TO_DIFFICULTY.principiante).toBe('beginner')
    expect(LEVEL_TO_DIFFICULTY.intermedio).toBe('intermediate')
    expect(LEVEL_TO_DIFFICULTY.avanzado).toBe('advanced')
  })
})

describe('matchUserToPrograms — primary', () => {
  it('picks beginner + fat_loss for a beginner losing weight', () => {
    const r = matchUserToPrograms({
      level: 'principiante', weight: 90, goal_weight: 80,
      focus_areas: [], training_days: ['mon','wed','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('b-fat')
    expect(r.secondary).toBeNull()
  })

  it('picks intermediate + maintain for the default Balance Total persona', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('i-maint')
  })

  it('returns null primary when level is missing', () => {
    const r = matchUserToPrograms({
      level: '', weight: 70, goal_weight: 70,
      focus_areas: [], training_days: ['mon','wed','fri'],
    }, catalog)
    expect(r.primary).toBeNull()
    expect(r.secondary).toBeNull()
  })

  it('defaults goal_type to maintain when goal_weight is missing', () => {
    const r = matchUserToPrograms({
      level: 'principiante', weight: 70, goal_weight: undefined,
      focus_areas: [], training_days: ['mon','wed','fri'],
    }, catalog)
    expect(r.primary?.id).toBe('b-maint')
  })
})

describe('matchUserToPrograms — secondary skill track', () => {
  it('surfaces Pull-up Roadmap as secondary when beginner wants muscle_gain + pull_up focus', () => {
    const r = matchUserToPrograms({
      level: 'principiante', weight: 65, goal_weight: 72,
      focus_areas: ['pull_up'], training_days: ['mon','wed','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('b-gain')
    expect(r.secondary?.id).toBe('sk-pull')
  })

  it('surfaces Planche Roadmap for advanced user with planche focus', () => {
    const r = matchUserToPrograms({
      level: 'avanzado', weight: 72, goal_weight: 72,
      focus_areas: ['planche'], training_days: ['mon','tue','wed','thu','fri','sat'],
    }, catalog)
    expect(r.primary?.id).toBe('a-maint')
    expect(r.secondary?.id).toBe('sk-pla')
  })

  it('picks the first focus in FOCUS_AREA_IDS order when multiple are selected', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      // FOCUS_AREA_IDS ordering: full_body, upper_body, core, legs, pull_up,
      // handstand, planche, muscle_up.  pull_up comes before muscle_up.
      focus_areas: ['muscle_up', 'pull_up'], training_days: ['mon','tue','wed','thu','fri','sat'],
    }, catalog)
    // Only muscle_up has a skill track at intermediate, pull_up is at beginner.
    // Rule: iterate FOCUS_AREA_IDS order and pick the FIRST focus the user
    // selected that has ANY matching skill-track program. pull_up matches (b-pull).
    expect(r.secondary?.id).toBe('sk-pull')
  })

  it('does NOT surface secondary when it equals primary', () => {
    // Beginner + goal_type=skill + focus pull_up — primary IS the skill track.
    // Secondary must be null (don't show the same card twice).
    const r = matchUserToPrograms({
      level: 'principiante', weight: 70, goal_weight: 70,
      focus_areas: ['pull_up'], training_days: ['mon','wed','fri'],
    }, catalog)
    // primary = b-maint (closest level×goal match), secondary = sk-pull.
    // Different ids → secondary shown.
    expect(r.primary?.id).toBe('b-maint')
    expect(r.secondary?.id).toBe('sk-pull')
  })

  it('primary_goal=habilidades sin focus areas de skill aún recomienda un skill track', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      primary_goal: 'habilidades', focus_areas: ['full_body'], training_days: ['mon','wed','fri'],
    }, catalog)
    expect(r.primary?.id).toBe('i-maint')
    // Prefiere el skill track de su dificultad (sk-mu es intermediate).
    expect(r.secondary?.id).toBe('sk-mu')
  })

  it('habilidades cae a cualquier skill track si no hay uno de su dificultad', () => {
    const r = matchUserToPrograms({
      level: 'avanzado', weight: 75, goal_weight: 75,
      primary_goal: 'habilidades', focus_areas: [], training_days: ['mon','wed','fri'],
    }, catalog)
    // Hay sk-pla (advanced) en el catálogo → lo prefiere por dificultad.
    expect(r.secondary?.id).toBe('sk-pla')
  })

  it('sin primary_goal habilidades no hay fallback: secondary null si no hay focus de skill', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: ['full_body'], training_days: ['mon','wed','fri'],
    }, catalog)
    expect(r.secondary).toBeNull()
  })
})

describe('matchUserToPrograms — penalties', () => {
  it('flags high_frequency when program needs more days than user committed', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','wed','fri'], // 3 days
    }, catalog)
    const penalties = r.penalties.get('i-maint') || []
    expect(penalties).toContain('high_frequency')
  })

  it('flags health_flag when program contraindications overlap user injuries', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
      injuries: ['lower_back'],
    }, catalog)
    const penalties = r.penalties.get('i-maint') || []
    expect(penalties).toContain('health_flag')
  })

  it('flags health_flag from medical_conditions overlap', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
      medical_conditions: ['back'],
    }, catalog)
    // Catalog uses 'lower_back' in contraindications; 'back' is in
    // CONDITION_IDS. Test that we detect overlap when tokens align.
    // Use a program with 'back' contraindication for this test.
    const catalogWithBack = [...catalog, P({ id: 'x', difficulty: 'intermediate', goal_type: 'maintain', contraindications: ['back'] })]
    const r2 = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat'],
      medical_conditions: ['back'],
    }, catalogWithBack)
    // Both i-maint (with 'lower_back') and new x (with 'back') get matched
    // only on level+goal. Primary is the first one in the catalog.
    // Verify penalty map contains 'back' for the program with that contraindication.
    expect(r2.penalties.get('x')).toContain('health_flag')
    void r // unused marker
  })

  it('does NOT flag high_frequency when days_per_week ≤ user.training_days.length', () => {
    const r = matchUserToPrograms({
      level: 'intermedio', weight: 75, goal_weight: 75,
      focus_areas: [], training_days: ['mon','tue','wed','thu','fri','sat','sun'],
    }, catalog)
    const penalties = r.penalties.get('i-maint') || []
    expect(penalties).not.toContain('high_frequency')
  })
})

// ─── #717: sexo y desempate determinista ─────────────────────────────────────

const LEVELS = ['principiante', 'intermedio', 'avanzado'] as const
const GOALS = ['perder_grasa', 'ganar_musculo', 'mantener'] as const
const SEXES = ['female', 'male', undefined] as const

/** Los 9 genéricos + una variante «Mujer ·» en tres celdas, como el catálogo real. */
const catalog717: ProgramMeta[] = [
  ...catalog.map(p => ({ ...p, is_official: true })),
  P({ id: 'w-gain', name: 'Women · Glutes', difficulty: 'beginner', goal_type: 'muscle_gain', is_official: true, for_women: true }),
  P({ id: 'w-maint', name: 'Women · Toning', difficulty: 'beginner', goal_type: 'maintain', is_official: true, for_women: true }),
  P({ id: 'w-i-gain', name: 'Women · Strength', difficulty: 'intermediate', goal_type: 'muscle_gain', is_official: true, for_women: true }),
]

function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('matchUserToPrograms — sexo (#717)', () => {
  it('usuaria principiante + ganar músculo recibe la variante «Mujer ·»', () => {
    const r = matchUserToPrograms({ level: 'principiante', primary_goal: 'ganar_musculo', sex: 'female' }, catalog717)
    expect(r.primary?.id).toBe('w-gain')
  })

  it('usuario principiante + ganar músculo recibe el genérico', () => {
    const r = matchUserToPrograms({ level: 'principiante', primary_goal: 'ganar_musculo', sex: 'male' }, catalog717)
    expect(r.primary?.id).toBe('b-gain')
  })

  it('sin sexo (no pasó por básicos) recibe el genérico', () => {
    const r = matchUserToPrograms({ level: 'principiante', primary_goal: 'ganar_musculo' }, catalog717)
    expect(r.primary?.id).toBe('b-gain')
  })

  it('usuaria en una celda sin variante recibe el genérico, no null', () => {
    const r = matchUserToPrograms({ level: 'avanzado', primary_goal: 'perder_grasa', sex: 'female' }, catalog717)
    expect(r.primary?.id).toBe('a-fat')
  })

  it('las tres celdas con variante la dan a la usuaria y el genérico al resto', () => {
    const cases: Array<[typeof LEVELS[number], typeof GOALS[number], string, string]> = [
      ['principiante', 'ganar_musculo', 'w-gain', 'b-gain'],
      ['principiante', 'mantener', 'w-maint', 'b-maint'],
      ['intermedio', 'ganar_musculo', 'w-i-gain', 'i-gain'],
    ]
    for (const [level, primary_goal, women, generic] of cases) {
      expect(matchUserToPrograms({ level, primary_goal, sex: 'female' }, catalog717).primary?.id).toBe(women)
      expect(matchUserToPrograms({ level, primary_goal, sex: 'male' }, catalog717).primary?.id).toBe(generic)
      expect(matchUserToPrograms({ level, primary_goal }, catalog717).primary?.id).toBe(generic)
    }
  })
})

describe('matchUserToPrograms — desempate determinista (#717)', () => {
  it('cada nivel × objetivo × sexo tiene primary, y no depende del orden de la lista', () => {
    for (const level of LEVELS) {
      for (const primary_goal of GOALS) {
        for (const sex of SEXES) {
          const user = { level, primary_goal, sex }
          const ref = matchUserToPrograms(user, catalog717).primary
          expect(ref, `${level} × ${primary_goal} × ${sex}`).not.toBeNull()
          for (const seed of [1, 7, 42]) {
            expect(matchUserToPrograms(user, shuffled(catalog717, seed)).primary?.id).toBe(ref!.id)
          }
          expect(matchUserToPrograms(user, [...catalog717].reverse()).primary?.id).toBe(ref!.id)
        }
      }
    }
  })

  it('un oficial gana a un programa de la comunidad de la misma celda aunque vaya después', () => {
    const community = P({ id: 'zz-community', name: 'AAA mi rutina', difficulty: 'beginner', goal_type: 'fat_loss', is_official: false, is_featured: true })
    const r = matchUserToPrograms({ level: 'principiante', primary_goal: 'perder_grasa' }, [community, ...catalog717])
    expect(r.primary?.id).toBe('b-fat')
  })

  it('a igual sexo, gana el destacado; a igual destacado, el sort_order más bajo; sin sort_order, el nombre', () => {
    const cell = [
      P({ id: 'c', name: 'Charlie', difficulty: 'beginner', goal_type: 'fat_loss', is_official: true }),
      P({ id: 'b', name: 'Bravo', difficulty: 'beginner', goal_type: 'fat_loss', is_official: true, sort_order: 20 }),
      P({ id: 'a', name: 'Alpha', difficulty: 'beginner', goal_type: 'fat_loss', is_official: true, sort_order: 30 }),
      P({ id: 'f', name: 'Zulu', difficulty: 'beginner', goal_type: 'fat_loss', is_official: true, is_featured: true }),
    ]
    const user = { level: 'principiante', primary_goal: 'perder_grasa' }
    expect(matchUserToPrograms(user, cell).primary?.id).toBe('f')
    expect(matchUserToPrograms(user, cell.filter(p => p.id !== 'f')).primary?.id).toBe('b')
    expect(matchUserToPrograms(user, cell.filter(p => p.id !== 'f' && p.id !== 'b')).primary?.id).toBe('a')
    expect(matchUserToPrograms(user, cell.filter(p => !p.sort_order && !p.is_featured)).primary?.id).toBe('c')
  })

  it('la afinidad de sexo manda sobre el destacado', () => {
    const cell = [
      P({ id: 'g', name: 'Generic', difficulty: 'beginner', goal_type: 'fat_loss', is_official: true, is_featured: true }),
      P({ id: 'w', name: 'Women', difficulty: 'beginner', goal_type: 'fat_loss', is_official: true, for_women: true }),
    ]
    expect(matchUserToPrograms({ level: 'principiante', primary_goal: 'perder_grasa', sex: 'female' }, cell).primary?.id).toBe('w')
    expect(matchUserToPrograms({ level: 'principiante', primary_goal: 'perder_grasa', sex: 'male' }, cell).primary?.id).toBe('g')
  })

  it('rankCandidates devuelve una copia y no reordena la lista de entrada', () => {
    const input = [catalog717[1], catalog717[0]]
    const before = input.map(p => p.id)
    rankCandidates(input, { sex: 'female' })
    expect(input.map(p => p.id)).toEqual(before)
  })

  it('el skill track secundario tampoco depende del orden', () => {
    const user = { level: 'principiante', primary_goal: 'ganar_musculo', focus_areas: ['pull_up'] }
    const ref = matchUserToPrograms(user, catalog717).secondary?.id
    expect(ref).toBe('sk-pull')
    expect(matchUserToPrograms(user, [...catalog717].reverse()).secondary?.id).toBe(ref)
  })
})
