import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../platform'
import { op } from './analytics'
import {
  isPushPromptSeen,
  markPushPromptSeen,
  pushPromptSeenKey,
  shouldShowPushPrompt,
  trackPushPromptAnswered,
  trackPushPromptViewed,
} from './push-prompt'

vi.mock('../platform', () => ({
  storage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}))

vi.mock('./analytics', () => ({
  op: { track: vi.fn() },
}))

beforeEach(() => {
  vi.mocked(storage.getItem).mockReset()
  vi.mocked(storage.setItem).mockReset()
  vi.mocked(op.track).mockReset()
})

describe('shouldShowPushPrompt', () => {
  it('se ofrece cuando el sistema aún no preguntó y no se vio antes', () => {
    vi.mocked(storage.getItem).mockReturnValue(null)
    expect(shouldShowPushPrompt({ userId: 'u1', permission: 'undetermined' })).toBe(true)
    expect(storage.getItem).toHaveBeenCalledWith(pushPromptSeenKey('u1'))
  })

  it.each(['granted', 'denied', 'unsupported'] as const)('no se ofrece si el permiso ya está %s', (permission) => {
    vi.mocked(storage.getItem).mockReturnValue(null)
    expect(shouldShowPushPrompt({ userId: 'u1', permission })).toBe(false)
  })

  it('no se ofrece dos veces al mismo usuario en el mismo dispositivo', () => {
    vi.mocked(storage.getItem).mockReturnValue('true')
    expect(shouldShowPushPrompt({ userId: 'u1', permission: 'undetermined' })).toBe(false)
  })

  it('sin usuario no se ofrece', () => {
    expect(shouldShowPushPrompt({ userId: null, permission: 'undetermined' })).toBe(false)
    expect(isPushPromptSeen(undefined)).toBe(true)
  })
})

describe('markPushPromptSeen', () => {
  it('escribe la clave por usuario', () => {
    markPushPromptSeen('u9')
    expect(storage.setItem).toHaveBeenCalledWith('calistenia_push_prompt_seen_u9', 'true')
  })
})

describe('analytics', () => {
  it('viewed lleva la superficie y si es el primer entreno', () => {
    trackPushPromptViewed({ workoutKey: 'free_first_1', totalSessions: 1 })
    expect(op.track).toHaveBeenCalledWith('push_prompt_viewed', expect.objectContaining({
      surface: 'post_workout', is_first_workout: true, total_sessions: 1,
    }))
  })

  it('answered lleva el resultado', () => {
    trackPushPromptAnswered({ result: 'denied', workoutKey: 'p1_lun' })
    expect(op.track).toHaveBeenCalledWith('push_prompt_answered', expect.objectContaining({
      surface: 'post_workout', result: 'denied', workout_key: 'p1_lun',
    }))
  })
})
