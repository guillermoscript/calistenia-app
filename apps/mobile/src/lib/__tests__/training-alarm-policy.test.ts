import { describe, expect, it } from 'vitest'

import {
  ALARM_VIBRATION_PATTERN,
  CANCEL_GRACE_MS,
  MIN_ARM_MS,
  shouldCancelOnLeave,
  trainingAlarmAction,
} from '../training-alarm-policy'

const NOW = 1_700_000_000_000
const end = (msLeft: number) => NOW + msLeft

describe('trainingAlarmAction', () => {
  it('no arma nada mientras la app está delante — el aviso lo toca la app', () => {
    expect(trainingAlarmAction(true, end(60_000), NOW, null)).toBe('none')
  })

  it('desarma al volver a primer plano', () => {
    expect(trainingAlarmAction(true, end(60_000), NOW, end(60_000))).toBe('disarm')
  })

  it('arma al irse a segundo plano', () => {
    expect(trainingAlarmAction(false, end(60_000), NOW, null)).toBe('arm')
  })

  it('no rearma lo que ya está armado para ese mismo fin', () => {
    expect(trainingAlarmAction(false, end(60_000), NOW, end(60_000))).toBe('none')
  })

  it('rearma si el fin se ha movido (+30 s, reanudar el crono)', () => {
    expect(trainingAlarmAction(false, end(90_000), NOW, end(60_000))).toBe('arm')
  })

  it('desarma si ya no hay cuenta en marcha (crono en pausa)', () => {
    expect(trainingAlarmAction(false, null, NOW, end(60_000))).toBe('disarm')
    expect(trainingAlarmAction(false, null, NOW, null)).toBe('none')
  })

  it('la cuenta llega a cero con la app detrás: la alarma que vence NO se toca', () => {
    // `endAt` a null es lo que hace el crono al completar. Desarmar aquí era
    // exactamente lo que silenciaba el aviso.
    expect(trainingAlarmAction(false, null, NOW, end(0))).toBe('none')
    expect(trainingAlarmAction(false, null, NOW, end(-500))).toBe('none')
    expect(trainingAlarmAction(false, end(0), NOW, end(0))).toBe('none')
  })

  it('pero delante sí se desarma aunque esté venciendo — el JS está vivo y suena la app', () => {
    expect(trainingAlarmAction(true, null, NOW, end(0))).toBe('disarm')
  })

  it('no arma una cuenta que ya se acabó', () => {
    expect(trainingAlarmAction(false, end(MIN_ARM_MS - 1), NOW, null)).toBe('none')
    expect(trainingAlarmAction(false, end(0), NOW, null)).toBe('none')
    expect(trainingAlarmAction(false, end(-5_000), NOW, null)).toBe('none')
  })

  it('NO desarma la que está venciendo: es la que tiene que sonar', () => {
    expect(trainingAlarmAction(false, end(500), NOW, end(500))).toBe('none')
    expect(trainingAlarmAction(false, end(-1_000), NOW, end(-1_000))).toBe('none')
  })

  it('arma justo en el límite', () => {
    expect(trainingAlarmAction(false, end(MIN_ARM_MS), NOW, null)).toBe('arm')
  })
})

describe('shouldCancelOnLeave', () => {
  it('cancela si aún queda cuenta (salto manual)', () => {
    expect(shouldCancelOnLeave(30_000)).toBe(true)
  })

  it('NO cancela la que está venciendo: con la app en segundo plano es lo único que suena', () => {
    expect(shouldCancelOnLeave(0)).toBe(false)
    expect(shouldCancelOnLeave(CANCEL_GRACE_MS)).toBe(false)
    expect(shouldCancelOnLeave(-1_000)).toBe(false)
  })
})

describe('ALARM_VIBRATION_PATTERN', () => {
  it('cumple lo que valida notifee: longitud par y todo positivo (CALISTENIA-APP-16)', () => {
    expect(ALARM_VIBRATION_PATTERN.length % 2).toBe(0)
    expect(ALARM_VIBRATION_PATTERN.every((ms) => Number.isInteger(ms) && ms > 0)).toBe(true)
  })
})
