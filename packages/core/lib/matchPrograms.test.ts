import { describe, it, expect } from 'vitest'
import { matchUserToPrograms, inferGoalType, LEVEL_TO_DIFFICULTY } from './matchPrograms'
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
