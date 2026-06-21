import { describe, it, expect } from 'vitest'
import { resolveExerciseId, normalizeForLookup } from './resolveExerciseId'

describe('normalizeForLookup', () => {
  it('lowercases and strips accents', () => {
    expect(normalizeForLookup('Plancha Lateral con Rotación')).toBe('plancha lateral con rotacion')
  })

  it('handles already-clean strings', () => {
    expect(normalizeForLookup('burpees')).toBe('burpees')
  })
})

describe('resolveExerciseId — step 1: exact catalog id passes through', () => {
  it('exact id is returned unchanged', () => {
    expect(resolveExerciseId('burpees')).toBe('burpees')
  })

  it('another exact id', () => {
    expect(resolveExerciseId('plank')).toBe('plank')
  })

  it('exact id with underscores', () => {
    expect(resolveExerciseId('jumping_jacks')).toBe('jumping_jacks')
  })
})

describe('resolveExerciseId — step 2: kebab slug resolves via _id-map', () => {
  it('jumping-jacks → jumping_jacks', () => {
    expect(resolveExerciseId('jumping-jacks')).toBe('jumping_jacks')
  })

  it('high-knees → high_knees', () => {
    expect(resolveExerciseId('high-knees')).toBe('high_knees')
  })

  it('burpee-pull-up → burpee_pull_up', () => {
    expect(resolveExerciseId('burpee-pull-up')).toBe('burpee_pull_up')
  })

  it('skater-jumps-cardio → skaters (cross-slug alias)', () => {
    expect(resolveExerciseId('skater-jumps-cardio')).toBe('skaters')
  })

  it('mountain-climbers-cardio → mountain_climbers', () => {
    expect(resolveExerciseId('mountain-climbers-cardio')).toBe('mountain_climbers')
  })
})

describe('resolveExerciseId — step 3: human name resolves via name index', () => {
  it('Spanish name (exact case) resolves', () => {
    expect(resolveExerciseId('Burpees')).toBe('burpees')
  })

  it('Spanish name (lowercase) resolves', () => {
    expect(resolveExerciseId('burpees')).toBe('burpees')
  })

  it('English name resolves', () => {
    expect(resolveExerciseId('Standing Ab Wheel Rollout')).toBe('standing_ab_wheel_rollout')
  })

  it('Spanish accented name resolves after normalization', () => {
    // "Plancha Lateral con Rotación" → side_plank_rotation
    expect(resolveExerciseId('Plancha Lateral con Rotación')).toBe('side_plank_rotation')
    // Also works without accent
    expect(resolveExerciseId('Plancha Lateral con Rotacion')).toBe('side_plank_rotation')
  })

  it('English name case-insensitive', () => {
    expect(resolveExerciseId('standing ab wheel rollout')).toBe('standing_ab_wheel_rollout')
  })
})

describe('resolveExerciseId — step 4: unknown input returns unchanged (no false merge)', () => {
  it('completely unknown string returns as-is', () => {
    expect(resolveExerciseId('totally_unknown_exercise_xyz')).toBe('totally_unknown_exercise_xyz')
  })

  it('custom_ id returns as-is', () => {
    expect(resolveExerciseId('custom_my_special_move')).toBe('custom_my_special_move')
  })

  it('empty string returns empty string', () => {
    expect(resolveExerciseId('')).toBe('')
  })

  it('partial name match does not resolve (no fuzzy)', () => {
    // 'burp' is not a catalog id, not in id-map, not an exact name → unchanged
    expect(resolveExerciseId('burp')).toBe('burp')
  })
})

describe('resolveExerciseId — ambiguous names do not mis-resolve', () => {
  // "Mountain Climbers" is ambiguous: mountain_climbers and mountain_climbers_2 share the name
  // Resolver must NOT pick one — return input unchanged
  it('ambiguous normalized name returns input unchanged', () => {
    const result = resolveExerciseId('Mountain Climbers')
    // Must NOT silently resolve to one of the ambiguous ids
    expect(result).not.toBe('mountain_climbers')
    expect(result).not.toBe('mountain_climbers_2')
    expect(result).toBe('Mountain Climbers')
  })
})
