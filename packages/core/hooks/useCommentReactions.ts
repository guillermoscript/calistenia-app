import { useState, useCallback } from 'react'
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

export const COMMENT_REACTION_EMOJIS = ['🔥', '💪', '👏', '❤️'] as const

export type CommentEmojiReactions = Record<string, { count: number; hasReacted: boolean }>
type ReactionsMap = Record<string, CommentEmojiReactions>

/** Construye el mapa de emojis para un comment dado sus reacciones brutas de PB. */
function buildEmojiMap(
  commentReactions: any[],
  userId: string,
): CommentEmojiReactions {
  const emojiMap: CommentEmojiReactions = {}

  // Emojis estándar primero — mantiene orden predecible en la UI.
  for (const emoji of COMMENT_REACTION_EMOJIS) {
    const hits = commentReactions.filter((r: any) => r.emoji === emoji)
    emojiMap[emoji] = {
      count: hits.length,
      hasReacted: hits.some((r: any) => r.reactor === userId),
    }
  }

  // Emojis no estándar que puedan existir en la colección.
  for (const r of commentReactions) {
    if (!emojiMap[r.emoji]) {
      const hits = commentReactions.filter((rx: any) => rx.emoji === r.emoji)
      emojiMap[r.emoji] = {
        count: hits.length,
        hasReacted: hits.some((rx: any) => rx.reactor === userId),
      }
    }
  }

  return emojiMap
}

/**
 * Reacciones por comentario, migrado a TanStack Query.
 *
 * - Una query por comentario: `qk.commentReactions(commentId, userId)`, staleTime 30 s.
 * - `commentIds` se ordenan antes de construir la lista de queries → orden estable
 *   aunque el caller cambie el array entre renders.
 * - `toggleReaction` es optimista: onMutate actualiza la entrada de caché del
 *   comentario afectado; onError revierte con el snapshot previo.
 * - Forma pública idéntica: { loadForComments, toggleReaction, getReactions }.
 *
 * CAMBIO DE COMPORTAMIENTO FORZADO: `loadForComments` ya no dispara fetches
 * imperativos — simplemente registra los ids que deben estar activos. Las queries
 * se lanzan de forma declarativa en cuanto se añaden al array; el TTL de 30 s lo
 * gestiona TanStack Query vía staleTime.
 */
export function useCommentReactions(userId: string | null) {
  const qc = useQueryClient()

  // Lista de commentIds registrados. Se añaden mediante loadForComments.
  const [commentIds, setCommentIds] = useState<string[]>([])

  // Ordenar para garantizar orden estable de queries entre renders.
  const sortedIds = [...commentIds].sort()

  // Una query declarativa por comentario. TanStack Query las gestiona en paralelo.
  useQueries({
    queries: sortedIds.map((commentId) => ({
      queryKey: qk.commentReactions(commentId, userId),
      staleTime: 30_000,
      enabled: !!userId,
      queryFn: async (): Promise<CommentEmojiReactions> => {
        const available = await isPocketBaseAvailable()
        if (!available) return {}

        const rows = await pb
          .collection('comment_reactions')
          .getFullList({
            filter: pb.filter('comment_id = {:cid}', { cid: commentId }),
            $autoCancel: false,
          })
          .catch(() => [] as any[])

        return buildEmojiMap(rows, userId!)
      },
    })),
  })

  /**
   * Registra commentIds para que sus queries se activen.
   * En la implementación anterior este método hacía fetches imperativos;
   * ahora simplemente añade ids nuevos al estado declarativo.
   */
  // async para conservar la firma pública previa (Promise<void>); el registro de
  // commentIds es síncrono — useQueries dispara los fetches de forma declarativa.
  const loadForComments = useCallback(async (ids: string[]): Promise<void> => {
    if (!userId || ids.length === 0) return
    setCommentIds((prev) => {
      const prevSet = new Set(prev)
      const toAdd = ids.filter((id) => !prevSet.has(id))
      return toAdd.length > 0 ? [...prev, ...toAdd] : prev
    })
  }, [userId])

  const toggleMutation = useMutation({
    mutationFn: async ({
      commentId,
      emoji,
    }: {
      commentId: string
      emoji: string
    }) => {
      if (!userId) return
      const available = await isPocketBaseAvailable()
      if (!available) return

      // Leer el estado actual de la cache para saber si ya reaccionó.
      const cached = qc.getQueryData<CommentEmojiReactions>(
        qk.commentReactions(commentId, userId),
      )
      const hasReacted = cached?.[emoji]?.hasReacted ?? false

      if (hasReacted) {
        const existing = await pb
          .collection('comment_reactions')
          .getFirstListItem(
            `comment_id = '${commentId}' && reactor = '${userId}' && emoji = '${emoji}'`,
            { $autoCancel: false },
          )
        await pb.collection('comment_reactions').delete(existing.id)
      } else {
        await pb.collection('comment_reactions').create({
          comment_id: commentId,
          reactor: userId,
          emoji,
        })
      }
    },

    onMutate: async ({ commentId, emoji }) => {
      if (!userId) return

      const key = qk.commentReactions(commentId, userId)

      // Cancelar queries en vuelo para el comentario afectado.
      await qc.cancelQueries({ queryKey: key })

      // Snapshot previo para rollback.
      const prev = qc.getQueryData<CommentEmojiReactions>(key) ?? {}

      const current = prev[emoji] ?? { count: 0, hasReacted: false }
      const hasReacted = current.hasReacted

      // Aplicar cambio optimista en la caché del comentario.
      qc.setQueryData<CommentEmojiReactions>(key, {
        ...prev,
        [emoji]: {
          count: current.count + (hasReacted ? -1 : 1),
          hasReacted: !hasReacted,
        },
      })

      return { prev, commentId, emoji }
    },

    onError: (_err, { commentId }, ctx) => {
      // Revertir al snapshot previo si la mutación falla.
      if (!userId || !ctx?.prev) return
      const key = qk.commentReactions(commentId, userId)
      qc.setQueryData<CommentEmojiReactions>(key, ctx.prev)
    },
  })

  /**
   * Alterna una reacción de forma optimista.
   * Firma pública idéntica a la implementación anterior.
   */
  const toggleReaction = useCallback(
    // async para conservar la firma pública previa (Promise<void>).
    async (commentId: string, emoji: string): Promise<void> => {
      await toggleMutation.mutateAsync({ commentId, emoji }).catch(() => {})
    },
    [toggleMutation],
  )

  /**
   * Devuelve las reacciones de un comentario desde la caché de TanStack Query.
   * Firma pública idéntica a la implementación anterior.
   */
  const getReactions = useCallback(
    (commentId: string): CommentEmojiReactions => {
      if (!userId) return {}
      return (
        qc.getQueryData<CommentEmojiReactions>(
          qk.commentReactions(commentId, userId),
        ) ?? {}
      )
    },
    [qc, userId],
  )

  return { loadForComments, toggleReaction, getReactions }
}
