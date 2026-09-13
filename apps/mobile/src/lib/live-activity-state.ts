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

/** Textos localizados de los botones de la notificación Android. */
export interface LiveNotificationLabels {
  work: string
  rest: string
  transition: string
  stop: string
}

export interface LiveNotificationAction {
  id: 'live-next' | 'live-stop'
  title: string
}

/**
 * Botones de la notificación: «avanzar» según la fase y «detener» siempre al
 * final. Play exige que el usuario pueda parar el foreground service sin abrir
 * la app (rechazo de vc41), así que «detener» no depende de la fase.
 */
export function liveNotificationActions(
  state: LiveActivityState,
  labels: LiveNotificationLabels | null,
): LiveNotificationAction[] {
  if (!labels) return []
  const next = state.phase === 'rest' ? labels.rest
    : state.setTotal > 0 ? labels.work
    : labels.transition
  return [
    { id: 'live-next', title: next },
    { id: 'live-stop', title: labels.stop },
  ]
}

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
