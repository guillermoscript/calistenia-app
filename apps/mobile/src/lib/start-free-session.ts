/** Arranque de una sesión libre (picker manual + coach IA). */
import { useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useActiveSession } from '@/contexts/ActiveSessionContext'
import type { Exercise, Workout } from '@calistenia/core/types'

/**
 * Devuelve un `start(exercises, title)` que crea el workout libre, lo arranca en
 * el engine (`source: 'free'`) y navega a `/session`.
 */
export function useStartFreeSession() {
  const router = useRouter()
  const { startSession } = useActiveSession()

  return useCallback(
    (exercises: Exercise[], title: string) => {
      const workout: Workout = { phase: 0, day: 'lun', title, exercises }
      startSession(workout, `free_${Date.now()}`, 'free')
      router.replace('/session')
    },
    [router, startSession],
  )
}
