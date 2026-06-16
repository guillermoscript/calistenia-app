import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

export const REACTION_EMOJIS = ['🔥', '💪', '👏', '🎯', '🏆'] as const

export type EmojiReactions = Record<string, { count: number; hasReacted: boolean }>
type ReactionsMap = Record<string, EmojiReactions>

/**
 * Reacciones de emoji para sesiones del feed.
 *
 * loadForSessions(ids) registra las sesiones activas → dispara useQuery.
 * La query key incluye los ids ORDENADOS para evitar refetches innecesarios por
 * permutaciones distintas.  toggleReaction es una mutación OPTIMISTA: onMutate
 * actualiza el caché, onError restaura el snapshot.
 * El side-effect notifications.create se preserva fire-and-forget.
 * Forma pública estable: { loadForSessions, toggleReaction, getReactions, REACTION_EMOJIS }.
 */
export function useReactions(userId: string | null) {
  const qc = useQueryClient()

  // sessionIds activos: se actualizan cuando el feed llama loadForSessions()
  const [sessionIds, setSessionIds] = useState<string[]>([])

  // Ref para acceder a sessionIds actuales dentro de callbacks sin stale closures
  const sessionIdsRef = useRef<string[]>([])
  sessionIdsRef.current = sessionIds

  // Key con ids ORDENADOS — evita duplicar entradas de caché por permutaciones
  const key = qk.reactions(userId, [...sessionIds].sort())

  // — Query principal —
  const { data: reactions = {} as ReactionsMap } = useQuery<ReactionsMap>({
    queryKey: key,
    enabled: !!userId && sessionIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const ids = sessionIdsRef.current
      if (!userId || ids.length === 0) return {}

      const available = await isPocketBaseAvailable()
      if (!available) return {}

      // pb.filter() pre-sustituye los placeholders {:sidN}; pasarlos como
      // opciones sueltas NO funciona (el SDK no las sustituye) y devolvía 400.
      const allReactions = await pb.collection('feed_reactions').getFullList({
        filter: pb.filter(
          ids.map((_, i) => `session_id = {:sid${i}}`).join(' || '),
          Object.fromEntries(ids.map((id, i) => [`sid${i}`, id])),
        ),
        $autoCancel: false,
      }).catch(() => [] as any[])

      const map: ReactionsMap = {}
      for (const sid of ids) {
        const sessionReactions = allReactions.filter((r: any) => r.session_id === sid)
        const emojiMap: EmojiReactions = {}

        for (const emoji of REACTION_EMOJIS) {
          const emojiReactions = sessionReactions.filter((r: any) => r.emoji === emoji)
          emojiMap[emoji] = {
            count: emojiReactions.length,
            hasReacted: emojiReactions.some((r: any) => r.reactor === userId),
          }
        }

        // Emojis no estándar que pudieran existir en los datos
        for (const r of sessionReactions) {
          if (!emojiMap[r.emoji]) {
            const emojiReactions = sessionReactions.filter((rx: any) => rx.emoji === r.emoji)
            emojiMap[r.emoji] = {
              count: emojiReactions.length,
              hasReacted: emojiReactions.some((rx: any) => rx.reactor === userId),
            }
          }
        }

        map[sid] = emojiMap
      }
      return map
    },
  })

  // — Mutación OPTIMISTA: toggleReaction —
  const toggleMutation = useMutation({
    mutationFn: async ({
      sessionId,
      emoji,
      hasReacted,
      sessionOwnerId,
    }: {
      sessionId: string
      emoji: string
      hasReacted: boolean
      sessionOwnerId?: string
    }) => {
      if (hasReacted) {
        const existing = await pb.collection('feed_reactions').getFirstListItem(
          `session_id = '${sessionId}' && reactor = '${userId}' && emoji = '${emoji}'`,
          { $autoCancel: false },
        )
        await pb.collection('feed_reactions').delete(existing.id)
      } else {
        await pb.collection('feed_reactions').create({
          session_id: sessionId,
          reactor: userId,
          emoji,
        })

        // Side-effect: notificación al dueño de la sesión — fire-and-forget (se preserva)
        if (sessionOwnerId && sessionOwnerId !== userId) {
          pb.collection('notifications').create({
            user: sessionOwnerId,
            type: 'reaction',
            actor: userId,
            reference_id: sessionId,
            reference_type: 'session',
            read: false,
            data: { emoji },
          }).catch(() => {})
        }
      }
    },
    onMutate: async ({ sessionId, emoji, hasReacted }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ReactionsMap>(key) ?? {}
      const next: ReactionsMap = {
        ...prev,
        [sessionId]: {
          ...prev[sessionId],
          [emoji]: {
            count: (prev[sessionId]?.[emoji]?.count || 0) + (hasReacted ? -1 : 1),
            hasReacted: !hasReacted,
          },
        },
      }
      qc.setQueryData<ReactionsMap>(key, next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    // Sin onSettled/invalidate — las reacciones son efímeras y el caché local
    // ya refleja el estado correcto. Un refetch se dispara cuando cambie la key.
  })

  /**
   * Registra las sesiones activas y dispara la carga de reacciones.
   * Conserva la firma original: (sessionIds: string[]) => void / Promise<void>
   */
  const loadForSessions = useCallback(async (ids: string[]) => {
    if (!userId || ids.length === 0) return
    // Actualizar estado → React re-renderiza → useQuery detecta key nueva → fetch
    setSessionIds(ids)
  }, [userId])

  /** Wrapper público que conserva la firma original. */
  const toggleReaction = useCallback(
    async (sessionId: string, emoji: string, sessionOwnerId?: string) => {
      if (!userId) return
      const available = await isPocketBaseAvailable()
      if (!available) return

      const current = reactions[sessionId]?.[emoji]
      const hasReacted = current?.hasReacted || false

      toggleMutation.mutate({ sessionId, emoji, hasReacted, sessionOwnerId })
    },
    [userId, reactions, toggleMutation],
  )

  const getReactions = useCallback(
    (sessionId: string): EmojiReactions => reactions[sessionId] || {},
    [reactions],
  )

  return { loadForSessions, toggleReaction, getReactions, REACTION_EMOJIS }
}
