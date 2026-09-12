import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REMINDER_DAYS,
  TRAINING_TIME_PRESETS,
  findTrainingTimePreset,
  formatReminderTime,
  reminderDaysFromTraining,
} from './onboarding-reminder'

describe('reminderDaysFromTraining', () => {
  it('convierte los ids del onboarding (mon…sun) al índice JS (0 = domingo) en orden estable', () => {
    expect(reminderDaysFromTraining(['wed', 'mon', 'sun'])).toEqual([0, 1, 3])
  })

  it('acepta también los ids de programa (lun…dom)', () => {
    expect(reminderDaysFromTraining(['mie', 'lun', 'dom'])).toEqual([0, 1, 3])
  })

  it('cae a lunes-viernes sin días marcados', () => {
    expect(reminderDaysFromTraining([])).toEqual([...DEFAULT_REMINDER_DAYS])
    expect(reminderDaysFromTraining(undefined)).toEqual([1, 2, 3, 4, 5])
  })

  it('ignora ids desconocidos y duplicados', () => {
    expect(reminderDaysFromTraining(['mon', 'mon', 'xyz'])).toEqual([1])
    expect(reminderDaysFromTraining(['xyz'])).toEqual([1, 2, 3, 4, 5])
  })
})

describe('findTrainingTimePreset', () => {
  it('devuelve el preset pedido', () => {
    expect(findTrainingTimePreset('morning')).toMatchObject({ hour: 7, minute: 0 })
  })

  it('cae al preset por defecto con un id desconocido', () => {
    expect(findTrainingTimePreset('nope').id).toBe('afternoon')
    expect(findTrainingTimePreset(null).id).toBe('afternoon')
  })

  it('todos los presets tienen hora y minuto válidos', () => {
    for (const p of TRAINING_TIME_PRESETS) {
      expect(p.hour).toBeGreaterThanOrEqual(0)
      expect(p.hour).toBeLessThanOrEqual(23)
      expect(p.minute).toBeGreaterThanOrEqual(0)
      expect(p.minute).toBeLessThanOrEqual(59)
    }
  })
})

describe('formatReminderTime', () => {
  it('rellena con ceros', () => {
    expect(formatReminderTime(7, 5)).toBe('07:05')
    expect(formatReminderTime(20, 30)).toBe('20:30')
  })

  it('acota valores fuera de rango', () => {
    expect(formatReminderTime(25, 70)).toBe('23:59')
    expect(formatReminderTime(-1, -1)).toBe('00:00')
  })
})
