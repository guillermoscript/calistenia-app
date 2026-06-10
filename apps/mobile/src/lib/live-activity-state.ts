/**
 * Mapeo fase de la máquina de SessionView → estado de la Live Activity /
 * notificación persistente. Puro y testeable. Convención: setTotal === 0
 * significa "omitir la línea SERIE X/Y" (pasos cronometrados o transiciones).
 */
export interface LiveActivityState {
  exerciseName: string
  setIndex: number
  setTotal: number
  phase: 'work' | 'rest'
  restEndsAt: number | null // epoch ms
}

export type ActivityCommand = { kind: 'update'; state: LiveActivityState } | { kind: 'end' }

export function mapPhaseToActivity(input: {
  phase: 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'
  exerciseName: string
  setNumber: number
  totalSets: number
  restEndsAt?: number | null
}): ActivityCommand {
  if (input.phase === 'note' || input.phase === 'celebrate') return { kind: 'end' }

  const showSets = input.phase !== 'section-transition' && input.totalSets > 1
  return {
    kind: 'update',
    state: {
      exerciseName: input.exerciseName,
      setIndex: showSets ? input.setNumber : 0,
      setTotal: showSets ? input.totalSets : 0,
      phase: input.phase === 'rest' ? 'rest' : 'work',
      restEndsAt: input.phase === 'rest' ? (input.restEndsAt ?? null) : null,
    },
  }
}
