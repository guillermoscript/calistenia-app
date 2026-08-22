import { describe, expect, it } from 'vitest'
import { programSelectionEvents } from './program-selection-events'

describe('programSelectionEvents (#579)', () => {
  it('primer enrollment → selected + joined', () => {
    expect(programSelectionEvents(null)).toEqual({ selected: true, joined: true })
    expect(programSelectionEvents(undefined)).toEqual({ selected: true, joined: true })
  })

  it('seleccionar el programa ya activo → ningún evento', () => {
    expect(programSelectionEvents({ is_current: true })).toEqual({ selected: false, joined: false })
  })

  it('volver a un programa ya inscrito pero no activo → selected, sin joined', () => {
    expect(programSelectionEvents({ is_current: false })).toEqual({ selected: true, joined: false })
    expect(programSelectionEvents({})).toEqual({ selected: true, joined: false })
  })

  it('dos selecciones seguidas del mismo programa emiten un único selected', () => {
    // Primera: no hay fila → se crea y se emite. Segunda: la fila ya es current.
    const first = programSelectionEvents(null)
    const second = programSelectionEvents({ is_current: true })
    expect([first.selected, second.selected].filter(Boolean)).toHaveLength(1)
    expect([first.joined, second.joined].filter(Boolean)).toHaveLength(1)
  })
})
