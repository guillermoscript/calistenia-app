import { describe, it, expect, vi } from 'vitest'
import { addDaysIn, diffDaysIn, localMidnightAsUTCIn, todayStrIn, utcToLocalDateStrIn } from './tzDate'

const TZ = 'America/Caracas'

describe('tzDate con entradas válidas', () => {
  it('todayStrIn devuelve YYYY-MM-DD', () => {
    expect(todayStrIn(TZ)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('addDaysIn / diffDaysIn / localMidnightAsUTCIn / utcToLocalDateStrIn', () => {
    expect(addDaysIn('2026-03-24', 1, TZ)).toBe('2026-03-25')
    expect(diffDaysIn('2026-03-31', '2026-03-24', TZ)).toBe(7)
    expect(localMidnightAsUTCIn('2026-03-24', TZ)).toBe('2026-03-24 04:00:00')
    expect(utcToLocalDateStrIn('2026-03-24 03:59:00.000Z', TZ)).toBe('2026-03-23')
  })
})

describe('tzDate con entradas inválidas (NO debe lanzar)', () => {
  // dayjs.tz('Invalid Date', tz) lanza RangeError: Invalid time value en vez de
  // devolver un dayjs inválido; la v1.12.2 se caía en la Home por esto.
  it('diffDaysIn devuelve 0', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => diffDaysIn('2026-08-27', 'Invalid Date', TZ)).not.toThrow()
    expect(diffDaysIn('2026-08-27', 'Invalid Date', TZ)).toBe(0)
    expect(diffDaysIn('Invalid Date', '2026-08-27', TZ)).toBe(0)
    expect(diffDaysIn('', '2026-08-27', TZ)).toBe(0)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
  it('addDaysIn devuelve la entrada, localMidnightAsUTCIn y utcToLocalDateStrIn devuelven vacío', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(addDaysIn('Invalid Date', 1, TZ)).toBe('Invalid Date')
    expect(localMidnightAsUTCIn('Invalid Date', TZ)).toBe('')
    expect(utcToLocalDateStrIn('Invalid Date', TZ)).toBe('')
    expect(utcToLocalDateStrIn('', TZ)).toBe('')
    vi.restoreAllMocks()
  })
})
