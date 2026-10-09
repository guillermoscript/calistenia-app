import { describe, it, expect } from 'vitest'
import { nowWallClockIn, wallClockDay, wallClockDayOf, wallClockDayRange, wallClockForPBIn } from './wallClock'
import { streakDayOf } from './weeklyStreak'

describe('wallClockDayOf', () => {
  it('lee los 10 primeros caracteres sin convertir (hora de pared local)', () => {
    // Madrid 00:30 del 5: como UTC sería el 4 (-1/-2 h); la convención manda el 5
    expect(wallClockDayOf('2026-07-05 00:30:00.000Z', null, 'Europe/Madrid')).toBe('2026-07-05')
    // Caracas 23:30 del 5: como UTC sería el 6 (+4 h)
    expect(wallClockDayOf('2026-07-05 23:30:00.000Z', null, 'America/Caracas')).toBe('2026-07-05')
  })
  it('sin marca válida usa el instante UTC real convertido a tz', () => {
    expect(wallClockDayOf(undefined, '2026-07-05 23:30:00.000Z', 'Europe/Madrid')).toBe('2026-07-06')
    expect(wallClockDayOf('', '2026-07-05 02:00:00.000Z', 'America/Caracas')).toBe('2026-07-04')
    expect(wallClockDayOf('basura', '2026-07-05 12:00:00.000Z', 'UTC')).toBe('2026-07-05')
  })
  it('null si no hay nada utilizable', () => {
    expect(wallClockDayOf(undefined)).toBeNull()
    expect(wallClockDay('2026-02-31 10:00:00')).toBeNull()
  })
  it('streakDayOf delega en la misma regla', () => {
    expect(streakDayOf('', '2026-07-05 00:30:00.000Z')).toBe('2026-07-05')
  })
})

describe('wallClockDayRange', () => {
  it('cotas de hora de pared, no UTC', () => {
    expect(wallClockDayRange('2026-07-01', '2026-07-07')).toEqual({
      from: '2026-07-01 00:00:00',
      to: '2026-07-07 23:59:59.999',
    })
  })
})

describe('escritores de servidor', () => {
  const instant = Date.UTC(2026, 6, 5, 22, 30, 0) // 22:30 UTC
  it('nowWallClockIn da la hora de pared de la zona', () => {
    expect(nowWallClockIn('Europe/Madrid', instant)).toBe('2026-07-06 00:30:00')
    expect(nowWallClockIn('America/Caracas', instant)).toBe('2026-07-05 18:30:00')
  })
  it('wallClockForPBIn convierte un ISO con zona y respeta uno sin zona', () => {
    expect(wallClockForPBIn('2026-07-05T22:30:00Z', 'Europe/Madrid')).toBe('2026-07-06 00:30:00')
    expect(wallClockForPBIn('2026-07-05T22:30:00-04:00', 'America/Caracas')).toBe('2026-07-05 22:30:00')
    expect(wallClockForPBIn('2026-07-05T09:15', 'Europe/Madrid')).toBe('2026-07-05 09:15:00')
    expect(wallClockForPBIn('2026-07-05', 'Europe/Madrid')).toBe('2026-07-05 00:00:00')
    expect(wallClockForPBIn(new Date(instant), 'UTC')).toBe('2026-07-05 22:30:00')
  })
})
