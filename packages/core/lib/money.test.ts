import { describe, it, expect } from 'vitest'
import { canonCurrency, currencySymbol, toUSD } from './money'

describe('canonCurrency', () => {
  it('mapea alias de bolívar a VES', () => {
    for (const raw of ['Bs', 'bs', 'Bs.', 'BsS', 'BsD', 'VES', 'bolívares', 'Bolivares']) {
      expect(canonCurrency(raw)).toBe('VES')
    }
  })
  it('mapea símbolos y alias de dólar/euro', () => {
    expect(canonCurrency('$')).toBe('USD')
    expect(canonCurrency('usd')).toBe('USD')
    expect(canonCurrency('€')).toBe('EUR')
    expect(canonCurrency('euros')).toBe('EUR')
  })
  it('desconocido → uppercase tal cual; vacío/null → null', () => {
    expect(canonCurrency('cop')).toBe('COP')
    expect(canonCurrency('  ')).toBeNull()
    expect(canonCurrency(null)).toBeNull()
  })
})

describe('currencySymbol', () => {
  it('símbolos conocidos y fallback al código', () => {
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('VES')).toBe('Bs')
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('COP')).toBe('COP')
    expect(currencySymbol(null)).toBe('$')
  })
})

describe('toUSD', () => {
  it('divide por la tasa en precisión completa', () => {
    expect(toUSD(2251.29, 143.5)).toBeCloseTo(15.688432, 5)
    expect(toUSD(10, 1)).toBe(10)
  })
  it('tasa inválida → null (nunca inventar dinero)', () => {
    expect(toUSD(100, 0)).toBeNull()
    expect(toUSD(100, -5)).toBeNull()
    expect(toUSD(100, NaN)).toBeNull()
  })
})
