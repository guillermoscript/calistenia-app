import { describe, it, expect } from 'vitest'
import { parseRepsForPR } from './pr-utils'

describe('parseRepsForPR', () => {
  it('"12" → 12', () => {
    expect(parseRepsForPR('12')).toBe(12)
  })

  it('"8-12" → 12 (takes the max integer)', () => {
    expect(parseRepsForPR('8-12')).toBe(12)
  })

  it('"3x10" → 10 (takes the max integer)', () => {
    expect(parseRepsForPR('3x10')).toBe(10)
  })

  it('"max" → null (no integer found)', () => {
    expect(parseRepsForPR('max')).toBeNull()
  })

  it('"" → null (empty string)', () => {
    expect(parseRepsForPR('')).toBeNull()
  })

  it('null → null', () => {
    expect(parseRepsForPR(null)).toBeNull()
  })

  it('undefined → null', () => {
    expect(parseRepsForPR(undefined)).toBeNull()
  })

  it('"0" → null (zero is not a positive PR)', () => {
    expect(parseRepsForPR('0')).toBeNull()
  })

  it('"AMRAP" → null (no integer)', () => {
    expect(parseRepsForPR('AMRAP')).toBeNull()
  })

  it('"1" → 1 (single positive integer)', () => {
    expect(parseRepsForPR('1')).toBe(1)
  })
})
