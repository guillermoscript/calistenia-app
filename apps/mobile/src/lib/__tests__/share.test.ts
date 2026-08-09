import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MOBILE_SHARE_CARD_CONTEXTS, shareCardImage, shareText } from '../share'

const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  share: vi.fn(),
  isAvailableAsync: vi.fn(),
  shareAsync: vi.fn(),
  trackShareCardShared: vi.fn(),
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
    })
    // Mobile has no race result-card share entry point; the lobby link remains `battle_shared`.
    expect(MOBILE_SHARE_CARD_CONTEXTS).not.toHaveProperty('raceResult')
  })
})
