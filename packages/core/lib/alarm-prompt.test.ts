import { beforeEach, describe, expect, it, vi } from 'vitest'
import { storage } from '../platform'
import { op } from './analytics'
import {
  ALARM_PROMPT_DISMISSED_AT_KEY,
  ALARM_PROMPT_SNOOZE_MS,
  getAlarmPromptDismissedAt,
  markAlarmPromptDismissed,
  shouldShowAlarmPrompt,
  trackAlarmPermissionResolved,
  trackAlarmPromptAnswered,
  trackAlarmPromptViewed,
} from './alarm-prompt'

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

const NOW = 1_700_000_000_000

describe('shouldShowAlarmPrompt', () => {
  it('se enseña cuando falta el permiso y nunca se ha rechazado', () => {
    expect(shouldShowAlarmPrompt({ permission: 'missing', dismissedAt: null, now: NOW })).toBe(true)
  })

  it('no se enseña si el permiso ya está o no aplica (iOS, Expo Go)', () => {
    expect(shouldShowAlarmPrompt({ permission: 'granted', dismissedAt: null, now: NOW })).toBe(false)
    expect(shouldShowAlarmPrompt({ permission: 'unsupported', dismissedAt: null, now: NOW })).toBe(false)
  })

  it('«Ahora no» la calla durante el snooze y vuelve después', () => {
    const dismissedAt = NOW - 1000
    expect(shouldShowAlarmPrompt({ permission: 'missing', dismissedAt, now: NOW })).toBe(false)
    expect(shouldShowAlarmPrompt({ permission: 'missing', dismissedAt, now: dismissedAt + ALARM_PROMPT_SNOOZE_MS - 1 })).toBe(false)
    expect(shouldShowAlarmPrompt({ permission: 'missing', dismissedAt, now: dismissedAt + ALARM_PROMPT_SNOOZE_MS })).toBe(true)
  })

  it('un rechazo con fecha futura (reloj cambiado) no la calla para siempre', () => {
    expect(shouldShowAlarmPrompt({ permission: 'missing', dismissedAt: NOW + 60_000, now: NOW })).toBe(true)
  })
})

describe('persistencia del «Ahora no»', () => {
  it('guarda el instante y lo lee de vuelta', () => {
    markAlarmPromptDismissed(NOW)
    expect(storage.setItem).toHaveBeenCalledWith(ALARM_PROMPT_DISMISSED_AT_KEY, String(NOW))
    vi.mocked(storage.getItem).mockReturnValue(String(NOW))
    expect(getAlarmPromptDismissedAt()).toBe(NOW)
  })

  it('sin valor o con basura devuelve null', () => {
    vi.mocked(storage.getItem).mockReturnValue(null)
    expect(getAlarmPromptDismissedAt()).toBeNull()
    vi.mocked(storage.getItem).mockReturnValue('nope')
    expect(getAlarmPromptDismissedAt()).toBeNull()
  })
})

describe('tracking', () => {
  it('emite los tres eventos con la superficie', () => {
    trackAlarmPromptViewed()
    trackAlarmPromptAnswered({ result: 'dismissed' })
    trackAlarmPermissionResolved({ granted: true })
    expect(op.track).toHaveBeenNthCalledWith(1, 'alarm_prompt_viewed', { surface: 'rest_screen' })
    expect(op.track).toHaveBeenNthCalledWith(2, 'alarm_prompt_answered', { surface: 'rest_screen', result: 'dismissed' })
    expect(op.track).toHaveBeenNthCalledWith(3, 'alarm_permission_resolved', { surface: 'rest_screen', granted: true })
  })
})
