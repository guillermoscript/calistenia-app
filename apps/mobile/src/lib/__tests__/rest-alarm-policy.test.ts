import { describe, expect, it } from 'vitest'

import {
  CANCEL_GRACE_MS,
  MIN_ARM_MS,
  restAlarmAction,
  shouldCancelOnLeave,
} from '../rest-alarm-policy'

describe('restAlarmAction', () => {
  it('no arma nada mientras la app está delante — el «vamos» lo toca la app', () => {
    expect(restAlarmAction(true, 60_000, false)).toBe('none')
  })

  it('desarma al volver a primer plano', () => {
    expect(restAlarmAction(true, 60_000, true)).toBe('disarm')
  })

  it('arma al irse a segundo plano', () => {
    expect(restAlarmAction(false, 60_000, false)).toBe('arm')
  })

  it('no rearma lo que ya está armado', () => {
    expect(restAlarmAction(false, 60_000, true)).toBe('none')
  })

  it('no arma un descanso que ya se acabó', () => {
    expect(restAlarmAction(false, MIN_ARM_MS - 1, false)).toBe('none')
    expect(restAlarmAction(false, 0, false)).toBe('none')
    expect(restAlarmAction(false, -5_000, false)).toBe('none')
  })

  it('arma justo en el límite', () => {
    expect(restAlarmAction(false, MIN_ARM_MS, false)).toBe('arm')
  })
})

describe('shouldCancelOnLeave', () => {
  it('cancela si aún queda descanso (salto manual)', () => {
    expect(shouldCancelOnLeave(30_000)).toBe(true)
  })

  it('NO cancela la que está venciendo: con la app en segundo plano es lo único que suena', () => {
    expect(shouldCancelOnLeave(0)).toBe(false)
    expect(shouldCancelOnLeave(CANCEL_GRACE_MS)).toBe(false)
    expect(shouldCancelOnLeave(-1_000)).toBe(false)
  })
})
