/**
 * #880: en Hermes (Android) `new Date(date.toLocaleString('en-US', {timeZone}))`
 * es Invalid Date, y `dayjs.tz` se quedaba en UTC. Se simula haciendo que
 * `toLocaleString` devuelva algo que ningún `new Date(...)` puede parsear;
 * `Intl.DateTimeFormat#formatToParts` queda intacto, como en Hermes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  localDay,
  localHour,
  localMinutesSinceMidnight,
  setTimezone,
  startOfWeekStr,
  todayStr,
  toLocalDateStr,
  utcToLocalDateStr,
} from './dateUtils'
import { localMidnightAsUTCIn, todayStrIn } from './tzDate'

function setClock(iso: string) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(iso))
}

describe('dateUtils con el toLocaleString de Hermes (Invalid Date)', () => {
  beforeEach(() => {
    vi.spyOn(Date.prototype, 'toLocaleString').mockReturnValue('no-parseable')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    setTimezone('UTC')
  })

  it('sanity: el stub deja Invalid Date como en Hermes', () => {
    expect(new Date(new Date().toLocaleString('en-US', { timeZone: 'UTC' })).getTime()).toBeNaN()
  })

  it('America/Caracas (-04) a las 22:00 locales: sigue siendo el día 29', () => {
    setClock('2026-09-30T02:00:00Z')
    setTimezone('America/Caracas')
    expect(todayStr()).toBe('2026-09-29')
    expect(localHour()).toBe(22)
    expect(localMinutesSinceMidnight()).toBe(22 * 60)
    expect(localDay()).toBe(2) // martes
    expect(toLocalDateStr()).toBe('2026-09-29')
    expect(startOfWeekStr()).toBe('2026-09-28')
    expect(todayStrIn('America/Caracas')).toBe('2026-09-29')
  })

  it('Europe/Madrid (+02): a las 01:30 locales ya es el día siguiente', () => {
    setClock('2026-09-29T23:30:00Z')
    setTimezone('Europe/Madrid')
    expect(todayStr()).toBe('2026-09-30')
    expect(localHour()).toBe(1)
    expect(localDay()).toBe(3) // miércoles
  })

  it('medianoche exacta no da hora 24', () => {
    setClock('2026-01-15T05:00:00Z')
    setTimezone('America/New_York')
    expect(localHour()).toBe(0)
    expect(todayStr()).toBe('2026-01-15')
  })

  it('utcToLocalDateStr en el borde del día', () => {
    setTimezone('America/Caracas')
    expect(utcToLocalDateStr('2026-09-30 03:59:59.000Z')).toBe('2026-09-29')
    expect(utcToLocalDateStr('2026-09-30 04:00:00.000Z')).toBe('2026-09-30')
    setTimezone('Europe/Madrid')
    expect(utcToLocalDateStr('2026-09-29 21:59:59.000Z')).toBe('2026-09-29')
    expect(utcToLocalDateStr('2026-09-29 22:00:00.000Z')).toBe('2026-09-30')
  })

  it('#893: timestamp de PocketBase (con espacio) a su día local', () => {
    setTimezone('America/Caracas')
    // 22:11 del 30-sep en Caracas = 02:11 UTC del 1-oct
    expect(utcToLocalDateStr('2026-10-01 02:11:47.198Z')).toBe('2026-09-30')
    expect(utcToLocalDateStr('2026-10-01T02:11:47.198Z')).toBe('2026-09-30')
    setTimezone('UTC')
    expect(utcToLocalDateStr('2026-10-01 02:11:47.198Z')).toBe('2026-10-01')
  })

  it('localMidnightAsUTCIn respeta el cambio de horario', () => {
    expect(localMidnightAsUTCIn('2026-03-24', 'America/New_York')).toBe('2026-03-24 04:00:00') // EDT
    expect(localMidnightAsUTCIn('2026-01-24', 'America/New_York')).toBe('2026-01-24 05:00:00') // EST
    expect(localMidnightAsUTCIn('2026-03-29', 'Europe/Madrid')).toBe('2026-03-28 23:00:00') // día del cambio, aún CET
  })
})
