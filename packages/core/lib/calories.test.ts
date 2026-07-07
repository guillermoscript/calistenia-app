import { describe, it, expect } from 'vitest'
import { estimateCalories } from './calories'

describe('estimateCalories', () => {
  it('running 1h a 70kg (peso por defecto) → MET 9.8 × 70 × 1', () => {
    expect(estimateCalories('running', 3600)).toBe(686)
  })

  it('walking 30min a 80kg → MET 3.8 × 80 × 0.5', () => {
    expect(estimateCalories('walking', 1800, 80)).toBe(152)
  })

  it('cycling 1h a 60kg → MET 7.5 × 60 × 1', () => {
    expect(estimateCalories('cycling', 3600, 60)).toBe(450)
  })

  it('duración 0 → 0 calorías', () => {
    expect(estimateCalories('running', 0, 70)).toBe(0)
  })

  it('redondea al entero más cercano', () => {
    // MET 9.8 × 65 × (900/3600=0.25) = 159.25 → 159
    expect(estimateCalories('running', 900, 65)).toBe(159)
  })

  it('activityType desconocido cae a running (9.8)', () => {
    expect(estimateCalories('swimming' as never, 3600, 70)).toBe(
      estimateCalories('running', 3600, 70),
    )
  })

  it('un peso no válido (0, negativo, NaN) se trata como "no configurado" → default 70kg', () => {
    // Intencional: 0 kg no es un peso corporal posible, así que no produce 0 kcal.
    expect(estimateCalories('running', 3600, 0)).toBe(686)
    expect(estimateCalories('running', 3600, -5)).toBe(686)
    expect(estimateCalories('running', 3600, NaN)).toBe(686)
  })

  it('weightKg undefined usa el peso por defecto (70kg)', () => {
    expect(estimateCalories('cycling', 3600)).toBe(estimateCalories('cycling', 3600, 70))
  })
})
