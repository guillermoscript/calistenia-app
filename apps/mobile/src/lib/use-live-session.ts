/**
 * Observa las transiciones de SessionView (sin tocar su máquina de estados)
 * y mantiene viva la Live Activity / notificación persistente.
 * El restEndsAt fino lo empuja RestScreen vía updateLiveRest() (módulo-level,
 * sin prop drilling) porque los ajustes −15/+15/+30 no son transiciones.
 */
import { useEffect, useRef } from 'react'
import { mapPhaseToActivity } from './live-activity-state'
import { startLiveSession, updateLiveSession, endLiveSession } from './live-session'

type Phase = 'exercise' | 'rest' | 'note' | 'celebrate' | 'section-transition'

export function useLiveSession(args: {
  workoutTitle: string
  phase: Phase
  exerciseName: string
  setNumber: number
  totalSets: number
}): void {
  const started = useRef(false)

  useEffect(() => {
    const cmd = mapPhaseToActivity({
      phase: args.phase,
      exerciseName: args.exerciseName,
      setNumber: args.setNumber,
      totalSets: args.totalSets,
      // restEndsAt lo precisa RestScreen con updateLiveRest(); aquí solo
      // marcamos la fase — el countdown llega ~un frame después
      restEndsAt: null,
    })

    if (cmd.kind === 'end') {
      if (started.current) {
        started.current = false
        void endLiveSession()
      }
      return
    }
    if (!started.current) {
      started.current = true
      void startLiveSession(args.workoutTitle, cmd.state)
    } else {
      void updateLiveSession(cmd.state)
    }
  }, [args.phase, args.exerciseName, args.setNumber, args.totalSets, args.workoutTitle])

  // Fin por desmontaje (abandonar sesión, navegar fuera con endSession)
  useEffect(() => () => {
    if (started.current) {
      started.current = false
      void endLiveSession()
    }
  }, [])
}
