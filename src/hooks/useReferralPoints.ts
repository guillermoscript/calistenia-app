import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

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

export function useReferralPoints(userId: string | null) {
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState<PointTransaction[]>([])
  const [loading, setLoading] = useState(false)

  const getBalance = useCallback(async (): Promise<number> => {
    if (!userId) return 0
    const available = await isPocketBaseAvailable()
    if (!available) return 0

    try {
      const all = await pb.collection('point_transactions').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId }),
        fields: 'amount',
        $autoCancel: false,
      })

      const total = all.reduce((sum, t: any) => sum + (t.amount || 0), 0)
      setBalance(total)
      return total
    } catch {
      return 0
    }
  }, [userId])

  const getTransactions = useCallback(async (limit = 50) => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      const res = await pb.collection('point_transactions').getList(1, limit, {
        filter: pb.filter('user = {:uid}', { uid: userId }),
        sort: '-created',
        $autoCancel: false,
      })

      const items: PointTransaction[] = res.items.map((r: any) => ({
        id: r.id,
        user: r.user,
        amount: r.amount,
        type: r.type as PointTransactionType,
        referenceId: r.reference_id || '',
        description: r.description || '',
        created: r.created,
      }))

      setTransactions(items)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [userId])

  const awardPoints = useCallback(async (
    targetUserId: string,
    amount: number,
    type: PointTransactionType,
    referenceId: string,
    description: string
  ): Promise<boolean> => {
    const available = await isPocketBaseAvailable()
    if (!available) return false

    try {
      await pb.collection('point_transactions').create({
        user: targetUserId,
        amount,
        type,
        reference_id: referenceId,
        description,
      })
      return true
    } catch (e: any) {
      console.warn('Award points error:', e)
      return false
    }
  }, [])

  return {
    balance,
    transactions,
    loading,
    getBalance,
    getTransactions,
    awardPoints,
  }
}
