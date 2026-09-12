import { useMemo, useState, useCallback } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { pb, getUserAvatarUrl } from '../lib/pocketbase'
import { profileDisplayName } from '../lib/public-profile'
import { qk } from '../lib/query-keys'
import {
  FEED_PAGE_SIZE,
  FEED_SOURCES,
  FEED_SOURCE_KEYS,
  type FeedSourceKey,
  type FeedUserInfo,
} from '../lib/feed-sources'
import type { FeedItem } from '../types/feed'

// El muro se importa desde media docena de sitios como
// `import { type FeedItem } from '.../useActivityFeed'`. El tipo vive ahora en
// `types/feed`, pero se re-exporta para no tocar esos imports.
export type { FeedItem } from '../types/feed'

type FeedMeta = { allUserIds: string[]; userMap: Record<string, FeedUserInfo> }

/** Cursor por fuente: valor crudo de su columna de tiempo. */
type FeedCursors = Partial<Record<FeedSourceKey, string | null>>

const EMPTY_CURSORS: FeedCursors = {}

/**
 * Muro de actividad de los usuarios seguidos.
 *
 * Une SEIS fuentes en un solo hilo cronológico: sesiones de fuerza, cardio,
 * circuitos, retos, carreras y batallas. Cada una vive en `lib/feed-sources.ts`
 * con su consulta y su mapeo; aquí solo está la orquestación.
 *
 * Lee de views públicas (`public_*`) o de colecciones con regla de bloqueo,
 * nunca de las tablas base: desde #386 son owner-only y la lectura ajena va por
 * views que exponen solo las columnas del muro (sin frecuencia cardiaca ni
 * calorías del reloj). Ver `pb_migrations/1783500000_public_read_views.js` y
 * `1784600000_feed_activity_sources.js`.
 *
 * Cadena dependiente y LAZY:
 *  1) metaQuery (qk.feed.meta) resuelve a quién sigo + el mapa de usuarios.
 *  2) useInfiniteQuery (qk.feed.sessions) pagina el muro unificado. Cada página
 *     pide hasta FEED_PAGE_SIZE a cada fuente, une, ordena y devuelve las
 *     primeras FEED_PAGE_SIZE; lo que sobra vuelve a pedirse en la siguiente con
 *     el cursor de SU fuente, no con uno común (ver feed-sources.ts).
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
      const followedIds = followsRes.map(r => r.following as string)
      // Ordenar para estabilizar la query key: mismo conjunto → misma key, sin cache thrash.
      const allUserIds = [...new Set([userId!, ...followedIds])].sort()

      const usersRes = await pb.collection('users').getList(1, allUserIds.length, {
        filter: allUserIds.map(uid => pb.filter('id = {:uid}', { uid })).join(' || '),
        $autoCancel: false,
      }).catch(() => ({ items: [] as Record<string, unknown>[] }))

      const userMap: Record<string, FeedUserInfo> = {}
      for (const u of (usersRes as { items: Record<string, unknown>[] }).items) {
        if (!u) continue
        userMap[u.id as string] = {
          // `profileDisplayName` incluye el escalón `name`, que el alta con
          // Google rellena en vez de `display_name`. Sin él esas cuentas salían
          // como «?» en el muro.
          name: profileDisplayName(u as never) || '?',
          avatarUrl: getUserAvatarUrl(u as never, '100x100'),
        }
      }
      return { allUserIds, userMap }
    },
  })

  const meta = metaQuery.data
  const allUserIds = useMemo(() => meta?.allUserIds ?? [], [meta])

  const feedQuery = useInfiniteQuery({
    queryKey: qk.feed.sessions(userId, allUserIds),
    enabled: !!userId && enabled && !!meta,
    staleTime: 60_000,
    initialPageParam: EMPTY_CURSORS,
    queryFn: async ({ pageParam }: { pageParam: FeedCursors }) => {
      const ctx = {
        userIds: allUserIds,
        viewerId: userId!,
        userMap: meta?.userMap ?? {},
      }

      // Las seis en paralelo: el muro tarda lo que la más lenta, no la suma.
      const results = await Promise.all(
        FEED_SOURCE_KEYS.map(key =>
          FEED_SOURCES[key]({ ...ctx, cursor: pageParam[key] ?? null }).then(r => [key, r] as const),
        ),
      )

      const merged = results
        .flatMap(([, r]) => r.items)
        .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))

      const take = merged.slice(0, FEED_PAGE_SIZE)
      const taken = new Set(take.map(i => i.id))

      // El cursor de cada fuente avanza hasta su ÚLTIMO elemento aceptado. Si de
      // una fuente no entró nada, su cursor no se mueve: sus filas siguen
      // pendientes y deben volver a pedirse tal cual en la página siguiente.
      const nextCursors: FeedCursors = { ...pageParam }
      let anythingLeft = merged.length > take.length
      for (const [key, result] of results) {
        const lastTaken = [...result.items].reverse().find(i => taken.has(i.id))
        if (lastTaken) nextCursors[key] = lastTaken.cursor
        if (result.full) anythingLeft = true
      }

      return { items: take, cursors: nextCursors, hasMore: anythingLeft && take.length > 0 }
    },
    getNextPageParam: (last) => (last.hasMore ? last.cursors : undefined),
  })

  const items = useMemo<FeedItem[]>(() => {
    const pages = feedQuery.data?.pages ?? []
    // Deduplicar por id entre páginas. Con seis fuentes, seis columnas de tiempo
    // y empates al milisegundo, un elemento en el límite exacto de una página
    // puede reaparecer en la siguiente; repetirlo rompe además las keys de React.
    const seen = new Set<string>()
    const out: FeedItem[] = []
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        out.push(item)
      }
    }
    return out
  }, [feedQuery.data])

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

  const hasNextPage = feedQuery.hasNextPage
  const isFetchingNextPage = feedQuery.isFetchingNextPage
  const fetchNextPage = feedQuery.fetchNextPage

  const loadMore = useCallback(async () => {
    if (!hasNextPage || isFetchingNextPage) return
    await fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return {
    items,
    // loading = primera carga únicamente; refreshing = refetch de fondo (para pull-to-refresh)
    loading: metaQuery.isPending || feedQuery.isPending,
    refreshing: (metaQuery.isFetching && !metaQuery.isPending) || (feedQuery.isFetching && !feedQuery.isPending),
    loadingMore: isFetchingNextPage,
    // Antes de la primera carga hasMore es true (igual que el hook previo).
    hasMore: !enabled || !meta ? true : (hasNextPage ?? false),
    load,
    loadMore,
  }
}
