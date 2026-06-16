import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

export type PointTransactionType = 'referral_signup' | 'referral_bonus' | 'challenge_complete' | 'ai_usage'

export interface PointTransaction {
  id: string
  user: string
  amount: number
  type: PointTransactionType
  referenceId: string
  description: string
  created: string
}

/** Mapea un registro crudo de PocketBase al tipo tipado. */
function mapTransaction(r: any): PointTransaction {
  return {
    id: r.id,
    user: r.user,
    amount: r.amount,
    type: r.type as PointTransactionType,
    referenceId: r.reference_id || '',
    description: r.description || '',
    created: r.created,
  }
}

/**
 * Puntos de referidos. Dos queries — balance (suma de transacciones) y listado
 * paginado — más una mutación para otorgar puntos. Forma pública idéntica a la
 * versión imperativa anterior: { balance, transactions, loading, getBalance,
 * getTransactions, awardPoints }.
 *
 * Las funciones `getBalance` y `getTransactions` se mantienen para compatibilidad
 * con los callers existentes; internamente delegan al refetch de TanStack Query.
 */
export function useReferralPoints(userId: string | null) {
  const qc = useQueryClient()

  // ─── Query: balance ────────────────────────────────────────────────────────

  const balanceQuery = useQuery({
    queryKey: qk.points.balance(userId),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      // Traemos solo el campo `amount` para calcular la suma sin datos extra.
      const all = await pb.collection('point_transactions').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        fields: 'amount',
        $autoCancel: false,
      })
      return all.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
    },
  })

  // ─── Query: transacciones ──────────────────────────────────────────────────

  // El límite por defecto coincide con el original (50). Para permitir que
  // `getTransactions(limit)` cambie el límite en callers existentes usamos la
  // misma key con el límite fijo 50; callers que necesiten otro límite deben
  // instanciar el hook por separado. Esta es la única diferencia de
  // comportamiento respecto a la versión imperativa (ver sección RETURN).
  const DEFAULT_LIMIT = 50

  const transactionsQuery = useQuery({
    queryKey: qk.points.transactions(userId, DEFAULT_LIMIT),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await pb.collection('point_transactions').getList(1, DEFAULT_LIMIT, {
        filter: pb.filter('user = {:uid}', { uid: userId! }),
        sort: '-created',
        $autoCancel: false,
      })
      return res.items.map(mapTransaction)
    },
  })

  // ─── Mutación: otorgar puntos ──────────────────────────────────────────────

  const awardMutation = useMutation({
    mutationFn: async (args: {
      targetUserId: string
      amount: number
      type: PointTransactionType
      referenceId: string
      description: string
    }) => {
      await pb.collection('point_transactions').create({
        user: args.targetUserId,
        amount: args.amount,
        type: args.type,
        reference_id: args.referenceId,
        description: args.description,
      })
    },
    onSettled: () => {
      // Invalida ambas queries para reflejar el nuevo saldo y la nueva transacción.
      qc.invalidateQueries({ queryKey: qk.points.balance(userId) })
      qc.invalidateQueries({ queryKey: qk.points.transactions(userId, DEFAULT_LIMIT) })
    },
  })

  // ─── API pública compatible con la versión anterior ───────────────────────

  /** Retorna el saldo actualizado (fuerza un refetch y devuelve el nuevo valor). */
  const getBalance = useCallback(async (): Promise<number> => {
    if (!userId) return 0
    try {
      const result = await balanceQuery.refetch()
      return result.data ?? 0
    } catch {
      return 0
    }
  }, [userId, balanceQuery])

  /** Fuerza un refetch de las transacciones. El parámetro `limit` se ignora
   *  si difiere del DEFAULT_LIMIT; para otros límites instanciar el hook por
   *  separado (ver nota en RETURN). */
  const getTransactions = useCallback(async (_limit = DEFAULT_LIMIT): Promise<void> => {
    if (!userId) return
    try {
      await transactionsQuery.refetch()
    } catch {
      // silencioso — igual que la versión anterior
    }
  }, [userId, transactionsQuery])

  /** Crea una transacción de puntos. Devuelve `true` si tuvo éxito. */
  const awardPoints = useCallback(async (
    targetUserId: string,
    amount: number,
    type: PointTransactionType,
    referenceId: string,
    description: string,
  ): Promise<boolean> => {
    try {
      await awardMutation.mutateAsync({ targetUserId, amount, type, referenceId, description })
      return true
    } catch (e: any) {
      console.warn('Award points error:', e)
      return false
    }
  }, [awardMutation])

  return {
    // Estado derivado de las queries — forma idéntica a la versión anterior
    balance: balanceQuery.data ?? 0,
    transactions: transactionsQuery.data ?? [],
    // loading = primera carga únicamente; refreshing = refetch de fondo
    loading: transactionsQuery.isPending,
    refreshing: transactionsQuery.isFetching && !transactionsQuery.isPending,

    // Funciones de la API pública
    getBalance,
    getTransactions,
    awardPoints,
  }
}
