import { describe, it, expect, vi } from 'vitest'

// hooks/useReactions importa `pb` al evaluarse, que exige initCore(); solo
// necesitamos la constante REACTION_EMOJIS, así que basta un doble mínimo.
vi.mock('./pocketbase', () => ({
  pb: { filter: vi.fn(), collection: vi.fn(() => ({})) },
  isPocketBaseAvailable: vi.fn().mockResolvedValue(true),
}))

import { REACTION_EMOJIS } from '../hooks/useReactions'
import { REACTION_EMOJI_COLORS, getEmojiReactionState } from './emoji-picker'

describe('REACTION_EMOJI_COLORS', () => {
  it('define un color para cada emoji de REACTION_EMOJIS', () => {
    for (const emoji of REACTION_EMOJIS) {
      expect(REACTION_EMOJI_COLORS[emoji]).toBeDefined()
    }
  })
})

describe('getEmojiReactionState', () => {
  it('devuelve hasReacted/count del emoji si hay datos', () => {
    const reactions = { '🔥': { count: 3, hasReacted: true } }
    expect(getEmojiReactionState(reactions, '🔥')).toEqual({ hasReacted: true, count: 3 })
  })

  it('devuelve valores por defecto (false/0) si el emoji no tiene reacciones', () => {
    const reactions = { '🔥': { count: 3, hasReacted: true } }
    expect(getEmojiReactionState(reactions, '💪')).toEqual({ hasReacted: false, count: 0 })
  })

  it('devuelve valores por defecto con un mapa de reacciones vacío', () => {
    expect(getEmojiReactionState({}, '🏆')).toEqual({ hasReacted: false, count: 0 })
  })
})
