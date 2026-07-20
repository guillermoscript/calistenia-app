import { describe, it, expect } from 'vitest'
import { bedtimeToMinutes, bedtimeConsistencyMinutes, pctTrue, avgDefined } from './sleepStats'

describe('bedtimeToMinutes', () => {
  it('parses a PM bedtime as minutes-from-midnight', () => {
    expect(bedtimeToMinutes('23:00')).toBe(1380)
  })

  it('treats early-morning hours (0-11) as "next day" so late bedtimes cluster together', () => {
    expect(bedtimeToMinutes('00:15')).toBe(1455) // (0+24)*60+15
    expect(bedtimeToMinutes('01:30')).toBe(1530) // (1+24)*60+30
  })

  it('returns null for an unparseable string', () => {
    expect(bedtimeToMinutes('')).toBeNull()
    expect(bedtimeToMinutes('not-a-time')).toBeNull()
  })
})

describe('bedtimeConsistencyMinutes', () => {
  it('returns 0 for an empty array (no divide-by-zero)', () => {
    expect(bedtimeConsistencyMinutes([])).toBe(0)
  })

  it('returns 0 for a single sample (nothing to compare against)', () => {
    expect(bedtimeConsistencyMinutes(['23:00'])).toBe(0)
  })

  it('reports a small stddev for a consistent bedtime schedule', () => {
    expect(bedtimeConsistencyMinutes(['23:00', '23:05', '22:58', '23:02'])).toBeLessThan(5)
  })

  it('reports a large stddev for an irregular schedule', () => {
    expect(bedtimeConsistencyMinutes(['21:00', '01:30', '23:45', '20:15'])).toBeGreaterThan(60)
  })

  it('normalizes past-midnight bedtimes so a tight late cluster stays tight', () => {
    // 23:00, 23:30, 00:15 son bedtimes consecutivos y cercanos en el reloj de
    // pared — sin la normalización "h<12 => +24h" el 00:15 parecería estar a
    // ~23h de distancia y dispararía una stddev espuria.
    expect(bedtimeConsistencyMinutes(['23:00', '23:30', '00:15'])).toBe(30.8)
  })

  it('ignores unparseable entries mixed in with valid ones', () => {
    const withGarbage = bedtimeConsistencyMinutes(['23:00', '23:05', 'oops', '22:58'])
    const clean = bedtimeConsistencyMinutes(['23:00', '23:05', '22:58'])
    expect(withGarbage).toBe(clean)
  })
})

describe('pctTrue', () => {
  it('returns 0 when there are no defined entries', () => {
    expect(pctTrue([])).toBe(0)
    expect(pctTrue([undefined, undefined])).toBe(0)
  })

  it('computes the percentage of true among defined entries, ignoring undefined', () => {
    expect(pctTrue([true, false, true])).toBe(67) // round(2/3 * 100)
    expect(pctTrue([true, undefined, false, undefined])).toBe(50)
  })

  it('returns 100 when all defined entries are true', () => {
    expect(pctTrue([true, true])).toBe(100)
  })
})

describe('avgDefined', () => {
  it('returns 0 when there are no defined values', () => {
    expect(avgDefined([])).toBe(0)
    expect(avgDefined([undefined, undefined])).toBe(0)
  })

  it('averages only the defined values, rounded to 1 decimal', () => {
    expect(avgDefined([1, 3, 2])).toBe(2)
    expect(avgDefined([2, 4, undefined])).toBe(3)
    expect(avgDefined([1, 2])).toBe(1.5)
  })
})
