import { describe, expect, it } from 'vitest'
import { shouldPollActiveBattle } from '../active-battle-poll'

describe('shouldPollActiveBattle', () => {
  it('sondea en Hoy y en Comunidad, que es donde se ve la batalla', () => {
    expect(shouldPollActiveBattle('/')).toBe(true)
    expect(shouldPollActiveBattle('/community')).toBe(true)
  })

  it('no sondea en el resto de pestañas ni en pantallas sueltas', () => {
    for (const path of ['/train', '/progress', '/nutrition', '/programs', '/library', '/calendar', '/profile', '/battle-create', '/battle/abc', '/leaderboard']) {
      expect(shouldPollActiveBattle(path)).toBe(false)
    }
  })

  it('sin ruta todavía no sondea', () => {
    expect(shouldPollActiveBattle(undefined)).toBe(false)
    expect(shouldPollActiveBattle(null)).toBe(false)
    expect(shouldPollActiveBattle('')).toBe(false)
  })
})
