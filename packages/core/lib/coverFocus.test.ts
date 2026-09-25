import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COVER_FOCUS,
  coverContentPosition,
  coverObjectPosition,
  focusFromPoint,
  formatCoverFocus,
  nudgeCoverFocus,
  parseCoverFocus,
} from './coverFocus'

/** Patrón del campo en PocketBase (`1789300200_programs_cover_focus.js`). */
const PB_PATTERN = /^(100|[1-9]?[0-9]) (100|[1-9]?[0-9])$/

describe('parseCoverFocus', () => {
  it('vacío, ausente o mal formado es el centro', () => {
    for (const raw of [undefined, null, '', 'abc', '50', '50,30', '-5 20', '101 50', '50 300']) {
      expect(parseCoverFocus(raw)).toEqual(DEFAULT_COVER_FOCUS)
    }
  })

  it('lee «x y» y tolera espacios alrededor', () => {
    expect(parseCoverFocus('30 70')).toEqual({ x: 30, y: 70 })
    expect(parseCoverFocus(' 0 100 ')).toEqual({ x: 0, y: 100 })
  })
})

describe('formatCoverFocus', () => {
  it('el centro se guarda vacío', () => {
    expect(formatCoverFocus({ x: 50, y: 50 })).toBe('')
    expect(formatCoverFocus({ x: 49.6, y: 50.4 })).toBe('')
  })

  it('redondea y recorta a 0-100', () => {
    expect(formatCoverFocus({ x: 33.4, y: 80.6 })).toBe('33 81')
    expect(formatCoverFocus({ x: -5, y: 140 })).toBe('0 100')
    expect(formatCoverFocus({ x: Number.NaN, y: 10 })).toBe('50 10')
  })

  it('siempre produce algo que PocketBase acepta y que se vuelve a leer igual', () => {
    for (let x = 0; x <= 100; x += 7) {
      for (let y = 0; y <= 100; y += 9) {
        const stored = formatCoverFocus({ x, y })
        if (stored === '') continue
        expect(stored).toMatch(PB_PATTERN)
        expect(parseCoverFocus(stored)).toEqual({ x, y })
      }
    }
  })
})

describe('posición para pintar', () => {
  it('web: object-position', () => {
    expect(coverObjectPosition(undefined)).toBe('50% 50%')
    expect(coverObjectPosition('20 80')).toBe('20% 80%')
  })

  it('móvil: contentPosition de expo-image', () => {
    expect(coverContentPosition('')).toEqual({ left: '50%', top: '50%' })
    expect(coverContentPosition('10 90')).toEqual({ left: '10%', top: '90%' })
  })
})

describe('focusFromPoint', () => {
  it('convierte la pulsación en porcentaje de la foto', () => {
    expect(focusFromPoint(100, 50, 200, 100)).toEqual({ x: 50, y: 50 })
    expect(focusFromPoint(0, 0, 200, 100)).toEqual({ x: 0, y: 0 })
    expect(focusFromPoint(150, 80, 200, 100)).toEqual({ x: 75, y: 80 })
  })

  it('fuera del borde se queda en el borde', () => {
    expect(focusFromPoint(250, -10, 200, 100)).toEqual({ x: 100, y: 0 })
  })

  it('sin tamaño medido todavía, centro', () => {
    expect(focusFromPoint(10, 10, 0, 100)).toEqual(DEFAULT_COVER_FOCUS)
  })
})

describe('nudgeCoverFocus', () => {
  it('mueve sin salirse de la foto', () => {
    expect(nudgeCoverFocus({ x: 50, y: 50 }, 10, -10)).toEqual({ x: 60, y: 40 })
    expect(nudgeCoverFocus({ x: 98, y: 1 }, 10, -10)).toEqual({ x: 100, y: 0 })
  })
})
