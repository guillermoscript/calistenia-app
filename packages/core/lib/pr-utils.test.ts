import { describe, it, expect } from 'vitest'
import { parseRepsForPR, estimate1RM } from './pr-utils'

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

describe('estimate1RM', () => {
  it('single rep returns the weight itself', () => {
    expect(estimate1RM(100, 1)).toBe(100)
  })

  it('Epley: 100kg × 10 reps → 133.3', () => {
    expect(estimate1RM(100, 10)).toBe(133.3)
  })

  it('Epley: 40kg × 8 reps → 50.7', () => {
    expect(estimate1RM(40, 8)).toBe(50.7)
  })

  it('null/zero reps treated as 1 rep', () => {
    expect(estimate1RM(60, null)).toBe(60)
    expect(estimate1RM(60, 0)).toBe(60)
  })

  it('no weight → null', () => {
    expect(estimate1RM(null, 10)).toBeNull()
    expect(estimate1RM(0, 10)).toBeNull()
    expect(estimate1RM(undefined, 10)).toBeNull()
  })

  it('heavier low-rep set beats lighter high-rep set (gym PR semantics)', () => {
    expect(estimate1RM(40, 8)!).toBeGreaterThan(estimate1RM(20, 12)!)
  })
})
