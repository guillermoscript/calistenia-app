import { describe, expect, it } from 'vitest'
import {
  STALE_PROGRAM_COMPLETE_DAYS,
  isStaleProgramComplete,
  COMPLETION_ADHERENCE_THRESHOLD,
  EXTENSION_WEEKS,
  canExtendProgram,
  extensionWeeksFor,
  programOutcome,
} from './programOutcome'

const done = (programSessionsDone: number, programSessionsPlanned = 48) => ({ programSessionsDone, programSessionsPlanned })
const ended = (n: number, extra: Partial<{ isCompleted: boolean; baseWeeks: number }> = {}) => ({
  ...done(n),
  isCompleted: true,
  baseWeeks: 12,
  ...extra,
})

describe('programOutcome (#938)', () => {
  it('el umbral es el 70 %', () => {
    expect(COMPLETION_ADHERENCE_THRESHOLD).toBe(70)
  })

  it('70 % o más es completado, por debajo finalizado', () => {
    expect(programOutcome(done(34))).toBe('completed') // 70,8 % → 71
    expect(programOutcome(done(33))).toBe('finished')  // 68,75 % → 69
    expect(programOutcome(done(48))).toBe('completed')
    expect(programOutcome(done(0))).toBe('finished')
  })

  it('sin nada que medir cuenta como completado', () => {
    expect(programOutcome(done(0, 0))).toBe('completed')
  })
})

describe('canExtendProgram', () => {
  it('se ofrece al finalizado, terminado y sin extender', () => {
    expect(canExtendProgram(ended(10), 0)).toBe(true)
    expect(canExtendProgram(ended(10), undefined)).toBe(true)
  })

  it('una sola vez: ya extendido no se ofrece', () => {
    expect(canExtendProgram(ended(10), 2)).toBe(false)
  })

  it('no al completado, ni antes de terminar, ni sin duración', () => {
    expect(canExtendProgram(ended(40), 0)).toBe(false)
    expect(canExtendProgram(ended(10, { isCompleted: false }), 0)).toBe(false)
    expect(canExtendProgram({ ...ended(0, { baseWeeks: 0 }), programSessionsPlanned: 0 }, 0)).toBe(false)
  })
})

describe('extensionWeeksFor', () => {
  it('al día siguiente del final: 1 de hueco + 2', () => {
    expect(extensionWeeksFor('2026-08-25', '2026-08-26')).toBe(1 + EXTENSION_WEEKS)
  })

  it('siempre quedan al menos 2 semanas desde hoy', () => {
    for (let late = 1; late <= 60; late++) {
      const today = new Date(Date.UTC(2026, 7, 25 + late)).toISOString().slice(0, 10)
      const weeks = extensionWeeksFor('2026-08-25', today)
      const newEndOffset = weeks * 7 // días desde el final original
      expect(newEndOffset - late, `late=${late}`).toBeGreaterThanOrEqual(EXTENSION_WEEKS * 7)
      expect(newEndOffset - late, `late=${late}`).toBeLessThan(EXTENSION_WEEKS * 7 + 7)
    }
  })

  it('sin final conocido da las 2 semanas', () => {
    expect(extensionWeeksFor(null, '2026-08-26')).toBe(EXTENSION_WEEKS)
  })
})

describe('isStaleProgramComplete (#940)', () => {
  it('a partir de 7 días tras el final sin elegir', () => {
    expect(STALE_PROGRAM_COMPLETE_DAYS).toBe(7)
    expect(isStaleProgramComplete({ isCompleted: true, endDay: '2026-08-25' }, '2026-08-31')).toBe(false) // 6
    expect(isStaleProgramComplete({ isCompleted: true, endDay: '2026-08-25' }, '2026-09-01')).toBe(true)  // 7
  })
  it('nunca con el programa en curso', () => {
    expect(isStaleProgramComplete({ isCompleted: false, endDay: '2026-08-25' }, '2026-10-01')).toBe(false)
  })
})
