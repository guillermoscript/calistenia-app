import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pb, isPocketBaseAvailable } from '../lib/pocketbase'
import { qk } from '../lib/query-keys'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from '../lib/analytics'

/**
 * Puntos que `pb_hooks/referral_side_effects.pb.js` acredita al crearse un
 * referido. Viven aquí para que la copy de producto no pueda desincronizarse
 * del importe real del ledger.
 */
export const REFERRAL_SIGNUP_POINTS = 100
export const REFERRAL_BONUS_POINTS = 50

/**
 * Estado de la recompensa de un referido, derivado SIEMPRE de una fila real de
 * `point_transactions`. Los tres efectos secundarios del hook de servidor fallan
 * de forma silenciosa e independiente, así que «existe el referido» no implica
 * «se acreditaron los puntos»: `pending` es un estado real, no un imposible.
 */
export type ReferralRewardStatus = 'credited' | 'pending'

export interface Referral {
  id: string
  referrer: string
  referred: string
  referredName: string
  referredAvatar: string
  source: 'quick_invite' | 'challenge'
  challengeId: string | null
  created: string
  /** El usuario referido ya no es legible (cuenta borrada o no expandible). */
  referredDeleted: boolean
  /** `credited` solo si existe la fila de `point_transactions` correspondiente. */
  rewardStatus: ReferralRewardStatus
  /** Puntos realmente acreditados por este referido (0 si está pendiente). */
  rewardPoints: number
}

export interface ReferralStats {
  totalReferred: number
  pointsBalance: number
  totalEarned: number
}

const EMPTY_STATS: ReferralStats = { totalReferred: 0, pointsBalance: 0, totalEarned: 0 }

/** Motivo por el que no se pudo registrar un referido introducido a mano. */
export type TrackReferralFailure =
  | 'invalid_code'
  | 'self_referral'
  | 'already_referred'
  | 'offline'
  | 'unknown'

export type TrackReferralResult =
  | { ok: true }
  | { ok: false; reason: TrackReferralFailure }

/**
 * El índice único `idx_referrals_unique_pair (referrer, referred)` hace que un
 * segundo intento devuelva un 400 de validación de PocketBase. Lo detectamos
 * para poder decir «ya invitaste a esta persona» en vez de mostrar un 400.
 */
export function isDuplicateReferralError(e: unknown): boolean {
  const err = e as { status?: number; response?: { data?: Record<string, unknown> } } | null
  if (err?.status !== 400) return false
  const data = err.response?.data
  if (!data) return false
  return Object.keys(data).some(key => key === 'referrer' || key === 'referred')
}

/** Motivo por el que no se pudieron cargar los datos de referidos. */
export type ReferralErrorReason = 'offline' | 'unknown'

/**
 * Error tipado para que la UI distinga «sin conexión» de «falló la consulta» y
 * ofrezca reintentar, en lugar de mostrar un cero que parece un dato real.
 */
export class ReferralDataError extends Error {
  readonly reason: ReferralErrorReason

  constructor(reason: ReferralErrorReason, options?: { cause?: unknown }) {
    super(reason === 'offline' ? 'PocketBase no disponible' : 'No se pudieron cargar los referidos')
    this.name = 'ReferralDataError'
    this.reason = reason
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause
  }
}

// — Fetchers ——————————————————————————————————————————————————————————————————

/**
 * Suma, por usuario referido, los puntos `referral_signup` ya acreditados al
 * referidor. `reference_id` guarda el id del referido (ver
 * `pb_hooks/referral_side_effects.pb.js`), que es lo que permite el join.
 */
async function fetchCreditedReferralPoints(userId: string): Promise<Map<string, number>> {
  const rows = await pb.collection('point_transactions').getFullList({
    filter: pb.filter('user = {:uid} && type = "referral_signup"', { uid: userId }),
    fields: 'amount,reference_id',
    $autoCancel: false,
  })

  const byReferred = new Map<string, number>()
  for (const row of rows as Array<{ amount?: number; reference_id?: string }>) {
    const referredId = row.reference_id
    if (!referredId) continue
    byReferred.set(referredId, (byReferred.get(referredId) ?? 0) + (row.amount || 0))
  }
  return byReferred
}

/**
 * Convierte filas crudas de `referrals` + el mapa de puntos ya acreditados en
 * la forma que consume la UI. Función pura y exportada para poder testear el
 * join (acreditado / pendiente / cuenta borrada) sin renderizar el hook.
 */
export function mapReferralRecords(
  records: any[],
  creditedPoints: Map<string, number>,
): Referral[] {
  return records.map((r: any) => {
    const expanded = r.expand?.referred
    const rewardPoints = creditedPoints.get(r.referred) ?? 0
    return {
      id: r.id,
      referrer: r.referrer,
      referred: r.referred,
      referredName:
        expanded?.display_name ||
        expanded?.email?.split('@')[0] ||
        '',
      referredAvatar: expanded?.avatar || '',
      source: r.source,
      challengeId: r.challenge_id || null,
      created: r.created,
      referredDeleted: !expanded,
      rewardStatus: rewardPoints > 0 ? 'credited' : 'pending',
      rewardPoints,
    } satisfies Referral
  })
}

/**
 * Resume las transacciones de puntos. Los importes negativos (`ai_usage`) se
 * restan del balance pero no cuentan como «ganado». Pura para poder testear la
 * aritmética, incluidos los saldos negativos.
 */
export function computePointsSummary(
  transactions: Array<{ amount?: number }>,
): { totalEarned: number; totalSpent: number; pointsBalance: number } {
  let totalEarned = 0
  let totalSpent = 0
  for (const t of transactions) {
    const amount = t.amount || 0
    if (amount > 0) totalEarned += amount
    else totalSpent += Math.abs(amount)
  }
  return { totalEarned, totalSpent, pointsBalance: totalEarned - totalSpent }
}

async function fetchReferrals(userId: string): Promise<Referral[]> {
  const available = await isPocketBaseAvailable()
  if (!available) throw new ReferralDataError('offline')

  try {
    // Ambas lecturas en el mismo queryFn: así la lista y su estado de
    // recompensa provienen siempre del mismo snapshot.
    const [res, creditedPoints] = await Promise.all([
      pb.collection('referrals').getFullList({
        filter: pb.filter('referrer = {:uid}', { uid: userId }),
        sort: '-created',
        expand: 'referred',
        $autoCancel: false,
      }),
      fetchCreditedReferralPoints(userId),
    ])

    return mapReferralRecords(res, creditedPoints)
  } catch (e: any) {
    // Una lista vacía y «no pude leer la lista» no son lo mismo: propagamos el
    // error para que la UI ofrezca reintentar en vez de fingir cero referidos.
    console.warn('Referrals load error:', e)
    throw new ReferralDataError('unknown', { cause: e })
  }
}

async function fetchReferralStats(userId: string): Promise<ReferralStats> {
  const available = await isPocketBaseAvailable()
  if (!available) throw new ReferralDataError('offline')

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

    const { totalEarned, pointsBalance } = computePointsSummary(
      transactions as Array<{ amount?: number }>,
    )

    return {
      totalReferred: referralRes.totalItems,
      pointsBalance,
      totalEarned,
    }
  } catch (e) {
    console.warn('Referral stats load error:', e)
    throw new ReferralDataError('unknown', { cause: e })
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

  // Sin conexión no tiene sentido reintentar tres veces con backoff: fallamos
  // rápido para que la UI pueda ofrecer el botón de reintentar.
  const retry = (failureCount: number, error: unknown) => {
    if (error instanceof ReferralDataError && error.reason === 'offline') return false
    return failureCount < 2
  }

  // — Query: lista de referidos —
  const {
    data: referrals = [],
    isFetching: fetchingList,
    refetch: refetchList,
    error: listError,
  } = useQuery({
    queryKey: qk.referrals.list(userId),
    queryFn: () => fetchReferrals(userId!),
    enabled: !!userId,
    retry,
  })

  // — Query: estadísticas de referidos —
  const {
    data: stats = EMPTY_STATS,
    isFetching: fetchingStats,
    refetch: refetchStats,
    error: statsError,
  } = useQuery({
    queryKey: qk.referrals.stats(userId),
    queryFn: () => fetchReferralStats(userId!),
    enabled: !!userId,
    retry,
  })

  // loading = true mientras cualquiera de las dos queries está en vuelo
  const loading = fetchingList || fetchingStats

  const error = (listError ?? statsError ?? null) as ReferralDataError | null

  /** Reintenta ambas queries. Pensado para el botón de «reintentar» y el pull-to-refresh. */
  const refresh = useCallback(async () => {
    await Promise.all([refetchList(), refetchStats()])
  }, [refetchList, refetchStats])

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
    mutationFn: async (referrerCode: string): Promise<TrackReferralResult> => {
      if (!userId) return { ok: false, reason: 'unknown' }
      const available = await isPocketBaseAvailable()
      if (!available) return { ok: false, reason: 'offline' }

      // Buscar al referidor por su referral_code
      const referrerUsers = await pb.collection('users').getList(1, 1, {
        filter: pb.filter('referral_code = {:code}', { code: referrerCode }),
        $autoCancel: false,
      })

      if (referrerUsers.items.length === 0) return { ok: false, reason: 'invalid_code' }

      const referrer = referrerUsers.items[0]

      // Bloquear auto-referido
      if (referrer.id === userId) return { ok: false, reason: 'self_referral' }

      try {
        // El hook del servidor maneja puntos, follows y notificaciones
        await pb.collection('referrals').create({
          referrer: referrer.id,
          referred: userId,
          source: 'quick_invite',
        })
      } catch (e: any) {
        // El índice único (referrer, referred) devuelve un 400 crudo; lo
        // traducimos a un motivo accionable en vez de propagar el error de PB.
        if (isDuplicateReferralError(e)) return { ok: false, reason: 'already_referred' }
        throw e
      }

      // Esta ruta manual no emitía `referral_converted` (sí lo hacía la ruta de
      // alta en `useAuth`), así que la métrica de conversión perdía eventos.
      trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.referralConverted, {
        surface: 'referral',
        source: 'manual_code',
        result: 'converted',
        referrer_id: referrer.id,
      })

      return { ok: true }
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

  /** Registra un referido dado un código. Devuelve el motivo exacto si falla. */
  const trackReferral = useCallback(
    async (referrerCode: string): Promise<TrackReferralResult> => {
      try {
        return await trackReferralMutation.mutateAsync(referrerCode)
      } catch (e) {
        if (isDuplicateReferralError(e)) return { ok: false, reason: 'already_referred' }
        return { ok: false, reason: 'unknown' }
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
    /** `null` salvo que la lista o las stats hayan fallado. */
    error,
    refresh,
    getReferrals,
    getReferralStats,
    trackReferral,
    generateReferralCode,
  }
}
