/**
 * Cobertura de la lógica pura de referidos (issue #354).
 *
 * El hook no se renderiza (los tests de core corren en vitest/node, sin
 * testing-library), así que se testean las funciones puras que hacen el trabajo
 * real: el join con el ledger de puntos y la aritmética del balance.
 */
import { describe, expect, it, vi } from 'vitest'

// El módulo importa `pb` al evaluarse, que exige initCore(); las funciones bajo
// test son puras, así que basta con un doble mínimo del cliente.
vi.mock('../lib/pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})) },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import {
  computePointsSummary,
  isDuplicateReferralError,
  mapReferralRecords,
  ReferralDataError,
  REFERRAL_BONUS_POINTS,
  REFERRAL_SIGNUP_POINTS,
} from './useReferrals'

/** Fila cruda de `referrals` tal como la devuelve PocketBase con expand. */
function record(over: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    referrer: 'me',
    referred: 'friend1',
    source: 'quick_invite',
    challenge_id: null,
    created: '2026-08-01 10:00:00.000Z',
    expand: { referred: { display_name: 'Ana', avatar: 'a.png' } },
    ...over,
  }
}

describe('mapReferralRecords', () => {
  it('sin referidos devuelve una lista vacía', () => {
    expect(mapReferralRecords([], new Map())).toEqual([])
  })

  it('marca como acreditado el referido que tiene su fila en el ledger', () => {
    const [ref] = mapReferralRecords(
      [record()],
      new Map([['friend1', REFERRAL_SIGNUP_POINTS]]),
    )

    expect(ref.rewardStatus).toBe('credited')
    expect(ref.rewardPoints).toBe(REFERRAL_SIGNUP_POINTS)
    expect(ref.referredName).toBe('Ana')
    expect(ref.referredDeleted).toBe(false)
  })

  it('marca como pendiente el referido sin fila de puntos (fallo silencioso del hook de servidor)', () => {
    // El hook de PB crea follows, puntos y notificación de forma independiente
    // y cada uno puede fallar solo: «existe el referido» no implica «hay puntos».
    const [ref] = mapReferralRecords([record()], new Map())

    expect(ref.rewardStatus).toBe('pending')
    expect(ref.rewardPoints).toBe(0)
  })

  it('nunca deriva la recompensa de la existencia del referido', () => {
    const refs = mapReferralRecords(
      [record({ id: 'r1', referred: 'friend1' }), record({ id: 'r2', referred: 'friend2' })],
      new Map([['friend1', REFERRAL_SIGNUP_POINTS]]),
    )

    expect(refs.map(r => r.rewardStatus)).toEqual(['credited', 'pending'])
  })

  it('trata la cuenta referida no legible como borrada, sin romper la fila', () => {
    const [ref] = mapReferralRecords([record({ expand: undefined })], new Map())

    expect(ref.referredDeleted).toBe(true)
    expect(ref.referredName).toBe('')
    expect(ref.referredAvatar).toBe('')
    expect(ref.id).toBe('r1')
  })

  it('cae al prefijo del email cuando no hay display_name', () => {
    const [ref] = mapReferralRecords(
      [record({ expand: { referred: { email: 'ana@example.com' } } })],
      new Map(),
    )

    expect(ref.referredName).toBe('ana')
    expect(ref.referredDeleted).toBe(false)
  })

  it('suma varias filas de puntos apuntando al mismo referido', () => {
    const [ref] = mapReferralRecords([record()], new Map([['friend1', 150]]))

    expect(ref.rewardPoints).toBe(150)
    expect(ref.rewardStatus).toBe('credited')
  })

  it('conserva el origen y el reto asociado', () => {
    const [ref] = mapReferralRecords(
      [record({ source: 'challenge', challenge_id: 'c1' })],
      new Map(),
    )

    expect(ref.source).toBe('challenge')
    expect(ref.challengeId).toBe('c1')
  })
})

describe('computePointsSummary', () => {
  it('sin transacciones todo queda a cero', () => {
    expect(computePointsSummary([])).toEqual({
      totalEarned: 0,
      totalSpent: 0,
      pointsBalance: 0,
    })
  })

  it('suma los ingresos de referidos', () => {
    expect(computePointsSummary([
      { amount: REFERRAL_SIGNUP_POINTS },
      { amount: REFERRAL_BONUS_POINTS },
    ])).toEqual({ totalEarned: 150, totalSpent: 0, pointsBalance: 150 })
  })

  it('descuenta los importes negativos (ai_usage) del balance pero no del total ganado', () => {
    const summary = computePointsSummary([
      { amount: 100 },
      { amount: -30 },
      { amount: -20 },
    ])

    expect(summary.totalEarned).toBe(100)
    expect(summary.totalSpent).toBe(50)
    expect(summary.pointsBalance).toBe(50)
  })

  it('admite un balance negativo cuando se gastó más de lo ganado', () => {
    const summary = computePointsSummary([{ amount: 50 }, { amount: -120 }])

    expect(summary.pointsBalance).toBe(-70)
    expect(summary.totalEarned).toBe(50)
  })

  it('tolera filas sin importe', () => {
    expect(computePointsSummary([{}, { amount: undefined }, { amount: 10 }]).pointsBalance).toBe(10)
  })
})

describe('isDuplicateReferralError', () => {
  it('detecta el choque con el índice único (referrer, referred)', () => {
    expect(isDuplicateReferralError({
      status: 400,
      response: { data: { referred: { code: 'validation_not_unique' } } },
    })).toBe(true)
  })

  it('detecta el choque cuando PocketBase señala el campo referrer', () => {
    expect(isDuplicateReferralError({
      status: 400,
      response: { data: { referrer: { code: 'validation_not_unique' } } },
    })).toBe(true)
  })

  it('no confunde otros 400 con un duplicado', () => {
    expect(isDuplicateReferralError({
      status: 400,
      response: { data: { source: { code: 'validation_required' } } },
    })).toBe(false)
  })

  it('ignora errores que no son 400', () => {
    expect(isDuplicateReferralError({ status: 500, response: { data: { referred: {} } } })).toBe(false)
    expect(isDuplicateReferralError(null)).toBe(false)
    expect(isDuplicateReferralError(new Error('boom'))).toBe(false)
  })
})

describe('ReferralDataError', () => {
  it('distingue el modo sin conexión para que la UI ofrezca reintentar', () => {
    const offline = new ReferralDataError('offline')
    const unknown = new ReferralDataError('unknown', { cause: new Error('500') })

    expect(offline.reason).toBe('offline')
    expect(unknown.reason).toBe('unknown')
    expect(offline).toBeInstanceOf(Error)
  })
})
