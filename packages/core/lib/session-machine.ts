// Lógica pura de la máquina de estados de la sesión de fuerza, compartida
// entre web y mobile. Sin React ni hooks: funciones puras testeables.
// Única fuente de verdad de buildSteps — antes vivían tres copias divergidas
// (mobile lib/session-machine, web SessionView, web ActiveSessionContext) y
// el caso sets: 0 daba 1 paso en móvil y 0 en web (#452).
import type { Exercise } from '../types'

export interface Step {
  exercise: Exercise
  setNumber: number
  totalSets: number
  section: 'warmup' | 'main' | 'cooldown'
}

/**
 * Expande cada ejercicio en una serie de "pasos" (uno por set).
 * sets=0 explícito → 0 pasos (el ejercicio no participa); 'múltiples' → 3;
 * el fallback de 1 queda solo para sets no parseable.
 */
export function buildSteps(exercises: Exercise[]): Step[] {
  const steps: Step[] = []
  exercises.forEach(ex => {
    const parsed = parseInt(String(ex.sets), 10)
    const total = ex.sets === 'múltiples' ? 3 : Number.isFinite(parsed) ? Math.max(0, parsed) : 1
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

// ─── Reducer ─────────────────────────────────────────────────────────────────

export type SessionPhase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

export type SectionTransitionType = 'warmup-to-main' | 'main-to-cooldown'

/**
 * Todo el estado de la máquina de la sesión en un solo sitio. Antes vivía
 * repartido entre seis `useState` y varios `useRef` dentro de cada SessionView,
 * y en web había un segundo escritor (`skipWarmup`/`skipCooldown` del contexto).
 */
export interface SessionState {
  stepIdx: number
  phase: SessionPhase
  setsCount: number
  /** Qué transición de sección enseñar mientras `phase === 'section-transition'`. */
  transitionType: SectionTransitionType
  /** Paso al que saltar cuando el usuario continúa desde la transición. */
  pendingStepIdx: number | null
}

export type SessionAction =
  /** Serie registrada: decide la fase siguiente con `nextPhaseAfterSet`. */
  | { type: 'log-set' }
  /** Terminó (o se saltó) el descanso. */
  | { type: 'rest-done' }
  /** El usuario continúa desde la pantalla de transición de sección. */
  | { type: 'section-continue' }
  /** Saltar el calentamiento: ir al primer paso que no sea de warmup. */
  | { type: 'skip-warmup' }
  /** Saltar el enfriamiento (entero o lo que quede): ir a la nota. */
  | { type: 'skip-cooldown' }
  /** Navegación prev/next entre ejercicios. */
  | { type: 'goto-exercise'; stepIdx: number }
  /** Nota guardada: la sesión pasa a la celebración. */
  | { type: 'finish' }

/** Estado inicial, opcionalmente restaurado desde un snapshot persistido. */
export function initSessionState(
  restored?: { stepIdx?: number; phase?: SessionPhase; setsCount?: number } | null,
): SessionState {
  return {
    stepIdx: restored?.stepIdx ?? 0,
    phase: restored?.phase ?? 'exercise',
    setsCount: restored?.setsCount ?? 0,
    transitionType: 'warmup-to-main',
    pendingStepIdx: null,
  }
}

/**
 * Reducer puro de la sesión, ligado a la lista de pasos de este entreno.
 * Los efectos (sonidos, hápticas, notificaciones, toasts, analítica y el
 * empujón del progreso al contexto) se quedan en la capa de app: ninguno
 * depende de qué rama tomó la decisión, así que el reducer no devuelve nada
 * más que el estado nuevo.
 */
export function createSessionReducer(steps: Step[]) {
  return function sessionReducer(state: SessionState, action: SessionAction): SessionState {
    switch (action.type) {
      case 'log-set': {
        const currentStep = steps[state.stepIdx]
        // Sin paso actual no hay serie que registrar (rango inválido tras
        // restaurar un snapshot de otro entreno): no tocar nada.
        if (!currentStep) return state

        const setsCount = state.setsCount + 1
        const decision = nextPhaseAfterSet({
          currentStep,
          nextStep: steps[state.stepIdx + 1] ?? null,
          isLastStep: state.stepIdx === steps.length - 1,
          stepIdx: state.stepIdx,
        })

        switch (decision.kind) {
          case 'note':
            return { ...state, setsCount, phase: 'note' }
          case 'section-transition':
            return {
              ...state,
              setsCount,
              phase: 'section-transition',
              transitionType: decision.transitionType,
              pendingStepIdx: decision.nextStepIdx,
            }
          case 'advance':
            return { ...state, setsCount, phase: 'exercise', stepIdx: state.stepIdx + 1 }
          case 'rest':
            return { ...state, setsCount, phase: 'rest' }
        }
        return { ...state, setsCount }
      }

      case 'rest-done':
        return { ...state, phase: 'exercise', stepIdx: state.stepIdx + 1 }

      case 'section-continue':
        return {
          ...state,
          phase: 'exercise',
          stepIdx: state.pendingStepIdx ?? state.stepIdx,
          pendingStepIdx: null,
        }

      case 'skip-warmup': {
        const firstMainIdx = steps.findIndex(s => (s.section || 'main') !== 'warmup')
        // Entreno íntegramente de calentamiento: no hay a dónde saltar.
        if (firstMainIdx < 0) return state
        return { ...state, phase: 'exercise', stepIdx: firstMainIdx }
      }

      case 'skip-cooldown':
        return { ...state, phase: 'note' }

      case 'goto-exercise': {
        if (action.stepIdx < 0 || action.stepIdx >= steps.length) return state
        return { ...state, phase: 'exercise', stepIdx: action.stepIdx }
      }

      case 'finish':
        return { ...state, phase: 'celebrate' }
    }
  }
}
