// Lógica pura de la máquina de estados de la sesión, extraída de SessionView.
// Sin React ni hooks: funciones puras testeables. La base para el plan 007.
import type { Exercise } from '@calistenia/core/types'

export interface Step {
  exercise: Exercise
  setNumber: number
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

/** Expande cada ejercicio en una serie de "pasos" (uno por set). */
export function buildSteps(exercises: Exercise[]): Step[] {
  const steps: Step[] = []
  exercises.forEach(ex => {
    const total = ex.sets === 'múltiples' ? 3 : (parseInt(String(ex.sets)) || 1)
    for (let s = 1; s <= total; s++) {
      steps.push({ exercise: ex, setNumber: s, totalSets: total, section: ex.section || 'main' })
    }
  })
  return steps
}

/** Índices de paso donde empieza cada ejercicio (para navegación prev/next). */
export function computeExerciseBoundaries(steps: Step[]): number[] {
  return steps.reduce<number[]>((acc, s, i) => {
    if (i === 0 || s.exercise.id !== steps[i - 1].exercise.id) acc.push(i)
    return acc
  }, [])
}

/** Índice del ejercicio actual dado el paso actual. -1 si stepIdx queda fuera de rango. */
export function findCurrentExerciseIndex(
  boundaries: number[],
  stepIdx: number,
  stepsLength: number,
): number {
  return boundaries.findIndex((bIdx, i) => {
    const nextBoundary = boundaries[i + 1] ?? stepsLength
    return stepIdx >= bIdx && stepIdx < nextBoundary
  })
}

export type NextPhaseResult =
  | { kind: 'note' }
  | { kind: 'section-transition'; transitionType: 'warmup-to-main' | 'main-to-cooldown'; nextStepIdx: number }
  | { kind: 'advance' }
  | { kind: 'rest' }

/**
 * Decide la fase tras registrar una serie. Reproduce EXACTAMENTE el orden de
 * ramas de handleLogged en SessionView:
 *   1. último paso → 'note'
 *   2. cambio de sección → 'section-transition'
 *   3. superset (mismo supersetGroup) → 'advance'
 *   4. resto → 'rest'
 */
export function nextPhaseAfterSet(args: {
  currentStep: Step
  nextStep: Step | null
  isLastStep: boolean
  stepIdx: number
}): NextPhaseResult {
  const { currentStep, nextStep, isLastStep, stepIdx } = args

  if (isLastStep) {
    return { kind: 'note' }
  }

  const currentSection = currentStep.section
  const nextSection = nextStep?.section || 'main'
  if (currentSection !== nextSection) {
    return {
      kind: 'section-transition',
      transitionType: currentSection === 'warmup' ? 'warmup-to-main' : 'main-to-cooldown',
      nextStepIdx: stepIdx + 1,
    }
  }

  const currentGroup = currentStep.exercise.supersetGroup
  const nextExGroup = nextStep?.exercise.supersetGroup
  if (currentGroup && nextExGroup && currentGroup === nextExGroup) {
    return { kind: 'advance' }
  }

  return { kind: 'rest' }
}
