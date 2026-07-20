/**
 * Salud del usuario (condiciones médicas + lesiones) — colección `user_health` (#247).
 *
 * Estos campos vivían en `users`, pero el fix GHSA-wwj3-9h95-wcpf los marcó
 * `hidden` (PII en colección legible por cualquier usuario autenticado): dejaron
 * de serializarse y de poder escribirse con token de usuario, así que los flujos
 * fallaban en silencio. Igual que edad/sexo → `nutrition_goals` (#243), ahora
 * viven en `user_health`, protegida per-user (una fila por usuario, índice único).
 */
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import type { ConditionId, InjuryId } from '../types/onboarding'

export interface UserHealth {
  medical_conditions: ConditionId[]
  injuries: InjuryId[]
}

export const EMPTY_USER_HEALTH: UserHealth = { medical_conditions: [], injuries: [] }

function toList<T extends string>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Lee la fila de salud del usuario; null si aún no existe. */
export async function fetchUserHealth(userId: string): Promise<(UserHealth & { id: string }) | null> {
  try {
    const rec = await pb.collection('user_health').getFirstListItem(
      pb.filter('user = {:uid}', { uid: userId }), { requestKey: null },
    ) as Record<string, unknown> & { id: string }
    return {
      id: rec.id,
      medical_conditions: toList<ConditionId>(rec.medical_conditions),
      injuries: toList<InjuryId>(rec.injuries),
    }
  } catch {
    return null
  }
}

/** Upsert de la fila per-user (índice único en `user`): update si existe, create si no. */
export async function upsertUserHealth(userId: string, values: UserHealth): Promise<void> {
  const existing = await fetchUserHealth(userId)
  if (existing) {
    await pb.collection('user_health').update(existing.id, values, { requestKey: null })
    return
  }
  try {
    await pb.collection('user_health').create({ user: userId, ...values }, { requestKey: null })
  } catch (e) {
    // Índice único: otro dispositivo creó la fila primero → reintenta como update.
    const again = await fetchUserHealth(userId)
    if (!again) throw e
    await pb.collection('user_health').update(again.id, values, { requestKey: null })
  }
}

export function useUserHealth(userId: string | null | undefined) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: qk.userHealth(userId ?? null),
    enabled: !!userId,
    queryFn: () => fetchUserHealth(userId!),
  })

  // Identidad estable para no re-renderizar consumidores memoizados (ExerciseCard).
  const health = useMemo<UserHealth>(() => query.data
    ? { medical_conditions: query.data.medical_conditions, injuries: query.data.injuries }
    : EMPTY_USER_HEALTH, [query.data])

  const save = useMutation({
    mutationFn: (values: UserHealth) => upsertUserHealth(userId!, values),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.userHealth(userId ?? null) }),
  })

  return {
    health,
    isLoading: query.isLoading,
    saveHealth: save.mutateAsync,
  }
}
