import { describe, expect, it } from 'vitest'
import { summarizeReminderSchedule } from './push-prompt-copy'

describe('summarizeReminderSchedule', () => {
  it('sin recordatorio guardado devuelve null (copy genérico)', () => {
    expect(summarizeReminderSchedule(null)).toBeNull()
    expect(summarizeReminderSchedule(undefined)).toBeNull()
  })

  it('sin días válidos devuelve null', () => {
    expect(summarizeReminderSchedule({ hour: 19, minute: 0, daysOfWeek: [] })).toBeNull()
    expect(summarizeReminderSchedule({ hour: 19, minute: 0, daysOfWeek: [99, -3] })).toBeNull()
  })

  it('formatea la hora y ordena lunes(0)…sábado(5) con la convención 1=lunes…6=sábado', () => {
    // Ajustes > Recordatorios: 1=lunes..7=domingo
    expect(summarizeReminderSchedule({ hour: 19, minute: 0, daysOfWeek: [5, 1, 3] })).toEqual({
      time: '19:00',
      dayShortIndexes: [0, 2, 4], // lun, mié, vie
      isEveryDay: false,
    })
  })

  it('normaliza domingo tanto en la convención 0 (onboarding) como 7 (Ajustes)', () => {
    // onboarding: reminderDaysFromTraining usa Date.getDay() → domingo=0
    expect(summarizeReminderSchedule({ hour: 8, minute: 30, daysOfWeek: [0] })).toEqual({
      time: '08:30',
      dayShortIndexes: [6],
      isEveryDay: false,
    })
    // Ajustes > Recordatorios: domingo=7
    expect(summarizeReminderSchedule({ hour: 8, minute: 30, daysOfWeek: [7] })).toEqual({
      time: '08:30',
      dayShortIndexes: [6],
      isEveryDay: false,
    })
  })

  it('quita duplicados', () => {
    expect(summarizeReminderSchedule({ hour: 7, minute: 0, daysOfWeek: [1, 1, 2, 2] })!.dayShortIndexes)
      .toEqual([0, 1])
  })

  it('isEveryDay cuando cubre los 7 días, sin importar la convención del domingo', () => {
    expect(summarizeReminderSchedule({ hour: 7, minute: 0, daysOfWeek: [1, 2, 3, 4, 5, 6, 0] })?.isEveryDay)
      .toBe(true)
    expect(summarizeReminderSchedule({ hour: 7, minute: 0, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] })?.isEveryDay)
      .toBe(true)
  })

  it('acota horas/minutos fuera de rango igual que formatReminderTime', () => {
    expect(summarizeReminderSchedule({ hour: 25, minute: 90, daysOfWeek: [1] })?.time).toBe('23:59')
  })
})
