import { describe, it, expect } from 'vitest'
import { getMetricUnit, getMetricLabel } from './challenges'

describe('getMetricUnit', () => {
  it('scores rep exercises in reps', () => {
    expect(getMetricUnit('exercise', 'pushup_std')).toBe('reps')
  })

  it('scores timer exercises in seconds', () => {
    expect(getMetricUnit('exercise', 'plank')).toBe('s')
  })

  it('falls back to reps for unknown slugs', () => {
    expect(getMetricUnit('exercise', 'not_a_real_exercise')).toBe('reps')
    expect(getMetricUnit('exercise')).toBe('reps')
  })

  it('keeps legacy metric units', () => {
    expect(getMetricUnit('custom')).toBe('')
    expect(getMetricUnit('most_pullups')).toBe('reps')
    expect(getMetricUnit('most_lsit')).toBe('s')
  })
})

describe('getMetricLabel (exercise)', () => {
  it('uses the catalog exercise name for known slugs', () => {
    const label = getMetricLabel('exercise', undefined, 'pushup_std')
    expect(label.length).toBeGreaterThan(0)
    expect(label).not.toBe('challenge.metricExercise')
  })

  it('keeps custom metric override', () => {
    expect(getMetricLabel('custom', 'Km corridos')).toBe('Km corridos')
  })
})
