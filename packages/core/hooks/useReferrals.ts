import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'

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

const EMPTY_STATS: ReferralStats = { totalReferred: 0, pointsBalance: 0, totalEarned: 0 }

// — Fetchers ——————————————————————————————————————————————————————————————————

async function fetchReferrals(userId: string): Promise<Referral[]> {
  const available = await isPocketBaseAvailable()
  if (!available) return []

  try {
    const res = await pb.collection('referrals').getFullList({
      filter: pb.filter('referrer = {:uid}', { uid: userId }),
      sort: '-created',
      expand: 'referred',
      $autoCancel: false,
    })

    return res.map((r: any) => ({
      id: r.id,
      referrer: r.referrer,
      referred: r.referred,
      referredName:
        r.expand?.referred?.display_name ||
        r.expand?.referred?.email?.split('@')[0] ||
        '?',
      referredAvatar: r.expand?.referred?.avatar || '',
      source: r.source,
      challengeId: r.challenge_id || null,
      created: r.created,
    }))
  } catch (e: any) {
    if (e?.status !== 404 && e?.status !== 0) {
      console.warn('Referrals load error:', e)
    }
    return []
  }
}

async function fetchReferralStats(userId: string): Promise<ReferralStats> {
  const available = await isPocketBaseAvailable()
  if (!available) return EMPTY_STATS

  try {
    // Total de referidos
    const referralRes = await pb.collection('referrals').getList(1, 1, {
      filter: pb.filter('referrer = {:uid}', { uid: userId }),
      $autoCancel: false,
    })

    // Suma transacciones de puntos para balance y total ganado
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

    return {
      totalReferred: referralRes.totalItems,
      pointsBalance: totalEarned - totalSpent,
      totalEarned,
    }
  } catch {
    return EMPTY_STATS
  }
}

// — Hook ——————————————————————————————————————————————————————————————————————

/**
 * Referidos del usuario. Migrado a TanStack Query: dos queries independientes
 * (list y stats) + dos mutaciones (trackReferral / generateReferralCode).
 * La forma pública es idéntica al hook original para no romper consumidores.
 */
export function useReferrals(userId: string | null) {
  const qc = useQueryClient()

  // — Query: lista de referidos —
  const {
    data: referrals = [],
    isFetching: fetchingList,
    refetch: refetchList,
  } = useQuery({
    queryKey: qk.referrals.list(userId),
    queryFn: () => fetchReferrals(userId!),
    enabled: !!userId,
  })

  // — Query: estadísticas de referidos —
  const {
    data: stats = EMPTY_STATS,
    isFetching: fetchingStats,
    refetch: refetchStats,
  } = useQuery({
    queryKey: qk.referrals.stats(userId),
    queryFn: () => fetchReferralStats(userId!),
    enabled: !!userId,
  })

  // loading = true mientras cualquiera de las dos queries está en vuelo
  const loading = fetchingList || fetchingStats

  // — API imperativa (preserva contrato público) —

  /** Dispara un refetch de la lista de referidos (sin devolver valor, igual que antes). */
  const getReferrals = useCallback(async () => {
    if (!userId) return
    await refetchList()
  }, [userId, refetchList])

  /**
   * Dispara un refetch de las estadísticas y devuelve el resultado,
   * tal como hacía el hook original.
   */
  const getReferralStats = useCallback(async (): Promise<ReferralStats> => {
    if (!userId) return EMPTY_STATS
    const result = await refetchStats()
    return result.data ?? EMPTY_STATS
  }, [userId, refetchStats])

  // — Mutación: registrar referido —
  const trackReferralMutation = useMutation({
    mutationFn: async (referrerCode: string): Promise<boolean> => {
      if (!userId) return false
      const available = await isPocketBaseAvailable()
      if (!available) return false

      // Buscar al referidor por su referral_code
      const referrerUsers = await pb.collection('users').getList(1, 1, {
        filter: pb.filter('referral_code = {:code}', { code: referrerCode }),
        $autoCancel: false,
      })

      if (referrerUsers.items.length === 0) return false

      const referrer = referrerUsers.items[0]

      // Bloquear auto-referido
      if (referrer.id === userId) return false

      // El hook del servidor maneja puntos, follows y notificaciones
      await pb.collection('referrals').create({
        referrer: referrer.id,
        referred: userId,
        source: 'quick_invite',
      })

      return true
    },
    onSettled: () => {
      // Invalidar ambas queries al terminar (éxito o error)
      qc.invalidateQueries({ queryKey: qk.referrals.list(userId) })
      qc.invalidateQueries({ queryKey: qk.referrals.stats(userId) })
    },
    onError: (_err, _code) => {
      console.warn('Track referral error:', _err)
    },
  })

  /** Registra un referido dado un código. Devuelve true si tuvo éxito. */
  const trackReferral = useCallback(
    async (referrerCode: string): Promise<boolean> => {
      try {
        return await trackReferralMutation.mutateAsync(referrerCode)
      } catch {
        return false
      }
    },
    [trackReferralMutation],
  )

  // — Mutación: generar código de referido —
  const generateReferralCodeMutation = useMutation({
    mutationFn: async (displayName: string): Promise<string | null> => {
      if (!userId) return null
      const available = await isPocketBaseAvailable()
      if (!available) return null

      // Sanitizar: mayúsculas, solo ASCII, máx 10 chars, espacios → guiones
      const sanitized = displayName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // quitar diacríticos
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .toUpperCase()
        .slice(0, 10)

      const prefix = sanitized || 'USER'

      // Hasta 5 intentos para encontrar un código único
      for (let attempt = 0; attempt < 5; attempt++) {
        const hash = Array.from(crypto.getRandomValues(new Uint8Array(4)))
          .map(b => b.toString(36).toUpperCase())
          .join('')
          .slice(0, 6)

        const code = `${prefix}-${hash}`

        // Verificar unicidad
        try {
          const existing = await pb.collection('users').getList(1, 1, {
            filter: pb.filter('referral_code = {:code}', { code }),
            $autoCancel: false,
          })
          if (existing.items.length > 0) continue
        } catch {
          continue
        }

        // Guardar en el usuario
        await pb.collection('users').update(userId, { referral_code: code })
        return code
      }

      return null
    },
    onSettled: () => {
      // El código vive en el perfil del usuario; invalidar stats por si acaso
      qc.invalidateQueries({ queryKey: qk.referrals.stats(userId) })
    },
    onError: (_err) => {
      console.warn('Generate referral code error:', _err)
    },
  })

  /** Genera y persiste un código de referido único. Devuelve el código o null. */
  const generateReferralCode = useCallback(
    async (displayName: string): Promise<string | null> => {
      try {
        return await generateReferralCodeMutation.mutateAsync(displayName)
      } catch {
        return null
      }
    },
    [generateReferralCodeMutation],
  )

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
