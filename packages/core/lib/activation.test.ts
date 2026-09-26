import { beforeEach, describe, expect, it, vi } from 'vitest'

const mem = new Map<string, string>()
const track = vi.fn()

vi.mock('../platform', () => ({
  storage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
  },
  getPlatform: () => ({ analytics: { track, identify: vi.fn(), clear: vi.fn() } }),
  getClientInfo: () => ({ version: '1.0.0', build: 0, platform: 'web' as const }),
}))

import {
  activationCardMode,
  activationReachedKey,
  deriveActivation,
  homeFullKey,
  homeShowAllKey,
  homeStage,
  resolveHomeStage,
  trackActivationReached,
} from './activation'

const SIGNUP = '2026-09-20'

describe('deriveActivation', () => {
  it('0 sesiones: ventana abierta con los 7 días el día del alta', () => {
    const s = deriveActivation({ sessionDays: [], signupDay: SIGNUP, today: SIGNUP })
    expect(s).toEqual({
      sessionsInFirst7Days: 0,
      daysRemaining: 7,
      reached: false,
      reachedDay: null,
      daysSinceSignupAtReach: null,
    })
  })

  it('1 y 2 sesiones dentro de la ventana no alcanzan el objetivo', () => {
    const one = deriveActivation({ sessionDays: ['2026-09-20'], signupDay: SIGNUP, today: '2026-09-21' })
    expect(one.sessionsInFirst7Days).toBe(1)
    expect(one.daysRemaining).toBe(6)
    expect(one.reached).toBe(false)

    const two = deriveActivation({ sessionDays: ['2026-09-20', '2026-09-22'], signupDay: SIGNUP, today: '2026-09-22' })
    expect(two.sessionsInFirst7Days).toBe(2)
    expect(two.reached).toBe(false)
  })

  it('3 sesiones dentro de la ventana: alcanzado el día de la 3.ª', () => {
    const s = deriveActivation({
      sessionDays: ['2026-09-24', '2026-09-20', '2026-09-22'],
      signupDay: SIGNUP,
      today: '2026-09-25',
    })
    expect(s.reached).toBe(true)
    expect(s.reachedDay).toBe('2026-09-24')
    expect(s.daysSinceSignupAtReach).toBe(4)
  })

  it('el último día de la ventana (día 6) aún cuenta', () => {
    const s = deriveActivation({
      sessionDays: ['2026-09-20', '2026-09-21', '2026-09-26'],
      signupDay: SIGNUP,
      today: '2026-09-26',
    })
    expect(s.daysRemaining).toBe(1)
    expect(s.reached).toBe(true)
    expect(s.daysSinceSignupAtReach).toBe(6)
  })

  it('3 sesiones pero la 3.ª fuera del día 7: NO activa', () => {
    const s = deriveActivation({
      sessionDays: ['2026-09-20', '2026-09-22', '2026-09-27'],
      signupDay: SIGNUP,
      today: '2026-09-27',
    })
    expect(s.sessionsInFirst7Days).toBe(2)
    expect(s.daysRemaining).toBe(0)
    expect(s.reached).toBe(false)
  })

  it('las sesiones anteriores al alta no cuentan', () => {
    const s = deriveActivation({
      sessionDays: ['2026-09-18', '2026-09-19', '2026-09-20'],
      signupDay: SIGNUP,
      today: SIGNUP,
    })
    expect(s.sessionsInFirst7Days).toBe(1)
  })

  it('varias sesiones el mismo día cuentan una sola vez', () => {
    const s = deriveActivation({
      sessionDays: ['2026-09-20', '2026-09-20', '2026-09-20', '2026-09-21'],
      signupDay: SIGNUP,
      today: '2026-09-21',
    })
    expect(s.sessionsInFirst7Days).toBe(2)
    expect(s.reached).toBe(false)
  })

  it('cruza fin de mes sin depender de la zona horaria', () => {
    const s = deriveActivation({
      sessionDays: ['2026-09-29', '2026-10-01', '2026-10-05'],
      signupDay: '2026-09-29',
      today: '2026-10-05',
    })
    expect(s.daysRemaining).toBe(1)
    expect(s.reached).toBe(true)
    expect(s.reachedDay).toBe('2026-10-05')
  })

  it('sin día de alta no hay ventana', () => {
    const s = deriveActivation({ sessionDays: ['2026-09-20'], signupDay: null, today: SIGNUP })
    expect(s.daysRemaining).toBe(0)
    expect(s.sessionsInFirst7Days).toBe(0)
    expect(s.reached).toBe(false)
  })

  it('un reloj por detrás del alta se trata como el día 0', () => {
    const s = deriveActivation({ sessionDays: [], signupDay: SIGNUP, today: '2026-09-19' })
    expect(s.daysRemaining).toBe(7)
  })
})

describe('activationCardMode', () => {
  const at = (days: string[], today: string) =>
    activationCardMode(deriveActivation({ sessionDays: days, signupDay: SIGNUP, today }), today)

  it('0 → start, 1-2 → progress mientras la ventana siga abierta', () => {
    expect(at([], '2026-09-20')).toBe('start')
    expect(at(['2026-09-20'], '2026-09-21')).toBe('progress')
    expect(at(['2026-09-20', '2026-09-21'], '2026-09-21')).toBe('progress')
  })

  it('completed solo el día en que se alcanza; después se oculta', () => {
    const days = ['2026-09-20', '2026-09-21', '2026-09-22']
    expect(at(days, '2026-09-22')).toBe('completed')
    expect(at(days, '2026-09-23')).toBe('hidden')
  })

  it('ventana cerrada sin llegar → hidden', () => {
    expect(at([], '2026-09-27')).toBe('hidden')
    expect(at(['2026-09-20', '2026-09-21'], '2026-09-30')).toBe('hidden')
  })
})

describe('trackActivationReached', () => {
  beforeEach(() => {
    mem.clear()
    track.mockClear()
  })

  const reached = deriveActivation({
    sessionDays: ['2026-09-20', '2026-09-21', '2026-09-23'],
    signupDay: SIGNUP,
    today: '2026-09-23',
  })

  it('emite activation_reached con sus propiedades y persiste el flag', () => {
    trackActivationReached('u1', reached, 'prog1')
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith('activation_reached', expect.objectContaining({
      surface: 'home',
      sessions_count: 3,
      days_since_signup: 3,
      program_id: 'prog1',
      event_version: 1,
    }))
    expect(mem.get(activationReachedKey('u1'))).toBe('true')
  })

  it('es idempotente: con el flag persistido no vuelve a emitir', () => {
    trackActivationReached('u1', reached, null)
    trackActivationReached('u1', reached, null)
    expect(track).toHaveBeenCalledTimes(1)
    // Un montaje nuevo (misma storage) tampoco re-emite.
    trackActivationReached('u1', { ...reached }, 'prog1')
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('el flag es por usuario', () => {
    trackActivationReached('u1', reached, null)
    trackActivationReached('u2', reached, null)
    expect(track).toHaveBeenCalledTimes(2)
  })

  it('no emite ni marca si el objetivo no se alcanzó', () => {
    const notYet = deriveActivation({ sessionDays: ['2026-09-20'], signupDay: SIGNUP, today: '2026-09-20' })
    trackActivationReached('u1', notYet, null)
    trackActivationReached(null, reached, null)
    expect(track).not.toHaveBeenCalled()
    expect(mem.has(activationReachedKey('u1'))).toBe(false)
  })
})

describe('homeStage (#808)', () => {
  it('0 → first, 1-2 → early, 3+ → full', () => {
    expect(homeStage(0)).toBe('first')
    expect(homeStage(1)).toBe('early')
    expect(homeStage(2)).toBe('early')
    expect(homeStage(3)).toBe('full')
    expect(homeStage(40)).toBe('full')
  })

  it('un contador raro (negativo, NaN) no rompe: cae al inicio simple', () => {
    expect(homeStage(-1)).toBe('first')
    expect(homeStage(Number.NaN)).toBe('first')
  })
})

describe('resolveHomeStage (#808)', () => {
  it('usuario nuevo: sin contador del servidor todavía, manda el del programa', () => {
    expect(resolveHomeStage({ programSessions: 0, lifetimeSessions: undefined, reachedBefore: false }))
      .toEqual({ stage: 'first', sessions: 0 })
    expect(resolveHomeStage({ programSessions: 2, lifetimeSessions: null, reachedBefore: false }))
      .toEqual({ stage: 'early', sessions: 2 })
  })

  it('veterano que acaba de cambiar de programa: el contador de la cuenta lo mantiene en el inicio completo', () => {
    expect(resolveHomeStage({ programSessions: 0, lifetimeSessions: 57, reachedBefore: false }))
      .toEqual({ stage: 'full', sessions: 57 })
  })

  it('sesión recién hecha que el servidor aún no ha contado: gana el mayor', () => {
    expect(resolveHomeStage({ programSessions: 3, lifetimeSessions: 2, reachedBefore: false }).stage).toBe('full')
    expect(resolveHomeStage({ programSessions: 1, lifetimeSessions: 0, reachedBefore: false }).stage).toBe('early')
  })

  it('el flag del dispositivo manda aunque los contadores aún no hayan llegado', () => {
    expect(resolveHomeStage({ programSessions: 0, lifetimeSessions: undefined, reachedBefore: true }))
      .toEqual({ stage: 'full', sessions: 0 })
  })

  it('las claves de storage son por usuario', () => {
    expect(homeFullKey('u1')).toBe('calistenia_home_full_u1')
    expect(homeShowAllKey('u1')).toBe('calistenia_home_show_all_u1')
    expect(homeFullKey('u1')).not.toBe(homeFullKey('u2'))
  })
})
