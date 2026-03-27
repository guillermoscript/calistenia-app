import { useState, useCallback } from 'react'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'

export interface Referral {
  id: string
  referrer: string
  referred: string
  referredName: string
  referredAvatar: string
  source: 'quick_invite' | 'challenge'
  challengeId: string | null
  created: string
}

export interface ReferralStats {
  totalReferred: number
  pointsBalance: number
  totalEarned: number
}

export function useReferrals(userId: string | null) {
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [stats, setStats] = useState<ReferralStats>({ totalReferred: 0, pointsBalance: 0, totalEarned: 0 })
  const [loading, setLoading] = useState(false)

  const getReferrals = useCallback(async () => {
    if (!userId) return
    const available = await isPocketBaseAvailable()
    if (!available) return

    setLoading(true)
    try {
      const res = await pb.collection('referrals').getFullList({
        filter: pb.filter('referrer = {:uid}', { uid: userId }),
        sort: '-created',
        expand: 'referred',
        $autoCancel: false,
      })

      const items: Referral[] = res.map((r: any) => ({
        id: r.id,
        referrer: r.referrer,
        referred: r.referred,
        referredName: r.expand?.referred?.display_name || r.expand?.referred?.email?.split('@')[0] || '?',
        referredAvatar: r.expand?.referred?.avatar || '',
        source: r.source,
        challengeId: r.challenge_id || null,
        created: r.created,
      }))

      setReferrals(items)
    } catch (e: any) {
      if (e?.status !== 404 && e?.status !== 0) {
        console.warn('Referrals load error:', e)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  const getReferralStats = useCallback(async (): Promise<ReferralStats> => {
    if (!userId) return { totalReferred: 0, pointsBalance: 0, totalEarned: 0 }
    const available = await isPocketBaseAvailable()
    if (!available) return { totalReferred: 0, pointsBalance: 0, totalEarned: 0 }

    try {
      // Count referrals
      const referralRes = await pb.collection('referrals').getList(1, 1, {
        filter: pb.filter('referrer = {:uid}', { uid: userId }),
        $autoCancel: false,
      })

      // Sum point transactions for balance and total earned
      const transactions = await pb.collection('point_transactions').getFullList({
        filter: pb.filter('user = {:uid}', { uid: userId }),
        $autoCancel: false,
      })

      let totalEarned = 0
      let totalSpent = 0
      for (const t of transactions) {
        const amount = (t as any).amount || 0
        if (amount > 0) totalEarned += amount
        else totalSpent += Math.abs(amount)
      }

      const result: ReferralStats = {
        totalReferred: referralRes.totalItems,
        pointsBalance: totalEarned - totalSpent,
        totalEarned,
      }

      setStats(result)
      return result
    } catch {
      return { totalReferred: 0, pointsBalance: 0, totalEarned: 0 }
    }
  }, [userId])

  const trackReferral = useCallback(async (referrerCode: string): Promise<boolean> => {
    if (!userId) return false
    const available = await isPocketBaseAvailable()
    if (!available) return false

    try {
      // Look up the referrer by their referral_code
      const referrerUsers = await pb.collection('users').getList(1, 1, {
        filter: pb.filter('referral_code = {:code}', { code: referrerCode }),
        $autoCancel: false,
      })

      if (referrerUsers.items.length === 0) return false

      const referrer = referrerUsers.items[0]

      // Block self-referral
      if (referrer.id === userId) return false

      // Create referral record
      await pb.collection('referrals').create({
        referrer: referrer.id,
        referred: userId,
        source: 'quick_invite',
      })

      // Award 100 points to referrer
      await pb.collection('point_transactions').create({
        user: referrer.id,
        amount: 100,
        type: 'referral_signup',
        reference_id: userId,
        description: 'referral_signup',
      })

      return true
    } catch (e: any) {
      console.warn('Track referral error:', e)
      return false
    }
  }, [userId])

  const generateReferralCode = useCallback(async (displayName: string): Promise<string | null> => {
    if (!userId) return null
    const available = await isPocketBaseAvailable()
    if (!available) return null

    try {
      // Sanitize: uppercase, ASCII-only, max 10 chars, spaces → hyphens
      const sanitized = displayName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .toUpperCase()
        .slice(0, 10)

      const prefix = sanitized || 'USER'

      // Try up to 5 times to find a unique code
      for (let attempt = 0; attempt < 5; attempt++) {
        const hash = Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map(b => b.toString(36).toUpperCase())
          .join('')
          .slice(0, 6)

        const code = `${prefix}-${hash}`

        // Check uniqueness
        try {
          const existing = await pb.collection('users').getList(1, 1, {
            filter: pb.filter('referral_code = {:code}', { code }),
            $autoCancel: false,
          })
          if (existing.items.length > 0) continue
        } catch {
          // If check fails, try next
          continue
        }

        // Save to user
        await pb.collection('users').update(userId, { referral_code: code })
        return code
      }

      return null
    } catch (e: any) {
      console.warn('Generate referral code error:', e)
      return null
    }
  }, [userId])

  return {
    referrals,
    stats,
    loading,
    getReferrals,
    getReferralStats,
    trackReferral,
    generateReferralCode,
  }
}
