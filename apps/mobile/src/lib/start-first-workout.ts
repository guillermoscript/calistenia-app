/** Arranque del primer entreno del día 0 (#694). Mismo patrón que start-free-session. */
import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import {
  buildFirstWorkout,
  firstWorkoutKey,
  normalizeFirstWorkoutLevel,
  trackFirstWorkoutStarted,
  type FirstWorkoutSource,
} from '@calistenia/core/lib/first-workout'

/**
 * Devuelve un `start(level, source)` que construye el primer entreno para el
 * nivel del usuario, lo arranca en el engine (`source: 'free'`) y navega a
 * `/session`.
 */
export function useStartFirstWorkout() {
  const router = useRouter()
  const { i18n } = useTranslation()
  const { startSession } = useActiveSession()

  return useCallback(
    (level: string | null | undefined, source: FirstWorkoutSource) => {
      const lv = normalizeFirstWorkoutLevel(level)
      const workout = buildFirstWorkout(lv, i18n.language)
      const key = firstWorkoutKey()
      startSession(workout, key, 'free')
      trackFirstWorkoutStarted({ source, level: lv, workoutKey: key })
      router.replace('/session')
    },
    [router, startSession, i18n.language],
  )
}
