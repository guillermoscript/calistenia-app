import { storage } from '../platform'
import { useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, getCurrentUser } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

const STORAGE_KEY = 'calistenia_exercise_favorites'

function loadLocal(): Set<string> {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveLocal(ids: Set<string>) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch { /* storage full */ }
}

/**
 * Favoritos de ejercicios. Offline-first: el Set local es la fuente inmediata
 * (initialData), PocketBase es autoritativo y se fusiona al cargar. Las
 * mutaciones son optimistas y escriben a local en onMutate; PB se sincroniza en
 * segundo plano. Forma pública estable: { favoriteIds, toggleFavorite, isFavorite, count }.
 */
export function useFavorites() {
  const qc = useQueryClient()
  const user = getCurrentUser()
  const uid = user?.id ?? null
  const key = qk.favorites(uid)

  const { data: favoriteIds = new Set<string>() } = useQuery({
    queryKey: key,
    // initialData = local → disponible aun offline / sin sesión.
    initialData: loadLocal,
    initialDataUpdatedAt: 0, // fuerza refetch al montar para fusionar con PB
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await pb.collection('exercise_favorites').getFullList({
        filter: pb.filter('user = {:uid}', { uid: uid! }),
        fields: 'exercise_id',
      })
      const pbIds = new Set(res.map(r => r.exercise_id as string))
      const merged = new Set<string>([...loadLocal(), ...pbIds])
      saveLocal(merged)
      return merged
    },
  })

  const toggle = useMutation({
    mutationFn: async (exerciseId: string) => {
      if (!uid) return
      // El estado optimista ya volteó la pertenencia; consultamos PB por la real.
      const existing = await pb.collection('exercise_favorites').getFullList({
        filter: pb.filter('user = {:uid} && exercise_id = {:eid}', { uid, eid: exerciseId }),
      })
      if (existing.length > 0) {
        for (const r of existing) await pb.collection('exercise_favorites').delete(r.id)
      } else {
        await pb.collection('exercise_favorites').create({ user: uid, exercise_id: exerciseId })
      }
    },
    onMutate: async (exerciseId: string) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Set<string>>(key) ?? new Set<string>()
      const next = new Set(prev)
      if (next.has(exerciseId)) next.delete(exerciseId)
      else next.add(exerciseId)
      saveLocal(next)
      qc.setQueryData(key, next)
      return { prev }
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        saveLocal(ctx.prev)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  const toggleFavorite = useCallback(
    (exerciseId: string) => toggle.mutateAsync(exerciseId).catch(() => {}),
    [toggle],
  )

  const isFavorite = useCallback((exerciseId: string) => favoriteIds.has(exerciseId), [favoriteIds])
  const count = useMemo(() => favoriteIds.size, [favoriteIds])

  return { favoriteIds, toggleFavorite, isFavorite, count }
}
