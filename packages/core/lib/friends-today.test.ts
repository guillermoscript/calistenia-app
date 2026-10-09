import { describe, it, expect } from 'vitest'
import { friendsTodayBounds } from './friends-today'
import { localMidnightAsUTC } from './dateUtils'

describe('friendsTodayBounds', () => {
  it('sessions usa la hora de pared sin convertir a UTC', () => {
    expect(friendsTodayBounds('2026-10-09').wall).toBe('2026-10-09 00:00:00')
  })

  it('circuito y cardio usan la medianoche local en UTC', () => {
    expect(friendsTodayBounds('2026-10-09').utc).toBe(localMidnightAsUTC('2026-10-09'))
  })
})
