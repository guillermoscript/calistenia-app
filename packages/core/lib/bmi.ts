export type BmiCategoryKey = 'bmiUnderweight' | 'bmiNormal' | 'bmiOverweight' | 'bmiObese'

/** Parse a user-typed decimal accepting comma or dot separator. Returns null for empty/invalid input. */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null
  const s = input.trim().replace(',', '.')
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Users sometimes type height in meters (1.75). Values under 3 are treated as meters and converted to cm. */
export function normalizeHeightCm(height: number): number {
  return height > 0 && height < 3 ? height * 100 : height
}

/** BMI = kg / m², rounded to 1 decimal. Returns null when inputs are missing or outside plausible human ranges (weight 20–400 kg, height 80–272 cm). */
export function calculateBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null
  const h = normalizeHeightCm(heightCm)
  if (weightKg < 20 || weightKg > 400 || h < 80 || h > 272) return null
  const m = h / 100
  return Number((weightKg / (m * m)).toFixed(1))
}

export function bmiCategoryKey(v: number): BmiCategoryKey {
  if (v < 18.5) return 'bmiUnderweight'
  if (v < 25) return 'bmiNormal'
  if (v < 30) return 'bmiOverweight'
  return 'bmiObese'
}

/** Tailwind/nativewind text color class for a BMI value. */
export function bmiColorClass(v: number): string {
  if (v < 18.5 || (v >= 25 && v < 30)) return 'text-amber-400'
  if (v >= 30) return 'text-red-500'
  return 'text-emerald-500'
}

export type WhtrCategoryKey = 'whtrHealthy' | 'whtrIncreased' | 'whtrHigh'

/**
 * WHtR = cintura / altura (ratio cintura-altura), rounded to 2 decimals.
 * Returns null when inputs are missing or outside plausible ranges
 * (waist 30–300 cm, height 80–272 cm). Height under 3 is treated as meters.
 */
export function calculateWhtr(waistCm: number | null, heightCm: number | null): number | null {
  if (!waistCm || !heightCm) return null
  const h = normalizeHeightCm(heightCm)
  if (waistCm < 30 || waistCm > 300 || h < 80 || h > 272) return null
  return Number((waistCm / h).toFixed(2))
}

/** <0.5 saludable, 0.5–0.6 riesgo aumentado, >0.6 riesgo alto. */
export function whtrCategoryKey(v: number): WhtrCategoryKey {
  if (v < 0.5) return 'whtrHealthy'
  if (v <= 0.6) return 'whtrIncreased'
  return 'whtrHigh'
}

/** Tailwind/nativewind text color class for a WHtR value. */
export function whtrColorClass(v: number): string {
  if (v < 0.5) return 'text-emerald-500'
  if (v <= 0.6) return 'text-amber-400'
  return 'text-red-500'
}
