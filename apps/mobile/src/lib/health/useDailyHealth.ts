/**
 * useDailyHealth — lectura ligera (solo PB) del resumen de salud de un día.
 *
 * A diferencia de useHealthSync, NO toca el módulo nativo de Health Connect ni
 * dispara sync: solo lee `daily_health_cache`. Pensado para pantallas que solo
 * quieren consumir el dato ya importado (p.ej. nutrición usa active_calories)
 * sin arrastrar el flujo de permisos/estado. Comparte la misma query key que
 * useHealthSync, así que la sync (que invalida qk.health.all) lo refresca.
 */
import { useQuery } from '@tanstack/react-query'
import { qk } from '@calistenia/core/lib/query-keys'
import type { DailyHealthSummary } from '@calistenia/core/types'
import { useAuthUser } from '@/lib/use-auth-user'
import { readDailyCache } from './sync'

function todayLocal(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Resumen de salud para una fecha (default hoy). null si no hay nada cacheado. */
export function useDailyHealth(date?: string): DailyHealthSummary | null {
  const user = useAuthUser()
  const userId = user?.id ?? null
  const day = date ?? todayLocal()

  const q = useQuery({
    queryKey: qk.health.daily(userId, day),
    queryFn: () => readDailyCache(userId!, day),
    enabled: !!userId,
    staleTime: 60_000,
  })

  return q.data ?? null
}
