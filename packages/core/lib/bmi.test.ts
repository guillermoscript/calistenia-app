import { describe, it, expect } from 'vitest'
import { parseDecimal, normalizeHeightCm, calculateBmi, bmiCategoryKey, calculateWhtr, whtrCategoryKey, whtrColorClass } from './bmi'

describe('parseDecimal', () => {
  it('acepta punto decimal', () => {
    expect(parseDecimal('75.5')).toBe(75.5)
  })

  it('acepta coma decimal (teclado español)', () => {
    expect(parseDecimal('75,5')).toBe(75.5)
  })

  it('recorta espacios', () => {
    expect(parseDecimal('  80 ')).toBe(80)
  })

  it('string vacío → null', () => {
    expect(parseDecimal('')).toBe(null)
  })

  it('texto no numérico → null', () => {
    expect(parseDecimal('abc')).toBe(null)
  })

  it('múltiples separadores → null', () => {
    expect(parseDecimal('1,2,3')).toBe(null)
  })

  it('null/undefined → null', () => {
    expect(parseDecimal(null)).toBe(null)
    expect(parseDecimal(undefined)).toBe(null)
  })
})

describe('normalizeHeightCm', () => {
  it('altura en metros (< 3) se convierte a cm', () => {
    expect(normalizeHeightCm(1.75)).toBe(175)
  })

  it('altura ya en cm se deja igual', () => {
    expect(normalizeHeightCm(175)).toBe(175)
  })

  it('0 se deja igual (no es un metro válido)', () => {
    expect(normalizeHeightCm(0)).toBe(0)
  })

  it('2.99 se trata como metros', () => {
    expect(normalizeHeightCm(2.99)).toBe(299)
  })

  it('3 ya se trata como cm (límite)', () => {
    expect(normalizeHeightCm(3)).toBe(3)
  })
})

describe('calculateBmi', () => {
  it('75kg, 175cm → 24.5', () => {
    expect(calculateBmi(75, 175)).toBe(24.5)
  })

  it('75kg, 1.75 (metros) → 24.5 normalizado', () => {
    expect(calculateBmi(75, 1.75)).toBe(24.5)
  })

  it('75.5kg, 175cm → 24.7', () => {
    expect(calculateBmi(75.5, 175)).toBe(24.7)
  })

  it('peso null → null', () => {
    expect(calculateBmi(null, 175)).toBe(null)
  })

  it('altura null → null', () => {
    expect(calculateBmi(75, null)).toBe(null)
  })

  it('altura 0 → null', () => {
    expect(calculateBmi(75, 0)).toBe(null)
  })

  it('peso implausible (5kg) → null', () => {
    expect(calculateBmi(5, 175)).toBe(null)
  })

  it('altura implausible (500cm) → null', () => {
    expect(calculateBmi(75, 500)).toBe(null)
  })
})

describe('bmiCategoryKey', () => {
  it('18.4 → bmiUnderweight', () => {
    expect(bmiCategoryKey(18.4)).toBe('bmiUnderweight')
  })

  it('18.5 → bmiNormal', () => {
    expect(bmiCategoryKey(18.5)).toBe('bmiNormal')
  })

  it('24.9 → bmiNormal', () => {
    expect(bmiCategoryKey(24.9)).toBe('bmiNormal')
  })

  it('25 → bmiOverweight', () => {
    expect(bmiCategoryKey(25)).toBe('bmiOverweight')
  })

  it('29.9 → bmiOverweight', () => {
    expect(bmiCategoryKey(29.9)).toBe('bmiOverweight')
  })

  it('30 → bmiObese', () => {
    expect(bmiCategoryKey(30)).toBe('bmiObese')
  })
})

describe('calculateWhtr', () => {
  it('calcula el ratio cintura/altura con 2 decimales', () => {
    expect(calculateWhtr(80, 175)).toBe(0.46)
    expect(calculateWhtr(90, 170)).toBe(0.53)
  })

  it('acepta altura en metros (normalizeHeightCm)', () => {
    expect(calculateWhtr(80, 1.75)).toBe(0.46)
  })

  it('devuelve null con entradas faltantes', () => {
    expect(calculateWhtr(null, 175)).toBeNull()
    expect(calculateWhtr(80, null)).toBeNull()
    expect(calculateWhtr(0, 175)).toBeNull()
  })

  it('devuelve null fuera de rangos plausibles', () => {
    expect(calculateWhtr(20, 175)).toBeNull()
    expect(calculateWhtr(400, 175)).toBeNull()
    expect(calculateWhtr(80, 50)).toBeNull()
    expect(calculateWhtr(80, 300)).toBeNull()
  })
})

describe('whtrCategoryKey', () => {
  it('<0.5 → saludable', () => {
    expect(whtrCategoryKey(0.4)).toBe('whtrHealthy')
    expect(whtrCategoryKey(0.49)).toBe('whtrHealthy')
  })
  it('0.5–0.6 → riesgo aumentado', () => {
    expect(whtrCategoryKey(0.5)).toBe('whtrIncreased')
    expect(whtrCategoryKey(0.6)).toBe('whtrIncreased')
  })
  it('>0.6 → riesgo alto', () => {
    expect(whtrCategoryKey(0.61)).toBe('whtrHigh')
  })
})

describe('whtrColorClass', () => {
  it('mapea categorías a colores del design system', () => {
    expect(whtrColorClass(0.45)).toBe('text-emerald-500')
    expect(whtrColorClass(0.55)).toBe('text-amber-400')
    expect(whtrColorClass(0.65)).toBe('text-red-500')
  })
})
