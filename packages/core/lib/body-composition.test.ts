import { describe, it, expect } from 'vitest'
import { estimateBodyFatNavy, bodyFatCategoryKey, bodyFatColorClass, bodyFatSeries, leanMassKg } from './body-composition'

describe('estimateBodyFatNavy', () => {
  // Referencia hombre: 70in altura, 33.5in cintura, 15in cuello →
  // 86.010·log10(18.5) − 70.041·log10(70) + 36.76 ≈ 16.5
  it('calcula BF% hombre con valores de referencia (en cm)', () => {
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 177.8, waistCm: 85.09, neckCm: 38.1 })).toBe(16.5)
  })

  // Referencia mujer: 64in altura, 30in cintura, 38in cadera, 13in cuello →
  // 163.205·log10(55) − 97.684·log10(64) − 78.387 ≈ 29.2
  it('calcula BF% mujer con valores de referencia (en cm)', () => {
    expect(estimateBodyFatNavy({ sex: 'female', heightCm: 162.56, waistCm: 76.2, neckCm: 33.02, hipsCm: 96.52 })).toBe(29.2)
  })

  it('usar cm sin convertir sesgaría el resultado — la conversión a pulgadas es interna', () => {
    // Mismo hombre de referencia expresado en pulgadas directamente daría lo mismo
    // solo si la función convirtiera; verificamos que NO acepta valores en pulgadas
    // como si fueran cm (33.5 "cm" de cintura queda fuera de rango plausible → null).
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 70, waistCm: 33.5, neckCm: 15 })).toBeNull()
  })

  it('normaliza altura en metros', () => {
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 1.778, waistCm: 85.09, neckCm: 38.1 })).toBe(16.5)
  })

  it('mujer sin cadera → null (la fórmula femenina la requiere)', () => {
    expect(estimateBodyFatNavy({ sex: 'female', heightCm: 162.56, waistCm: 76.2, neckCm: 33.02 })).toBeNull()
    expect(estimateBodyFatNavy({ sex: 'female', heightCm: 162.56, waistCm: 76.2, neckCm: 33.02, hipsCm: null })).toBeNull()
  })

  it('cintura ≤ cuello → null (log indefinido)', () => {
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 177.8, waistCm: 38, neckCm: 38.1 })).toBeNull()
  })

  it('inputs faltantes o fuera de rango → null', () => {
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 0, waistCm: 85, neckCm: 38 })).toBeNull()
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 177.8, waistCm: 0, neckCm: 38 })).toBeNull()
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 177.8, waistCm: 85, neckCm: 0 })).toBeNull()
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 177.8, waistCm: 85, neckCm: 10 })).toBeNull() // cuello < 15
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 300, waistCm: 85, neckCm: 38 })).toBeNull() // altura > 272
    expect(estimateBodyFatNavy({ sex: 'female', heightCm: 162, waistCm: 76, neckCm: 33, hipsCm: 400 })).toBeNull()
  })

  it('resultado implausible (fuera de 2–60%) → null', () => {
    // Diferencia cintura−cuello mínima → girth diminuto → log10 muy negativo → pct < 2
    expect(estimateBodyFatNavy({ sex: 'male', heightCm: 177.8, waistCm: 40, neckCm: 39.5 })).toBeNull()
  })
})

describe('bodyFatCategoryKey', () => {
  it('umbrales ACE hombre', () => {
    expect(bodyFatCategoryKey(4, 'male')).toBe('bfEssential')
    expect(bodyFatCategoryKey(6, 'male')).toBe('bfAthletic')
    expect(bodyFatCategoryKey(13.9, 'male')).toBe('bfAthletic')
    expect(bodyFatCategoryKey(14, 'male')).toBe('bfFit')
    expect(bodyFatCategoryKey(18, 'male')).toBe('bfAverage')
    expect(bodyFatCategoryKey(25, 'male')).toBe('bfObese')
  })

  it('umbrales ACE mujer (desplazados respecto al hombre)', () => {
    expect(bodyFatCategoryKey(12, 'female')).toBe('bfEssential')
    expect(bodyFatCategoryKey(14, 'female')).toBe('bfAthletic')
    expect(bodyFatCategoryKey(21, 'female')).toBe('bfFit')
    expect(bodyFatCategoryKey(25, 'female')).toBe('bfAverage')
    expect(bodyFatCategoryKey(32, 'female')).toBe('bfObese')
  })
})

describe('bodyFatColorClass', () => {
  it('mapea categorías a clases de color', () => {
    expect(bodyFatColorClass('bfAthletic')).toBe('text-emerald-500')
    expect(bodyFatColorClass('bfFit')).toBe('text-emerald-500')
    expect(bodyFatColorClass('bfEssential')).toBe('text-amber-400')
    expect(bodyFatColorClass('bfAverage')).toBe('text-amber-400')
    expect(bodyFatColorClass('bfObese')).toBe('text-red-500')
  })
})

describe('bodyFatSeries', () => {
  const profile = { sex: 'male' as const, heightCm: 177.8 }

  it('filtra registros sin cintura o cuello y ordena ascendente por fecha', () => {
    const series = bodyFatSeries(
      [
        { date: '2026-07-15', waist: 85.09, neck: 38.1 },
        { date: '2026-07-01', waist: 90, neck: 38.1 },
        { date: '2026-07-10', waist: 88 }, // sin cuello → fuera
      ],
      profile,
    )
    expect(series.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-15'])
    expect(series[1].pct).toBe(16.5)
  })

  it('sin sexo o altura → serie vacía', () => {
    expect(bodyFatSeries([{ date: '2026-07-15', waist: 85, neck: 38 }], { heightCm: 177.8 })).toEqual([])
    expect(bodyFatSeries([{ date: '2026-07-15', waist: 85, neck: 38 }], { sex: 'male' })).toEqual([])
  })

  it('mujer sin cadera en el registro → ese punto queda fuera', () => {
    const series = bodyFatSeries(
      [
        { date: '2026-07-01', waist: 76.2, neck: 33.02 },
        { date: '2026-07-15', waist: 76.2, neck: 33.02, hips: 96.52 },
      ],
      { sex: 'female', heightCm: 162.56 },
    )
    expect(series).toEqual([{ date: '2026-07-15', pct: 29.2 }])
  })
})

describe('leanMassKg', () => {
  it('peso − masa grasa, 1 decimal', () => {
    expect(leanMassKg(80, 20)).toBe(64)
    expect(leanMassKg(72.5, 16.5)).toBe(60.5)
  })

  it('inputs inválidos → null', () => {
    expect(leanMassKg(null, 20)).toBeNull()
    expect(leanMassKg(80, null)).toBeNull()
    expect(leanMassKg(10, 20)).toBeNull()
    expect(leanMassKg(80, 100)).toBeNull()
  })
})
