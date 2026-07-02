import { describe, it, expect } from 'vitest'
import { getVariants, getVariantsByLevel, getRelatedExercises, getFamily, getCatalogEntry } from './variants'

describe('variation families', () => {
  it('pushup_std belongs to the push_up family', () => {
    expect(getFamily('pushup_std')).toBe('push_up')
  })

  it('getVariants excludes the exercise itself', () => {
    const variants = getVariants('pushup_std', 50)
    expect(variants.length).toBeGreaterThan(5)
    expect(variants.some(v => v.id === 'pushup_std')).toBe(false)
    expect(variants.every(v => getFamily(v.id) === 'push_up')).toBe(true)
  })

  it('curated variants rank before imported (exercisedb) ones', () => {
    const variants = getVariants('pushup_std', 100)
    const firstImported = variants.findIndex(v => v.source === 'exercisedb')
    const lastCurated = variants.map(v => v.source !== 'exercisedb').lastIndexOf(true)
    if (firstImported !== -1 && lastCurated !== -1) {
      expect(firstImported).toBeGreaterThan(lastCurated)
    }
  })

  it('respects the limit', () => {
    expect(getVariants('pushup_std', 3)).toHaveLength(3)
  })

  it('unknown or family-less ids return []', () => {
    expect(getVariants('nope_does_not_exist')).toEqual([])
    expect(getFamily('nope_does_not_exist')).toBeNull()
  })
})

describe('getVariantsByLevel', () => {
  it('muscle_up (advanced) offers easier progressions like the negative', () => {
    const { easier, harder } = getVariantsByLevel('muscle_up')
    expect(easier.some(v => v.id === 'muscleup_neg')).toBe(true)
    expect(easier.every(v => v.difficulty !== 'advanced')).toBe(true)
    // advanced = top level, nothing above it
    expect(harder).toEqual([])
  })

  it('pushup_std (beginner) offers harder progressions and no easier ones', () => {
    const { easier, similar, harder } = getVariantsByLevel('pushup_std')
    expect(easier).toEqual([])
    expect(harder.length).toBeGreaterThan(0)
    expect(harder.every(v => v.difficulty !== 'beginner')).toBe(true)
    expect(similar.every(v => v.difficulty === 'beginner' || !v.difficulty)).toBe(true)
  })

  it('all groups stay within the family and exclude the exercise itself', () => {
    const groups = getVariantsByLevel('muscle_up')
    for (const list of [groups.easier, groups.similar, groups.harder]) {
      expect(list.some(v => v.id === 'muscle_up')).toBe(false)
      expect(list.every(v => v.family === 'muscle_up')).toBe(true)
    }
  })

  it('respects limitPerLevel', () => {
    const { harder } = getVariantsByLevel('pushup_std', 2)
    expect(harder.length).toBeLessThanOrEqual(2)
  })

  it('family-less exercises return empty groups (related covers them)', () => {
    expect(getCatalogEntry('ab_wheel_rollout')?.family).toBeUndefined()
    expect(getVariantsByLevel('ab_wheel_rollout')).toEqual({ easier: [], similar: [], harder: [] })
  })

  it('unknown ids return empty groups', () => {
    expect(getVariantsByLevel('nope_does_not_exist')).toEqual({ easier: [], similar: [], harder: [] })
  })
})

describe('getRelatedExercises', () => {
  it('shares a muscle group but excludes the whole family', () => {
    const entry = getCatalogEntry('muscle_up')
    const related = getRelatedExercises('muscle_up')
    expect(related.length).toBeGreaterThan(0)
    expect(related.some(v => v.id === 'muscle_up')).toBe(false)
    expect(related.every(v => v.family !== 'muscle_up')).toBe(true)
    expect(related.every(v =>
      (v.muscle_groups ?? []).some(g => (entry?.muscle_groups ?? []).includes(g)),
    )).toBe(true)
  })

  it('works for family-less exercises too', () => {
    const related = getRelatedExercises('ab_wheel_rollout')
    expect(related.length).toBeGreaterThan(0)
    expect(related.some(v => v.id === 'ab_wheel_rollout')).toBe(false)
  })

  it('respects the limit and handles unknown ids', () => {
    expect(getRelatedExercises('pushup_std', 4)).toHaveLength(4)
    expect(getRelatedExercises('nope_does_not_exist')).toEqual([])
  })
})
