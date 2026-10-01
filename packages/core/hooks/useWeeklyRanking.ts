import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { startOfWeekStr, localMidnightAsUTC } from '../lib/dateUtils'
import { qk } from '../lib/query-keys'
import { authorDisplayName } from '../lib/author-name'
import { countActivitySince, fetchRankingUserIds } from './useLeaderboard'

export interface WeeklyRankingRow {
  userId: string
  displayName: string
  avatarUrl: string | null
  /** Entrenos esta semana (fuerza + circuito + cardio). */
  value: number
  /** Puesto 1-based en el ranking completo de la semana. */
  position: number
  isCurrentUser: boolean
}

export interface WeeklyRanking {
  /** Seguidos aceptados. 0 = no sigue a nadie (estado vacío de Comunidad). */
  followingCount: number
  /** Los `TOP_N` primeros. */
  top: WeeklyRankingRow[]
  /** Mi fila cuando quedo fuera de `top`; `null` si ya salgo arriba. */
  me: WeeklyRankingRow | null
}

const TOP_N = 3

const EMPTY: WeeklyRanking = { followingCount: 0, top: [], me: null }

type Count = { userId: string; value: number }

/**
 * Ordena los recuentos y se queda con los `topN` primeros y con mi puesto si
 * caigo fuera. El empate lo deshace el orden de entrada, igual que en
 * `useLeaderboard`.
 */
export function rankWeekly(counts: Count[], userId: string, topN = TOP_N): { top: (Count & { position: number })[]; me: (Count & { position: number }) | null } {
  const ranked = [...counts]
    .sort((a, b) => b.value - a.value)
    .map((c, i) => ({ ...c, position: i + 1 }))
  const top = ranked.slice(0, topN)
  const mine = ranked.find(c => c.userId === userId) ?? null
  return { top, me: mine && mine.position > topN ? mine : null }
}

/**
 * Resumen del ranking semanal para la pestaña Actividad de Comunidad (#857).
 *
 * `useLeaderboard` pide 9 consultas por persona para las 11 categorías; aquí
 * solo hacen falta los entrenos de la semana (3 por persona) y el nombre de las
 * 3 primeras y el mío. El ranking completo se carga solo al abrir su pestaña.
 */
export function useWeeklyRanking(userId: string | null) {
  const weekStartStr = localMidnightAsUTC(startOfWeekStr())
  const key = useMemo(() => qk.weeklyRanking(userId, weekStartStr), [userId, weekStartStr])

  const query = useQuery({
    queryKey: key,
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<WeeklyRanking> => {
      const { allUserIds, followedIds } = await fetchRankingUserIds(userId!)
      if (followedIds.length === 0) return EMPTY

      const counts = await Promise.all(allUserIds.map(async (uid) => ({
        userId: uid,
        value: await countActivitySince(uid, weekStartStr),
      })))
      const { top, me } = rankWeekly(counts, userId!)

      const visible = me ? [...top, me] : top
      const users = await Promise.all(visible.map(row =>
        pb.collection('users').getOne(row.userId, { $autoCancel: false }).catch(() => null),
      ))
      const toRow = (row: Count & { position: number }, i: number): WeeklyRankingRow => {
        const user = users[i] as any
        return {
          ...row,
          displayName: authorDisplayName(user) || '?',
          avatarUrl: user ? getUserAvatarUrl(user, '100x100') : null,
          isCurrentUser: row.userId === userId,
        }
      }

      return {
        followingCount: followedIds.length,
        top: top.map(toRow),
        me: me ? toRow(me, top.length) : null,
      }
    },
  })

  return {
    ranking: query.data ?? EMPTY,
    loading: query.isPending && !!userId,
    // Solo cuenta como error si no hay nada que enseñar: un refresco fallido con
    // datos previos no debe tirar el resumen que ya se ve.
    error: query.data ? null : query.error ? String((query.error as any)?.message ?? query.error) : null,
    /** Reintenta la carga (el aviso de error de Comunidad). */
    reload: () => { void query.refetch() },
  }
}
