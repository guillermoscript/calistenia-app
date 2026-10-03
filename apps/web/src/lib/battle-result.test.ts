import { describe, it, expect } from 'vitest'
import { resultHeadlineKey } from './battle-result'

describe('resultHeadlineKey', () => {
  it('terminal non-finished states win over the outcome', () => {
    expect(resultHeadlineKey('cancelled', 'won')).toBe('battle.cancelledTitle')
    expect(resultHeadlineKey('expired', 'none')).toBe('battle.expiredTitle')
    expect(resultHeadlineKey('no_result', 'won')).toBe('battle.finishedTitle')
  })
  it('picks the headline from how the viewer did', () => {
    expect(resultHeadlineKey('finished', 'won')).toBe('battle.wonTitle')
    expect(resultHeadlineKey('finished', 'tied')).toBe('battle.tiedTitle')
    expect(resultHeadlineKey('finished', 'solo')).toBe('battle.soloTitle')
    expect(resultHeadlineKey('finished', 'left')).toBe('battle.youLeftTitle')
    expect(resultHeadlineKey('finished', 'placed')).toBe('battle.finishedTitle')
  })
})
