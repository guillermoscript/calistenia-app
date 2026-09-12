import { beforeEach, describe, expect, it, vi } from 'vitest'

const track = vi.fn()
vi.mock('../platform', () => ({
  getPlatform: () => ({ analytics: { track, identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ platform: 'web' }),
  storage: { getItem: () => null, setItem: () => {} },
}))

import {
  DISCOVERY_SOURCES,
  DISCOVERY_SOURCE_NOT_ANSWERED,
  isDiscoverySourceId,
  trackDiscoverySourceAnswered,
} from './discovery-source'

describe('DISCOVERY_SOURCES', () => {
  it('tiene ids únicos y una clave i18n por opción', () => {
    const ids = DISCOVERY_SOURCES.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const o of DISCOVERY_SOURCES) {
      expect(o.labelKey).toMatch(/^onboarding\.discovery[A-Z]/)
    }
  })

  it('termina en «otro» para que el resto de opciones no se lean como cerradas', () => {
    expect(DISCOVERY_SOURCES.at(-1)?.id).toBe('other')
  })

  it('el valor «sin contestar» no colisiona con ninguna opción', () => {
    expect(isDiscoverySourceId(DISCOVERY_SOURCE_NOT_ANSWERED)).toBe(false)
  })
})

describe('isDiscoverySourceId', () => {
  it('acepta solo los ids del catálogo', () => {
    expect(isDiscoverySourceId('ai_chat')).toBe(true)
    expect(isDiscoverySourceId('ChatGPT o IA')).toBe(false)
    expect(isDiscoverySourceId(null)).toBe(false)
  })
})

describe('trackDiscoverySourceAnswered', () => {
  beforeEach(() => track.mockClear())

  it('emite el evento canónico con el id, nunca la etiqueta', () => {
    trackDiscoverySourceAnswered('friend', 'onboarding_mobile')
    expect(track).toHaveBeenCalledTimes(1)
    const [name, props] = track.mock.calls[0]
    expect(name).toBe('discovery_source_answered')
    expect(props).toMatchObject({
      event_version: 1,
      platform: 'web',
      surface: 'onboarding',
      source: 'onboarding_mobile',
      discovery_source: 'friend',
    })
  })
})
