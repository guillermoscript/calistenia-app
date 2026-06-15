import { storage } from '../platform'
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

const LS_KEY = 'calistenia_rest_prefs'

// — Helpers de persistencia local —
const lsGet = (): Record<string, number> => {
  try { return JSON.parse(storage.getItem(LS_KEY) || '{}') } catch { return {} }
}
const lsSet = (d: Record<string, number>) => {
  try { storage.setItem(LS_KEY, JSON.stringify(d)) } catch { /* storage lleno */ }
}

// Forma del caché: prefs = mapa exerciseId→segundos, pbIds = mapa exerciseId→id PB
interface RestPrefsCache {
  prefs: Record<string, number>
  pbIds: Record<string, string>
}

interface UseRestPreferencesReturn {
  getRestForExercise: (exerciseId: string, defaultRest: number) => number
  setRestForExercise: (exerciseId: string, seconds: number) => Promise<void>
  isReady: boolean
}

export function useRestPreferences(userId: string | null = null): UseRestPreferencesReturn {
  const qc = useQueryClient()
  // TODO: mover a qk  →  qk.restPreferences ya existe en query-keys.ts
  const key = qk.restPreferences(userId)

  // — Query principal: carga desde PB si hay sesión, cae a localStorage —
  const { data, isFetched } = useQuery<RestPrefsCache>({
    queryKey: key,
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    // initialData proviene de localStorage para disponibilidad offline/sin-sesión.
    // initialDataUpdatedAt: 0 forza el refetch a PB al montar.
    initialData: () => ({ prefs: lsGet(), pbIds: {} }),
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<RestPrefsCache> => {
      const available = await isPocketBaseAvailable()
      if (!available || !userId) {
        // Sin PB: devolvemos solo lo que hay en localStorage
        return { prefs: lsGet(), pbIds: {} }
      }
      try {
        // getFullList elimina el límite implícito de 500: obtiene todas las preferencias del usuario
        const res = await pb.collection('rest_preferences').getFullList({
          filter: pb.filter('user = {:uid}', { uid: userId }),
        })
        const prefs: Record<string, number> = {}
        const pbIds: Record<string, string> = {}
        res.forEach((r: any) => {
          prefs[r.exercise_id] = r.rest_seconds
          pbIds[r.exercise_id] = r.id
        })
        // Sincronizamos PB → localStorage como caché offline
        lsSet(prefs)
        return { prefs, pbIds }
      } catch {
        // PB falló: caemos a localStorage
        return { prefs: lsGet(), pbIds: {} }
      }
    },
  })

  const prefs = data?.prefs ?? {}
  const pbIds = data?.pbIds ?? {}

  // — Mutación optimista: actualiza caché + localStorage de inmediato —
  const mutation = useMutation<void, Error, { exerciseId: string; seconds: number }, { prev: RestPrefsCache }>({
    mutationFn: async ({ exerciseId, seconds }) => {
      // Solo persiste en PB si hay userId y PB disponible
      if (!userId) return
      const available = await isPocketBaseAvailable()
      if (!available) return

      // pbIds en el snapshot optimista ya fue actualizado por onMutate;
      // leemos el estado post-optimista del caché para obtener el id correcto.
      const snapshot = qc.getQueryData<RestPrefsCache>(key)
      const existingId = snapshot?.pbIds[exerciseId]
      if (existingId) {
        await pb.collection('rest_preferences').update(existingId, { rest_seconds: seconds })
      } else {
        const rec = await pb.collection('rest_preferences').create({
          user: userId,
          exercise_id: exerciseId,
          rest_seconds: seconds,
        })
        // Incorporamos el nuevo id PB al caché sin re-renderizar via mutateAsync
        qc.setQueryData<RestPrefsCache>(key, prev => {
          if (!prev) return prev
          return { ...prev, pbIds: { ...prev.pbIds, [exerciseId]: rec.id } }
        })
      }
    },
    onMutate: async ({ exerciseId, seconds }) => {
      // Cancelamos cualquier refetch en vuelo para no sobreescribir el optimismo
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<RestPrefsCache>(key) ?? { prefs: lsGet(), pbIds: {} }

      // Aplicamos el cambio optimista en caché y en localStorage
      const nextPrefs = { ...prev.prefs, [exerciseId]: seconds }
      lsSet(nextPrefs)
      qc.setQueryData<RestPrefsCache>(key, { ...prev, prefs: nextPrefs })

      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      // Rollback: restauramos el snapshot anterior en caché y en localStorage
      if (ctx?.prev) {
        lsSet(ctx.prev.prefs)
        qc.setQueryData(key, ctx.prev)
      }
    },
  })

  // — Forma pública — firmas idénticas a la versión anterior —

  const getRestForExercise = useCallback(
    (exerciseId: string, defaultRest: number): number => prefs[exerciseId] || defaultRest,
    [prefs],
  )

  const setRestForExercise = useCallback(
    (exerciseId: string, seconds: number): Promise<void> =>
      mutation.mutateAsync({ exerciseId, seconds }).catch(() => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutation.mutateAsync],
  )

  // isReady: true cuando la query ha completado al menos un ciclo (fetch o initialData)
  const isReady = isFetched || !userId

  return { getRestForExercise, setRestForExercise, isReady }
}
