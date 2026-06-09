import { useState, useEffect, useCallback, useMemo } from 'react'
import { pb, isPocketBaseAvailable, getCurrentUser } from '../lib/pocketbase'

const STORAGE_KEY = 'calistenia_exercise_favorites'

function loadLocal(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveLocal(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch { /* storage full */ }
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(loadLocal)
  const [pbReady, setPbReady] = useState(false)

  // Sync from PB on mount
  useEffect(() => {
    let cancelled = false
    const sync = async () => {
      try {
        const available = await isPocketBaseAvailable()
        const user = getCurrentUser()
        if (!available || !user || cancelled) return
        setPbReady(true)
        const res = await pb.collection('exercise_favorites').getFullList({
          filter: pb.filter('user = {:uid}', { uid: user.id }),
          fields: 'exercise_id',
        })
        if (!cancelled && res.length > 0) {
          const pbIds = new Set(res.map(r => r.exercise_id as string))
          // Merge with local
          const local = loadLocal()
          const merged = new Set([...local, ...pbIds])
          setFavoriteIds(merged)
          saveLocal(merged)
        }
      } catch { /* PB not available */ }
    }
    sync()
    return () => { cancelled = true }
  }, [])

  const toggleFavorite = useCallback(async (exerciseId: string) => {
    setFavoriteIds(prev => {
      const next = new Set(prev)
      if (next.has(exerciseId)) {
        next.delete(exerciseId)
      } else {
        next.add(exerciseId)
      }
      saveLocal(next)
      return next
    })

    // Sync to PB
    try {
      const user = getCurrentUser()
      if (!pbReady || !user) return

      const isFav = favoriteIds.has(exerciseId)
      if (isFav) {
        // Remove
        const res = await pb.collection('exercise_favorites').getFullList({
          filter: pb.filter('user = {:uid} && exercise_id = {:eid}', { uid: user.id, eid: exerciseId }),
        })
        for (const r of res) {
          await pb.collection('exercise_favorites').delete(r.id)
        }
      } else {
        // Add
        await pb.collection('exercise_favorites').create({
          user: user.id,
          exercise_id: exerciseId,
        })
      }
    } catch { /* silent fail, local state is source of truth */ }
  }, [pbReady, favoriteIds])

  const isFavorite = useCallback((exerciseId: string) => favoriteIds.has(exerciseId), [favoriteIds])

  const count = useMemo(() => favoriteIds.size, [favoriteIds])

  return { favoriteIds, toggleFavorite, isFavorite, count }
}
