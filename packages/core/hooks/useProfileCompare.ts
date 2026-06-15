import { useCallback, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { startOfWeekStr, todayStr, localMidnightAsUTC } from '../lib/dateUtils'

export interface CompareStats {
  sessionsThisWeek: number
  sessionsThisMonth: number
  phase: number
  /** Calidad de sueño promedio (1-5) en los últimos 7 días, o null si no hay datos */
  sleepAvgQuality: number | null
  /** Días con entradas de nutrición en los últimos 7 días / 7 */
  nutritionAdherence: number | null
}

const EMPTY_STATS: CompareStats = {
  sessionsThisWeek: 0,
  sessionsThisMonth: 0,
  phase: 1,
  sleepAvgQuality: null,
  nutritionAdherence: null,
}

/**
 * Estadísticas extendidas de comparación de perfil. Migrado a TanStack Query
 * conservando el contrato imperativo original: el hook no recibe argumentos y el
 * fetch se dispara al llamar `load(userId)` (la página compara dos usuarios con
 * dos instancias del hook). `load` guarda el userId en estado local, lo que
 * habilita la query — RQ cachea por usuario/semana/mes.
 *
 * Solo consulta colecciones de lectura pública (sessions, settings,
 * sleep_entries, nutrition_entries).
 */
export function useProfileCompare() {
  const [userId, setUserId] = useState<string | null>(null)
  // Calculamos los límites de fecha aquí para que formen parte de la query key
  // y el caché sea por semana/mes — si cambia el día, la key cambia y se refetch.
  const today = todayStr()
  const weekStartStr = startOfWeekStr()
  const monthYYYYMM = today.slice(0, 7)

  const queryKey = qk.profileCompare(userId, weekStartStr, monthYYYYMM)

  const { data, isFetching, refetch } = useQuery<CompareStats>({
    queryKey,
    enabled: !!userId,
    // 5 min: los stats de comparación no cambian frecuentemente dentro de una sesión
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CompareStats> => {
      // Recalculamos dentro del queryFn para asegurar valores frescos al ejecutar
      const innerToday = todayStr()
      const weekStart = localMidnightAsUTC(startOfWeekStr())
      const monthStart = localMidnightAsUTC(`${innerToday.slice(0, 7)}-01`)

      // Ventana de 7 días para sueño y nutrición
      const d = new Date()
      d.setDate(d.getDate() - 7)
      const sevenDaysAgo = d.toISOString()

      // 5 lecturas en paralelo — misma lógica que el hook original
      const [weekSessions, monthSessions, settingsRes, sleepRes, nutritionRes] =
        await Promise.all([
          pb
            .collection('sessions')
            .getList(1, 1, {
              filter: pb.filter('user = {:uid} && completed_at >= {:start}', {
                uid: userId!,
                start: weekStart,
              }),
              $autoCancel: false,
            })
            .catch(() => ({ totalItems: 0 })),
          pb
            .collection('sessions')
            .getList(1, 1, {
              filter: pb.filter('user = {:uid} && completed_at >= {:start}', {
                uid: userId!,
                start: monthStart,
              }),
              $autoCancel: false,
            })
            .catch(() => ({ totalItems: 0 })),
          pb
            .collection('settings')
            .getFirstListItem(pb.filter('user = {:uid}', { uid: userId! }), {
              $autoCancel: false,
            })
            .catch(() => null),
          pb
            .collection('sleep_entries')
            .getList(1, 7, {
              filter: pb.filter('user = {:uid} && created >= {:start}', {
                uid: userId!,
                start: sevenDaysAgo,
              }),
              sort: '-date',
              $autoCancel: false,
            })
            .catch(() => null),
          pb
            .collection('nutrition_entries')
            .getList(1, 50, {
              filter: pb.filter('user = {:uid} && created >= {:start}', {
                uid: userId!,
                start: sevenDaysAgo,
              }),
              $autoCancel: false,
            })
            .catch(() => null),
        ])

      // Calidad de sueño promedio
      let sleepAvgQuality: number | null = null
      if (sleepRes && (sleepRes as any).items?.length > 0) {
        const items = (sleepRes as any).items as any[]
        const total = items.reduce(
          (sum: number, e: any) => sum + (e.quality || 0),
          0,
        )
        sleepAvgQuality = Math.round((total / items.length) * 10) / 10
      }

      // Adherencia nutricional: días únicos con entradas / 7
      let nutritionAdherence: number | null = null
      if (nutritionRes && (nutritionRes as any).items?.length > 0) {
        const items = (nutritionRes as any).items as any[]
        const uniqueDays = new Set(
          items.map((e: any) => e.date || e.created?.slice(0, 10)),
        )
        nutritionAdherence = Math.round((uniqueDays.size / 7) * 100)
      }

      return {
        sessionsThisWeek: (weekSessions as any).totalItems || 0,
        sessionsThisMonth: (monthSessions as any).totalItems || 0,
        phase: (settingsRes as any)?.phase || 1,
        sleepAvgQuality,
        nutritionAdherence,
      }
    },
  })

  // Contrato original: load(userId) dispara el fetch. Guardamos el userId en
  // estado (habilita la query). Si es el mismo userId ya cargado, forzamos un
  // refetch explícito para igualar el comportamiento imperativo previo.
  const load = useCallback(
    (id: string) => {
      setUserId((prev) => {
        if (prev === id) refetch().catch(() => {})
        return id
      })
    },
    [refetch],
  )

  return {
    stats: data ?? EMPTY_STATS,
    loading: isFetching,
    load,
  }
}
