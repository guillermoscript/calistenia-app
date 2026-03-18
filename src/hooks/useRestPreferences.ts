import { useState, useEffect, useCallback, useRef } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

const LS_KEY = 'calistenia_rest_prefs'

// localStorage fallback
const lsGet = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
const lsSet = (d: Record<string, number>) => localStorage.setItem(LS_KEY, JSON.stringify(d))

interface UseRestPreferencesReturn {
  getRestForExercise: (exerciseId: string, defaultRest: number) => number
  setRestForExercise: (exerciseId: string, seconds: number) => Promise<void>
  isReady: boolean
}

export const useRestPreferences = (userId: string | null = null): UseRestPreferencesReturn => {
  const [prefs, setPrefs] = useState<Record<string, number>>({})
  const [pbIds, setPbIds] = useState<Record<string, string>>({}) // exerciseId → PB record id
  const [usePB, setUsePB] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      const available = userId ? await isPocketBaseAvailable() : false
      setUsePB(available && !!userId)

      if (available && userId) {
        try {
          const res = await pb.collection('rest_preferences').getList(1, 500, {
            filter: pb.filter('user = {:uid}', { uid: userId }),
          })
          const loaded: Record<string, number> = {}
          const ids: Record<string, string> = {}
          res.items.forEach((r: any) => {
            loaded[r.exercise_id] = r.rest_seconds
            ids[r.exercise_id] = r.id
          })
          setPrefs(loaded)
          setPbIds(ids)
          lsSet(loaded) // sync to LS cache
        } catch {
          setPrefs(lsGet())
        }
      } else {
        setPrefs(lsGet())
      }
      setIsReady(true)
    }
    init()
  }, [userId])

  const getRestForExercise = useCallback((exerciseId: string, defaultRest: number): number => {
    return prefs[exerciseId] || defaultRest
  }, [prefs])

  const setRestForExercise = useCallback(async (exerciseId: string, seconds: number) => {
    // Update state + localStorage immediately
    setPrefs(prev => {
      const updated = { ...prev, [exerciseId]: seconds }
      lsSet(updated)
      return updated
    })

    // Persist to PocketBase
    if (usePB && userId) {
      try {
        const existingId = pbIds[exerciseId]
        if (existingId) {
          await pb.collection('rest_preferences').update(existingId, { rest_seconds: seconds })
        } else {
          const rec = await pb.collection('rest_preferences').create({
            user: userId,
            exercise_id: exerciseId,
            rest_seconds: seconds,
          })
          setPbIds(prev => ({ ...prev, [exerciseId]: rec.id }))
        }
      } catch (e) { console.warn('PB rest_preferences error:', e) }
    }
  }, [usePB, userId, pbIds])

  return { getRestForExercise, setRestForExercise, isReady }
}
