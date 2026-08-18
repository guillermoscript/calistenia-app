import { describe, it, expect } from 'vitest'
import type { Exercise } from '../types'
import {
  buildSteps,
  computeExerciseBoundaries,
  createSessionReducer,
  findCurrentExerciseIndex,
  initSessionState,
  nextPhaseAfterSet,
  type SessionState,
  type Step,
} from './session-machine'

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

  // Caso #452: sets: 0 explícito daba 1 paso en móvil y 0 en web. La semántica
  // unificada es la de web: 0 explícito → 0 pasos, el ejercicio no participa.
  it('sets: 0 (number) → 0 steps', () => {
    expect(buildSteps([ex({ id: 'z', sets: 0 })])).toEqual([])
  })

  it('sets: "0" (string) → 0 steps', () => {
    expect(buildSteps([ex({ id: 'z', sets: '0' })])).toEqual([])
  })

  it('sets: 0 in the middle does not shift neighbours\' indices', () => {
    const steps = buildSteps([
      ex({ id: 'a', sets: 1 }),
      ex({ id: 'z', sets: 0 }),
      ex({ id: 'b', sets: 2 }),
    ])
    expect(steps.map(s => s.exercise.id)).toEqual(['a', 'b', 'b'])
  })

  it('negative sets clamp to 0 steps', () => {
    expect(buildSteps([ex({ id: 'z', sets: -2 })])).toEqual([])
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

describe('createSessionReducer', () => {
  // Calentamiento (1 serie) → principal a+b en superserie (1 serie cada uno)
  // → principal c (2 series) → enfriamiento (1 serie). 6 pasos en total.
  const exercises = [
    ex({ id: 'w', sets: 1, section: 'warmup' }),
    ex({ id: 'a', sets: 1, supersetGroup: 'g1' }),
    ex({ id: 'b', sets: 1, supersetGroup: 'g1' }),
    ex({ id: 'c', sets: 2 }),
    ex({ id: 'z', sets: 1, section: 'cooldown' }),
  ]
  const steps = buildSteps(exercises)
  const reducer = createSessionReducer(steps)
  const at = (stepIdx: number, over: Partial<SessionState> = {}): SessionState =>
    ({ ...initSessionState(), stepIdx, ...over })

  it('initSessionState defaults to step 0 / exercise / 0 sets', () => {
    expect(initSessionState()).toEqual({
      stepIdx: 0, phase: 'exercise', setsCount: 0,
      transitionType: 'warmup-to-main', pendingStepIdx: null,
    })
  })

  it('initSessionState restores a persisted snapshot', () => {
    expect(initSessionState({ stepIdx: 3, phase: 'rest', setsCount: 4 })).toMatchObject({
      stepIdx: 3, phase: 'rest', setsCount: 4,
    })
  })

  it('log-set always increments setsCount', () => {
    expect(reducer(at(1), { type: 'log-set' }).setsCount).toBe(1)
  })

  it('log-set at the last step → note', () => {
    expect(reducer(at(5), { type: 'log-set' })).toMatchObject({ phase: 'note', stepIdx: 5, setsCount: 1 })
  })

  it('log-set crossing warmup→main → section-transition pointing at the next step', () => {
    expect(reducer(at(0), { type: 'log-set' })).toMatchObject({
      phase: 'section-transition',
      transitionType: 'warmup-to-main',
      pendingStepIdx: 1,
      stepIdx: 0,
    })
  })

  it('log-set crossing main→cooldown → section-transition main-to-cooldown', () => {
    expect(reducer(at(4), { type: 'log-set' })).toMatchObject({
      phase: 'section-transition',
      transitionType: 'main-to-cooldown',
      pendingStepIdx: 5,
    })
  })

  it('log-set inside a superset advances without resting', () => {
    expect(reducer(at(1), { type: 'log-set' })).toMatchObject({ phase: 'exercise', stepIdx: 2 })
  })

  it('log-set leaving a superset falls back to rest', () => {
    expect(reducer(at(2), { type: 'log-set' })).toMatchObject({ phase: 'rest', stepIdx: 2 })
  })

  it('log-set between sets of the same exercise → rest, without advancing', () => {
    expect(reducer(at(3), { type: 'log-set' })).toMatchObject({ phase: 'rest', stepIdx: 3 })
  })

  it('log-set out of range is a no-op (snapshot restored from another workout)', () => {
    const state = at(99)
    expect(reducer(state, { type: 'log-set' })).toBe(state)
  })

  it('rest-done advances one step and goes back to exercise', () => {
    expect(reducer(at(3, { phase: 'rest' }), { type: 'rest-done' }))
      .toMatchObject({ phase: 'exercise', stepIdx: 4 })
  })

  it('section-continue jumps to pendingStepIdx and clears it', () => {
    const state = at(0, { phase: 'section-transition', pendingStepIdx: 1 })
    expect(reducer(state, { type: 'section-continue' }))
      .toMatchObject({ phase: 'exercise', stepIdx: 1, pendingStepIdx: null })
  })

  it('section-continue without a pending index stays on the current step', () => {
    expect(reducer(at(2, { phase: 'section-transition' }), { type: 'section-continue' }))
      .toMatchObject({ phase: 'exercise', stepIdx: 2 })
  })

  it('skip-warmup jumps to the first non-warmup step', () => {
    expect(reducer(at(0), { type: 'skip-warmup' })).toMatchObject({ phase: 'exercise', stepIdx: 1 })
  })

  it('skip-warmup is a no-op when every step is warmup', () => {
    const onlyWarmup = createSessionReducer(buildSteps([ex({ id: 'w', sets: 2, section: 'warmup' })]))
    const state = at(0)
    expect(onlyWarmup(state, { type: 'skip-warmup' })).toBe(state)
  })

  it('skip-cooldown goes straight to the note screen', () => {
    expect(reducer(at(5), { type: 'skip-cooldown' })).toMatchObject({ phase: 'note', stepIdx: 5 })
  })

  it('goto-exercise moves and forces the exercise phase', () => {
    expect(reducer(at(5, { phase: 'rest' }), { type: 'goto-exercise', stepIdx: 1 }))
      .toMatchObject({ phase: 'exercise', stepIdx: 1 })
  })

  it('goto-exercise out of range is a no-op', () => {
    const state = at(2)
    expect(reducer(state, { type: 'goto-exercise', stepIdx: -1 })).toBe(state)
    expect(reducer(state, { type: 'goto-exercise', stepIdx: steps.length })).toBe(state)
  })

  it('finish moves to celebrate', () => {
    expect(reducer(at(5, { phase: 'note' }), { type: 'finish' })).toMatchObject({ phase: 'celebrate' })
  })
})
