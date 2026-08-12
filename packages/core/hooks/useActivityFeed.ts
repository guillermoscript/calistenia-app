import { useState, useCallback } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { utcToLocalDateStr } from '../lib/dateUtils'
import { WORKOUTS } from '../data/workouts'
import { qk } from '../lib/query-keys'
import { NO_PHASE, sessionKeyLabel, sessionKeyParts } from '../lib/session-key'

export interface FeedItem {
  id: string
  type: 'workout' | 'cardio'        // discriminator
  userId: string
  displayName: string
  avatarUrl: string | null
  completedAt: string               // sortable UTC datetime (sessions: completed_at; cardio: created)
  date: string
  // workout-only (type==='workout'): keep existing semantics
  workoutKey: string
  workoutTitle: string
  /**
   * 1-4 para sesiones de programa. `NO_PHASE` (0) cuando la actividad no tiene
   * fase: cardio y —desde #376— sesiones libres/manuales. Quien lo pinte debe
   * ocultar la etiqueta "Fase" en ese caso.
   */
  phase: number
  note: string
  // cardio-only (type==='cardio'); undefined for workouts
  cardio?: {
    activityType: string            // 'running' | 'walking' | 'cycling' | other
    distanceKm: number | null
    durationSeconds: number | null
    avgPace: number | null
  }
}

const PAGE_SIZE = 20

type UserInfo = { name: string; avatarUrl: string | null }
type FeedMeta = { allUserIds: string[]; userMap: Record<string, UserInfo> }

/** Etiqueta corta por tipo de actividad cardio (en español). */
function cardioTitle(activityType: string): string {
  switch (activityType) {
    case 'running':  return 'Carrera'
    case 'walking':  return 'Caminata'
    case 'cycling':  return 'Ciclismo'
    default:         return activityType || 'Cardio'
  }
}

function mapSession(s: any, userMap: Record<string, UserInfo>): FeedItem {
  const workout = WORKOUTS[s.workout_key]
  const { isFree } = sessionKeyParts(s.workout_key || '')
  return {
    id: s.id,
    type: 'workout',
    userId: s.user,
    displayName: userMap[s.user]?.name || '?',
    avatarUrl: userMap[s.user]?.avatarUrl || null,
    // Normalizado a ISO (con 'T') para que el cursor compare consistente con
    // cardio.finished_at (campo TEXT ISO) — sessions.completed_at es DATE.
    completedAt: (s.completed_at || '').replace(' ', 'T'),
    date: utcToLocalDateStr(s.completed_at || s.created || ''),
    workoutKey: s.workout_key,
    // Sin este fallback, una sesión libre aparecería en el feed con su clave
    // cruda (`free_1783000000`) como título.
    workoutTitle: workout?.title || sessionKeyLabel(s.workout_key || ''),
    // `?? 1` y no `|| 1`: el 0 de una sesión libre es un valor legítimo que no
    // debe degradarse a "Fase 1".
    phase: isFree ? NO_PHASE : (s.phase ?? 1),
    note: s.note || '',
  }
}

function mapCardio(c: any, userMap: Record<string, UserInfo>): FeedItem {
  // cardio_sessions NO tiene campo `created`; usar finished_at (hora de fin, ISO).
  const completedAt: string = c.finished_at || c.started_at || ''
  return {
    id: c.id,
    type: 'cardio',
    userId: c.user,
    displayName: userMap[c.user]?.name || '?',
    avatarUrl: userMap[c.user]?.avatarUrl || null,
    completedAt,
    date: utcToLocalDateStr(completedAt),
    workoutKey: '',
    workoutTitle: cardioTitle(c.activity_type || ''),
    phase: NO_PHASE,
    note: c.note || '',
    cardio: {
      activityType: c.activity_type || '',
      distanceKm: c.distance_km ?? null,
      durationSeconds: c.duration_seconds ?? null,
      avgPace: c.avg_pace ?? null,
    },
  }
}

/**
 * Lee de `public_sessions` / `public_cardio_sessions`, no de las tablas base:
 * desde #386 estas son owner-only y la lectura ajena va por las views, que
 * exponen solo las columnas del muro (sin frecuencia cardiaca ni calorías del
 * reloj). Ver pb_migrations/1783500000_public_read_views.js.
 *
 * Feed de actividad de seguidos. Migrado a paginación por cursor de timestamp
 * para poder unir sessions + cardio_sessions en un feed ordenado cronológicamente.
 *
 * Cadena dependiente y LAZY:
 *  1) metaQuery (qk.feed.meta) resuelve a quién sigo + mapa de usuarios.
 *  2) useInfiniteQuery (qk.feed.sessions) pagina el feed unificado usando
 *     timestamp-cursor (initialPageParam: ''). Cada página busca hasta
 *     PAGE_SIZE en cada colección, une, ordena y devuelve los primeros PAGE_SIZE.
 * `load` habilita la cadena; `loadMore` = fetchNextPage. staleTime 60s.
 */
export function useActivityFeed(userId: string | null) {
  const qc = useQueryClient()
  const [enabled, setEnabled] = useState(false)

  const metaQuery = useQuery({
    queryKey: qk.feed.meta(userId),
    enabled: !!userId && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<FeedMeta> => {
      const followsRes = await pb.collection('follows').getFullList({
        filter: pb.filter('follower = {:uid}', { uid: userId! }),
        $autoCancel: false,
      })
      const followedIds = followsRes.map((r: any) => r.following as string)
      // Ordenar para estabilizar la query key: mismo conjunto → misma key, sin cache thrash.
      const allUserIds = [...new Set([userId!, ...followedIds])].sort()

      const usersRes = await pb.collection('users').getList(1, allUserIds.length, {
        filter: allUserIds.map(uid => pb.filter('id = {:uid}', { uid })).join(' || '),
        $autoCancel: false,
      }).catch(() => ({ items: [] as any[] }))

      const userMap: Record<string, UserInfo> = {}
      ;(usersRes as any).items.forEach((u: any) => {
        if (u) userMap[u.id] = {
          name: u.display_name || u.email?.split('@')[0] || '?',
          avatarUrl: getUserAvatarUrl(u, '100x100'),
        }
      })
      return { allUserIds, userMap }
    },
  })

  const meta = metaQuery.data
  const allUserIds = meta?.allUserIds ?? []

  const feedQuery = useInfiniteQuery({
    queryKey: qk.feed.sessions(userId, allUserIds),
    enabled: !!userId && enabled && !!meta,
    staleTime: 60_000,
    initialPageParam: '' as string,
    queryFn: async ({ pageParam }: { pageParam: string }) => {
      const userMap = meta?.userMap ?? {}

      // Filtro base por usuarios seguidos (incluye el propio userId)
      const uidFilter = allUserIds.map(uid => pb.filter('user = {:uid}', { uid })).join(' || ')

      // — sessions —
      const sessionsFilter = pageParam
        ? `(${uidFilter}) && (${pb.filter('completed_at < {:c}', { c: pageParam })})`
        : uidFilter
      const sessionsRes = await pb.collection('public_sessions').getList(1, PAGE_SIZE, {
        filter: sessionsFilter,
        sort: '-completed_at',
        $autoCancel: false,
      }).catch(() => ({ items: [] as any[] }))

      // — cardio (ordena por finished_at, no existe `created`). La ruta ya ni
      //   siquiera está en el registro: vive en `cardio_routes` (#299). —
      const cardioFilter = pageParam
        ? `(${uidFilter}) && (${pb.filter('finished_at < {:c}', { c: pageParam })})`
        : uidFilter
      const cardioRes = await pb.collection('public_cardio_sessions').getList(1, PAGE_SIZE, {
        filter: cardioFilter,
        sort: '-finished_at',
        $autoCancel: false,
        fields: 'id,user,activity_type,distance_km,duration_seconds,avg_pace,note,started_at,finished_at',
      }).catch(() => ({ items: [] as any[] }))

      const sessionItems: FeedItem[] = ((sessionsRes as any).items || []).map((s: any) => mapSession(s, userMap))
      const cardioItems: FeedItem[]  = ((cardioRes  as any).items || []).map((c: any) => mapCardio(c, userMap))

      // Unir y ordenar por completedAt descendente
      const merged = [...sessionItems, ...cardioItems].sort((a, b) => {
        const ta = new Date(a.completedAt.replace(' ', 'T')).getTime()
        const tb = new Date(b.completedAt.replace(' ', 'T')).getTime()
        return tb - ta
      })

      const take = merged.slice(0, PAGE_SIZE)

      const hasMore =
        (sessionsRes as any).items?.length === PAGE_SIZE ||
        (cardioRes  as any).items?.length === PAGE_SIZE

      const nextCursor: string | undefined =
        hasMore && take.length ? take[take.length - 1].completedAt : undefined

      return { items: take, nextCursor }
    },
    getNextPageParam: (last) => last.nextCursor,   // undefined detiene la paginación
  })

  const items = feedQuery.data?.pages.flatMap(p => p.items) ?? []

  const load = useCallback(async () => {
    if (!userId) return
    setEnabled((prev) => {
      if (prev) {
        qc.invalidateQueries({ queryKey: qk.feed.meta(userId) })
        qc.invalidateQueries({ queryKey: qk.feed.all })
      }
      return true
    })
  }, [userId, qc])

  const loadMore = useCallback(async () => {
    if (!feedQuery.hasNextPage || feedQuery.isFetchingNextPage) return
    await feedQuery.fetchNextPage()
  }, [feedQuery])

  return {
    items,
    // loading = primera carga únicamente; refreshing = refetch de fondo (para pull-to-refresh)
    loading: metaQuery.isPending || feedQuery.isPending,
    refreshing: (metaQuery.isFetching && !metaQuery.isPending) || (feedQuery.isFetching && !feedQuery.isPending),
    loadingMore: feedQuery.isFetchingNextPage,
    // Antes de la primera carga hasMore es true (igual que el hook previo).
    hasMore: !enabled || !meta ? true : (feedQuery.hasNextPage ?? false),
    load,
    loadMore,
  }
}
