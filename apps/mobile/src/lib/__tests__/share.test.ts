import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MOBILE_SHARE_CARD_CONTEXTS,
  shareBattleResult,
  shareBattleResultCard,
  shareCardImage,
  shareText,
} from '../share'

const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  share: vi.fn(),
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
  trackShareCardShared: vi.fn(),
  trackCanonicalEvent: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: mocks.platform,
  Share: {
    share: mocks.share,
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
}))

vi.mock('expo-sharing', () => ({
  isAvailableAsync: mocks.isAvailableAsync,
  shareAsync: mocks.shareAsync,
}))

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(),
}))

vi.mock('@calistenia/core/lib/analytics', () => ({
  trackShareCardShared: mocks.trackShareCardShared,
  trackCanonicalEvent: mocks.trackCanonicalEvent,
  CANONICAL_ANALYTICS_EVENTS: { battleShared: 'battle_shared' },
}))

const analytics = {
  ...MOBILE_SHARE_CARD_CONTEXTS.workoutCompletion,
  workout_id: 'p1_lun',
}

describe('mobile share outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform.OS = 'ios'
    mocks.isAvailableAsync.mockResolvedValue(true)
    mocks.shareAsync.mockResolvedValue(undefined)
  })

  it('classifies an iOS text share and dismissal separately', async () => {
    mocks.share
      .mockResolvedValueOnce({ action: 'sharedAction' })
      .mockResolvedValueOnce({ action: 'dismissedAction' })

    await expect(shareText({ message: 'hola' })).resolves.toEqual({
      result: 'shared',
      confirmed: true,
    })
    await expect(shareText({ message: 'hola' })).resolves.toEqual({
      result: 'dismissed',
      confirmed: false,
    })
  })

  it('records one opened, unconfirmed event when expo-sharing resolves', async () => {
    await expect(shareCardImage('file://card.png', undefined, analytics)).resolves.toEqual({
      result: 'opened',
      confirmed: false,
    })

    expect(mocks.trackShareCardShared).toHaveBeenCalledTimes(1)
    expect(mocks.trackShareCardShared).toHaveBeenCalledWith({
      ...analytics,
      platform: 'ios',
      result: 'opened',
      share_confirmed: false,
    })
  })

  it('records a confirmed fallback share and suppresses a known dismissal', async () => {
    mocks.isAvailableAsync.mockResolvedValue(false)
    mocks.share
      .mockResolvedValueOnce({ action: 'sharedAction' })
      .mockResolvedValueOnce({ action: 'dismissedAction' })

    await shareCardImage('file://card.png', { message: 'fallback' }, analytics)
    await shareCardImage('file://card.png', { message: 'fallback' }, analytics)

    expect(mocks.trackShareCardShared).toHaveBeenCalledTimes(1)
    expect(mocks.trackShareCardShared).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'ios',
      result: 'shared',
      share_confirmed: true,
    }))
  })

  it('marks Android native sharing as opened because dismissal is not observable', async () => {
    mocks.platform.OS = 'android'
    mocks.isAvailableAsync.mockResolvedValue(false)
    mocks.share.mockResolvedValue({ action: 'sharedAction' })

    await shareCardImage('file://card.png', undefined, analytics)

    expect(mocks.trackShareCardShared).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'android',
      result: 'opened',
      share_confirmed: false,
    }))
  })

  it('emits nothing for a failure and exactly once after a successful retry', async () => {
    mocks.shareAsync
      .mockRejectedValueOnce(new Error('native failure'))
      .mockResolvedValueOnce(undefined)

    await expect(shareCardImage('file://card.png', undefined, analytics)).rejects.toThrow('native failure')
    expect(mocks.trackShareCardShared).not.toHaveBeenCalled()

    await shareCardImage('file://card.png', undefined, analytics)
    expect(mocks.trackShareCardShared).toHaveBeenCalledTimes(1)
  })

  it('defines the audited analytics contract for every mobile share-card surface', () => {
    expect(MOBILE_SHARE_CARD_CONTEXTS).toEqual({
      workoutCompletion: {
        surface: 'post_workout', source: 'workout_completion', share_type: 'workout', card_type: 'workout',
      },
      workoutHistory: {
        surface: 'session_detail', source: 'history', share_type: 'workout', card_type: 'workout',
      },
      personalRecord: {
        surface: 'pr_celebration', source: 'pr_achieved', share_type: 'pr', card_type: 'pr',
      },
      streak: {
        surface: 'streak_milestone', source: 'streak_achieved', share_type: 'streak', card_type: 'streak',
      },
      cardio: {
        surface: 'cardio', source: 'cardio_completion', share_type: 'cardio', card_type: 'cardio',
      },
      nutrition: {
        surface: 'nutrition', source: 'daily_summary', share_type: 'nutrition', card_type: 'nutrition',
      },
      progressPhoto: {
        surface: 'progress', source: 'progress_photo', share_type: 'progress_photo', card_type: 'progress_photo',
      },
      battleResult: {
        surface: 'battle', source: 'battle_results', share_type: 'result_card', card_type: 'battle_result',
      },
    })
    // Mobile has no race result-card share entry point; the lobby link remains `battle_shared`.
    expect(MOBILE_SHARE_CARD_CONTEXTS).not.toHaveProperty('raceResult')
  })
})

// ── Tarjeta de resultado de batalla (#357) ───────────────────────────────────

describe('battle result share', () => {
  const battle = { battleId: 'b1', participantCount: 3 }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.platform.OS = 'android'
    mocks.isAvailableAsync.mockResolvedValue(true)
    mocks.shareAsync.mockResolvedValue(undefined)
  })

  it('emits both the card event and the battle event from one share', async () => {
    // `share_card_shared` es el contrato de todas las tarjetas y `battle_shared` el paso
    // del embudo de batallas. Salen del mismo resultado, así que no pueden discrepar.
    await shareBattleResultCard('file://card.png', undefined, battle)

    expect(mocks.trackShareCardShared).toHaveBeenCalledTimes(1)
    expect(mocks.trackShareCardShared).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'battle', share_type: 'result_card', card_type: 'battle_result', battle_id: 'b1',
    }))
    expect(mocks.trackCanonicalEvent).toHaveBeenCalledTimes(1)
    expect(mocks.trackCanonicalEvent).toHaveBeenCalledWith('battle_shared', expect.objectContaining({
      surface: 'battle',
      source: 'battle_results',
      battle_id: 'b1',
      share_type: 'result_card',
      participant_count: 3,
      // expo-sharing no informa de si el envío se completó, así que lo honesto en las dos
      // plataformas es `opened` sin confirmar. Contarlo como enviado sería inventárselo.
      result: 'opened',
      share_confirmed: false,
    }))
  })

  it('never puts an invite token in the payload', async () => {
    // El token es de un solo uso y la imagen se reenvía: si viajara aquí, se regalaría
    // una plaza a quien reenviase la captura.
    await shareBattleResultCard('file://card.png', { message: 'mi marca' }, battle)

    const payloads = JSON.stringify([
      mocks.trackShareCardShared.mock.calls,
      mocks.trackCanonicalEvent.mock.calls,
    ])
    expect(payloads).not.toMatch(/token/i)
  })

  it('emits nothing when the sheet is dismissed', async () => {
    // Sin expo-sharing se cae al texto, que sí distingue el descarte.
    mocks.platform.OS = 'ios'
    mocks.isAvailableAsync.mockResolvedValue(false)
    mocks.share.mockResolvedValue({ action: 'dismissedAction' })

    await shareBattleResultCard('file://card.png', { message: 'mi marca' }, battle)

    expect(mocks.trackShareCardShared).not.toHaveBeenCalled()
    expect(mocks.trackCanonicalEvent).not.toHaveBeenCalled()
  })

  it('never links a shared result at the battle itself', () => {
    // `battles.viewRule` solo deja entrar a los participantes: un enlace al resultado
    // sería un 403 para cualquiera que reciba la tarjeta.
    const conReferido = shareBattleResult({
      circuitName: 'Circuito básico', rank: 1, contenders: 3, tied: false, referralCode: 'abc123',
    })
    expect(conReferido.url).toBe('https://gym.guille.tech/invite/abc123')

    const sinReferido = shareBattleResult({
      circuitName: 'Circuito básico', rank: 1, contenders: 3, tied: false, referralCode: null,
    })
    expect(sinReferido.url).toBe('https://gym.guille.tech')
    expect(sinReferido.url).not.toMatch(/battle/)
  })

  it('celebrates a solo finish instead of counting the people it beat', () => {
    // "1.º de 1" a quien se quedó solo suena a broma.
    const solo = shareBattleResult({
      userName: 'Guille', circuitName: 'Circuito básico', rank: 1, contenders: 1, tied: false,
    })
    expect(solo.message).toContain('completado')
    expect(solo.message).not.toMatch(/de 1\b/)

    const empate = shareBattleResult({
      circuitName: 'Circuito básico', rank: 1, contenders: 2, tied: true,
    })
    expect(empate.message).toContain('mpate')
  })
})
