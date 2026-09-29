import { describe, expect, it } from 'vitest'
import { getParaTi, PARA_TI_MAX, PARA_TI_ORDER, paraTiEnabled, type ParaTiInput } from './paraTi'

const ALL: ParaTiInput = {
  homeKind: 'training_day',
  accountSessions: 10,
  hasActiveBattle: true,
  joinedChallenges: 1,
  friendsTrainedToday: 2,
  loggedFoodLast7Days: true,
  firstWeekOfPhase: true,
  featuredChallengeAvailable: true,
  followingCount: 0,
  communityProgramAvailable: true,
}
const NONE: ParaTiInput = {
  ...ALL,
  hasActiveBattle: false,
  joinedChallenges: 0,
  friendsTrainedToday: 0,
  loggedFoodLast7Days: false,
  firstWeekOfPhase: false,
  featuredChallengeAvailable: false,
  followingCount: 3,
  communityProgramAvailable: false,
}

describe('getParaTi', () => {
  it('respeta el orden de prioridad y el máximo por superficie', () => {
    expect(getParaTi(ALL, PARA_TI_MAX.mobile)).toEqual(['battle', 'challenge_progress'])
    expect(getParaTi(ALL, PARA_TI_MAX.desktop)).toEqual(['battle', 'challenge_progress', 'friends_today'])
  })

  it('cada entrada aparece solo si aplica', () => {
    expect(getParaTi(NONE, 7)).toEqual([])
    expect(getParaTi({ ...NONE, loggedFoodLast7Days: true, firstWeekOfPhase: true }, 7)).toEqual(['nutrition_today', 'phase_photos'])
  })

  it('reto destacado solo si no participas en ninguno', () => {
    expect(getParaTi({ ...NONE, featuredChallengeAvailable: true }, 7)).toEqual(['featured_challenge'])
    expect(getParaTi({ ...NONE, featuredChallengeAvailable: true, joinedChallenges: 1 }, 7)).toEqual(['challenge_progress'])
  })

  it('programa de la comunidad solo si no sigues a nadie', () => {
    expect(getParaTi({ ...NONE, communityProgramAvailable: true }, 7)).toEqual([])
    expect(getParaTi({ ...NONE, communityProgramAvailable: true, followingCount: 0 }, 7)).toEqual(['community_program'])
  })

  it('todo el orden cuando aplica todo', () => {
    expect(getParaTi(ALL, 99)).toEqual(PARA_TI_ORDER.filter(k => k !== 'featured_challenge'))
  })

  it('nada antes del 3.er entreno de la cuenta ni con una actividad en curso', () => {
    expect(paraTiEnabled({ homeKind: 'training_day', accountSessions: 2 })).toBe(false)
    expect(paraTiEnabled({ homeKind: 'training_day', accountSessions: 3 })).toBe(true)
    expect(paraTiEnabled({ homeKind: 'in_progress', accountSessions: 30 })).toBe(false)
    expect(getParaTi({ ...ALL, accountSessions: 2 }, 3)).toEqual([])
    expect(getParaTi({ ...ALL, homeKind: 'in_progress' }, 3)).toEqual([])
  })

  it('max 0 o inválido no devuelve nada', () => {
    expect(getParaTi(ALL, 0)).toEqual([])
    expect(getParaTi(ALL, Number.NaN)).toEqual([])
  })
})
