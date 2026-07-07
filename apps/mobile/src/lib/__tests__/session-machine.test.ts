import { describe, it, expect } from 'vitest'
import type { Exercise } from '@calistenia/core/types'
import {
  buildSteps,
  computeExerciseBoundaries,
  findCurrentExerciseIndex,
  nextPhaseAfterSet,
  type Step,
} from '../session-machine'

// Fixture mínimo: las funciones solo leen id/sets/section/supersetGroup.
function ex(partial: Partial<Exercise> & { id: string }): Exercise {
  return { sets: 1, section: 'main', ...partial } as Exercise
}

function step(partial: Partial<Step> & { exercise: Exercise }): Step {
  return { setNumber: 1, totalSets: 1, section: partial.exercise.section ?? 'main', ...partial } as Step
}

describe('buildSteps', () => {
  const exercises = [
    ex({ id: 'a', sets: 2, section: 'warmup' }),
    ex({ id: 'b', sets: 'múltiples' }),
    ex({ id: 'c', sets: 'intentos' }),
  ]
  const result = buildSteps(exercises)

  it('total length is 2 + 3 + 1 = 6', () => {
    expect(result).toHaveLength(6)
  })

  it('exercise a: setNumber 1 and 2, totalSets 2, section warmup', () => {
    expect(result[0]).toMatchObject({ setNumber: 1, totalSets: 2, section: 'warmup' })
    expect(result[1]).toMatchObject({ setNumber: 2, totalSets: 2, section: 'warmup' })
    expect(result[0].exercise.id).toBe('a')
    expect(result[1].exercise.id).toBe('a')
  })

  it('exercise b: múltiples → totalSets 3, section defaults to main', () => {
    expect(result[2]).toMatchObject({ totalSets: 3, section: 'main' })
    expect(result[3]).toMatchObject({ totalSets: 3, section: 'main' })
    expect(result[4]).toMatchObject({ totalSets: 3, section: 'main' })
    expect(result[2].exercise.id).toBe('b')
  })

  it('exercise c: intentos → parseInt is NaN → totalSets 1, section defaults to main', () => {
    expect(result[5]).toMatchObject({ setNumber: 1, totalSets: 1, section: 'main' })
    expect(result[5].exercise.id).toBe('c')
  })
})

describe('computeExerciseBoundaries', () => {
  it('multi-set multi-exercise: boundaries are [0, 2, 5]', () => {
    const steps = buildSteps([
      ex({ id: 'a', sets: 2, section: 'warmup' }),
      ex({ id: 'b', sets: 'múltiples' }),
      ex({ id: 'c', sets: 'intentos' }),
    ])
    expect(computeExerciseBoundaries(steps)).toEqual([0, 2, 5])
  })

  it('single exercise multi-set: boundaries are [0]', () => {
    const steps = buildSteps([ex({ id: 'a', sets: 3 })])
    expect(computeExerciseBoundaries(steps)).toEqual([0])
  })

  it('superset group: distinct ids still produce one boundary per id', () => {
    const steps = buildSteps([
      ex({ id: 'a', sets: 1, supersetGroup: 'g1' }),
      ex({ id: 'b', sets: 1, supersetGroup: 'g1' }),
    ])
    expect(computeExerciseBoundaries(steps)).toEqual([0, 1])
  })
})

describe('findCurrentExerciseIndex', () => {
  const boundaries = [0, 2, 5]
  const stepsLength = 6

  it('stepIdx 0 → index 0', () => {
    expect(findCurrentExerciseIndex(boundaries, 0, stepsLength)).toBe(0)
  })

  it('stepIdx 1 → index 0', () => {
    expect(findCurrentExerciseIndex(boundaries, 1, stepsLength)).toBe(0)
  })

  it('stepIdx 2 → index 1', () => {
    expect(findCurrentExerciseIndex(boundaries, 2, stepsLength)).toBe(1)
  })

  it('stepIdx 3 → index 1', () => {
    expect(findCurrentExerciseIndex(boundaries, 3, stepsLength)).toBe(1)
  })

  it('stepIdx 4 → index 1', () => {
    expect(findCurrentExerciseIndex(boundaries, 4, stepsLength)).toBe(1)
  })

  it('stepIdx 5 → index 2', () => {
    expect(findCurrentExerciseIndex(boundaries, 5, stepsLength)).toBe(2)
  })

  it('stepIdx 6 (out of range) → -1', () => {
    expect(findCurrentExerciseIndex(boundaries, 6, stepsLength)).toBe(-1)
  })

  it('stepIdx -1 (out of range) → -1', () => {
    expect(findCurrentExerciseIndex(boundaries, -1, stepsLength)).toBe(-1)
  })
})

describe('nextPhaseAfterSet', () => {
  it('isLastStep: true → { kind: note }', () => {
    const currentStep = step({ exercise: ex({ id: 'a', section: 'main' }) })
    const nextS = step({ exercise: ex({ id: 'b', section: 'main' }) })
    expect(nextPhaseAfterSet({ currentStep, nextStep: nextS, isLastStep: true, stepIdx: 5 })).toEqual({ kind: 'note' })
  })

  it('warmup→main transition: section-transition with warmup-to-main', () => {
    const currentStep = step({ exercise: ex({ id: 'a', section: 'warmup' }), section: 'warmup' })
    const nextS = step({ exercise: ex({ id: 'b', section: 'main' }), section: 'main' })
    expect(nextPhaseAfterSet({ currentStep, nextStep: nextS, isLastStep: false, stepIdx: 3 })).toEqual({
      kind: 'section-transition',
      transitionType: 'warmup-to-main',
      nextStepIdx: 4,
    })
  })

  it('main→cooldown transition: section-transition with main-to-cooldown', () => {
    const currentStep = step({ exercise: ex({ id: 'a', section: 'main' }), section: 'main' })
    const nextS = step({ exercise: ex({ id: 'b', section: 'cooldown' }), section: 'cooldown' })
    expect(nextPhaseAfterSet({ currentStep, nextStep: nextS, isLastStep: false, stepIdx: 7 })).toEqual({
      kind: 'section-transition',
      transitionType: 'main-to-cooldown',
      nextStepIdx: 8,
    })
  })

  it('nextStep null with warmup current → section-transition (nextSection defaults to main)', () => {
    const currentStep = step({ exercise: ex({ id: 'a', section: 'warmup' }), section: 'warmup' })
    expect(nextPhaseAfterSet({ currentStep, nextStep: null, isLastStep: false, stepIdx: 2 })).toEqual({
      kind: 'section-transition',
      transitionType: 'warmup-to-main',
      nextStepIdx: 3,
    })
  })

  it('superset: same truthy supersetGroup → { kind: advance }', () => {
    const currentStep = step({ exercise: ex({ id: 'a', supersetGroup: 'g1' }) })
    const nextS = step({ exercise: ex({ id: 'b', supersetGroup: 'g1' }) })
    expect(nextPhaseAfterSet({ currentStep, nextStep: nextS, isLastStep: false, stepIdx: 0 })).toEqual({ kind: 'advance' })
  })

  it('normal rest: same section, no superset group → { kind: rest }', () => {
    const currentStep = step({ exercise: ex({ id: 'a' }) })
    const nextS = step({ exercise: ex({ id: 'b' }) })
    expect(nextPhaseAfterSet({ currentStep, nextStep: nextS, isLastStep: false, stepIdx: 0 })).toEqual({ kind: 'rest' })
  })

  it('normal rest: currentGroup set but nextExGroup undefined → { kind: rest }', () => {
    const currentStep = step({ exercise: ex({ id: 'a', supersetGroup: 'g1' }) })
    const nextS = step({ exercise: ex({ id: 'b' }) })
    expect(nextPhaseAfterSet({ currentStep, nextStep: nextS, isLastStep: false, stepIdx: 0 })).toEqual({ kind: 'rest' })
  })
})
