import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  push_enabled: boolean
  reactions: boolean
  comments: boolean
  follows: boolean
  challenges: boolean
  own_milestones: boolean
  referrals: boolean
  friend_workouts: boolean
  friend_streaks: boolean
  friend_achievements: boolean
}

/** Orden canónico para renderizar los toggles en la UI de ajustes. */
export const NOTIFICATION_PREF_KEYS: (keyof NotificationPrefs)[] = [
  'push_enabled',
  'reactions',
  'comments',
  'follows',
  'challenges',
  'own_milestones',
  'referrals',
  'friend_workouts',
  'friend_streaks',
  'friend_achievements',
]

/** Opt-out model: sin fila en PB → todo activado. */
export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  push_enabled: true,
  reactions: true,
  comments: true,
  follows: true,
  challenges: true,
  own_milestones: true,
  referrals: true,
  friend_workouts: true,
  friend_streaks: true,
  friend_achievements: true,
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Mezcla los campos booleanos del registro de PB con los defaults. */
function mapPrefs(row: Record<string, any>): NotificationPrefs {
  const merged: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS }
  for (const k of NOTIFICATION_PREF_KEYS) {
    if (typeof row[k] === 'boolean') {
      merged[k] = row[k]
    }
  }
  return merged
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Preferencias de notificación de un usuario (collection notification_prefs).
 * Modelo opt-out: fila ausente o campo ausente → habilitado (true).
 *
 * Forma pública:
 *   { prefs, loading, saving, setPref }
 *
 * setPref hace un upsert optimista: actualiza el caché, luego create/update en PB.
 * Si PB falla, revierte el caché e invalida la query para refetch limpio.
 */
export function useNotificationPrefs(userId: string | null) {
  const qc = useQueryClient()
  const key = qk.notificationPrefs(userId)

  // ── Query ─────────────────────────────────────────────────────────────────

  const { data, isPending: loading } = useQuery<{ prefs: NotificationPrefs; rowId: string | null }>({
    queryKey: key,
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        const row = await pb.collection('notification_prefs').getFirstListItem(
          pb.filter('user = {:uid}', { uid: userId! }),
          { $autoCancel: false },
        )
        return { prefs: mapPrefs(row), rowId: row.id }
      } catch (err: any) {
        // 404 o "not found" → sin fila; usar defaults.
        if (err?.status === 404 || err?.message?.includes('not found') || err?.message?.includes('No records found')) {
          return { prefs: { ...DEFAULT_NOTIFICATION_PREFS }, rowId: null }
        }
        throw err
      }
    },
  })

  const prefs = data?.prefs ?? { ...DEFAULT_NOTIFICATION_PREFS }
  const rowId = data?.rowId ?? null

  // ── Mutación: setPref ─────────────────────────────────────────────────────

  const setPrefMutation = useMutation<
    { rowId: string },
    Error,
    { key: keyof NotificationPrefs; value: boolean }
  >({
    mutationFn: async ({ key: prefKey, value }) => {
      if (!userId) throw new Error('sin sesión')

      if (rowId) {
        await pb.collection('notification_prefs').update(rowId, { [prefKey]: value })
        return { rowId }
      } else {
        // Primera escritura: crear la fila completa con defaults + este cambio.
        const rec = await pb.collection('notification_prefs').create({
          user: userId,
          ...DEFAULT_NOTIFICATION_PREFS,
          [prefKey]: value,
        })
        return { rowId: rec.id }
      }
    },
    onMutate: async ({ key: prefKey, value }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<{ prefs: NotificationPrefs; rowId: string | null }>(key)

      // Actualización optimista del caché.
      qc.setQueryData<{ prefs: NotificationPrefs; rowId: string | null }>(key, (cur) => {
        const base = cur ?? { prefs: { ...DEFAULT_NOTIFICATION_PREFS }, rowId: null }
        return { ...base, prefs: { ...base.prefs, [prefKey]: value } }
      })

      return { prev }
    },
    onSuccess: (result, _vars, ctx: any) => {
      // Si se creó una fila nueva, persistimos el rowId real en el caché.
      if (!ctx?.prev?.rowId && result.rowId) {
        qc.setQueryData<{ prefs: NotificationPrefs; rowId: string | null }>(key, (cur) => {
          if (!cur) return cur
          return { ...cur, rowId: result.rowId }
        })
      }
    },
    onError: (_err, _vars, ctx: any) => {
      // Revertir el caché optimista.
      if (ctx?.prev !== undefined) {
        qc.setQueryData(key, ctx.prev)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key })
    },
  })

  const saving = setPrefMutation.isPending

  const setPref = useCallback(
    (prefKey: keyof NotificationPrefs, value: boolean) => {
      setPrefMutation.mutate({ key: prefKey, value })
    },
    [setPrefMutation],
  )

  return { prefs, loading, saving, setPref }
}
