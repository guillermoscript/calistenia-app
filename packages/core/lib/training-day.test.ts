import { describe, it, expect } from 'vitest'
import { nextTrainingDay, pickTrainingDay } from './training-day'
import type { WeekDay, DayId, DayType } from '../types'

const day = (id: DayId, type: DayType): WeekDay => ({ id, name: id, focus: '', type, color: '' })
const WEEK: WeekDay[] = [
  day('lun', 'full'), day('mar', 'rest'), day('mie', 'legs'), day('jue', 'rest'),
  day('vie', 'cardio'), day('sab', 'rest'), day('dom', 'rest'),
]

describe('pickTrainingDay (#574)', () => {
  it('devuelve hoy si es entrenable', () => {
    expect(pickTrainingDay(WEEK, 'lun')).toBe('lun')
  })
  it('cardio cuenta como entrenable', () => {
    expect(pickTrainingDay(WEEK, 'vie')).toBe('vie')
  })
  it('en descanso salta al siguiente entrenable', () => {
    expect(pickTrainingDay(WEEK, 'mar')).toBe('mie')
  })
  it('da la vuelta a la semana desde el domingo', () => {
    expect(pickTrainingDay(WEEK, 'dom')).toBe('lun')
  })
  it('días ausentes de la semana cuentan como descanso', () => {
    expect(pickTrainingDay([day('jue', 'push')], 'lun')).toBe('jue')
  })
  it('null si no hay nada que entrenar', () => {
    expect(pickTrainingDay([day('lun', 'rest')], 'lun')).toBeNull()
    expect(pickTrainingDay([], 'lun')).toBeNull()
  })
})

describe('nextTrainingDay', () => {
  it('no incluye el propio día salvo que sea el único', () => {
    expect(nextTrainingDay(WEEK, 'lun')).toBe('mie')
    expect(nextTrainingDay([day('lun', 'full')], 'lun')).toBe('lun')
  })
})
