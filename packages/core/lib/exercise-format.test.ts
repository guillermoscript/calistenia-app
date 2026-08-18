import { describe, it, expect } from 'vitest'
import { formatTempo, quickReps } from './exercise-format'

describe('formatTempo', () => {
  it('returns null without a tempo', () => {
    expect(formatTempo(undefined)).toBeNull()
  })

  it('returns null when every field is empty', () => {
    expect(formatTempo({})).toBeNull()
  })

  it('joins the parts in eccentric → pauseBottom → concentric → pauseTop order', () => {
    expect(formatTempo({ eccentric: 5, pauseBottom: 1, concentric: 2, pauseTop: 3 }))
      .toBe('baja 5s · pausa 1s abajo · sube 2s · pausa 3s arriba')
  })

  it('concentric of 1 second reads as explosive', () => {
    expect(formatTempo({ concentric: 1 })).toBe('sube explosivo')
  })

  it('keeps a zero — it is a real value, not a missing one', () => {
    expect(formatTempo({ pauseTop: 0 })).toBe('pausa 0s arriba')
  })
})

describe('quickReps', () => {
  it('takes the low end of a numeric range', () => {
    expect(quickReps('8-12')).toBe('8')
  })

  it('leaves a plain number alone', () => {
    expect(quickReps('10')).toBe('10')
  })

  it('leaves per-side and open-ended reps alone', () => {
    expect(quickReps('12/lado')).toBe('12/lado')
    expect(quickReps('máx')).toBe('máx')
    expect(quickReps('8-12/lado')).toBe('8-12/lado')
  })
})
