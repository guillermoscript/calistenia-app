import { describe, it, expect } from 'vitest'
import { workoutTodayUrl, reminderUrl } from './workout-today-url'

describe('workoutTodayUrl', () => {
  it('mapea getDay() al id del día', () => {
    expect(workoutTodayUrl(0)).toBe('/workout?day=dom')
    expect(workoutTodayUrl(1)).toBe('/workout?day=lun')
    expect(workoutTodayUrl(3)).toBe('/workout?day=mie')
    expect(workoutTodayUrl(6)).toBe('/workout?day=sab')
  })
  it('cae a /workout con un índice inválido', () => {
    expect(workoutTodayUrl(9)).toBe('/workout')
    expect(workoutTodayUrl(-1)).toBe('/workout')
  })
})

describe('reminderUrl', () => {
  it('workout abre el día de hoy', () => {
    expect(reminderUrl('workout', 2)).toBe('/workout?day=mar')
  })
  it('pause abre movilidad de espalda baja', () => {
    expect(reminderUrl('pause', 2)).toBe('/lumbar')
  })
  it('meal abre nutrición y lo demás la raíz', () => {
    expect(reminderUrl('meal', 2)).toBe('/nutrition')
    expect(reminderUrl('otro', 2)).toBe('/')
  })
})
