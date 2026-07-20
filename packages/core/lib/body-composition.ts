import type { Sex } from '../types'
import { normalizeHeightCm } from './bmi'

export type BodyFatCategoryKey = 'bfEssential' | 'bfAthletic' | 'bfFit' | 'bfAverage' | 'bfObese'

const CM_PER_INCH = 2.54

export interface NavyBodyFatInput {
  sex: Sex
  heightCm: number
  waistCm: number
  neckCm: number
  /** Requerido solo para mujeres (la fórmula femenina incluye cadera). */
  hipsCm?: number | null
}

/**
 * % de grasa corporal estimado por el método US Navy (circunferencias),
 * redondeado a 1 decimal. Las fórmulas del spec usan PULGADAS
 * (docs/specs/welmi-analysis-body-composition.md) — aquí se convierte desde cm;
 * usar cm directamente sesgaría el resultado ~6.5 puntos.
 *
 * - Hombres: 86.010·log10(cintura−cuello) − 70.041·log10(altura) + 36.76
 * - Mujeres: 163.205·log10(cintura+cadera−cuello) − 97.684·log10(altura) − 78.387
 *
 * Returns null cuando faltan datos, los inputs salen de rangos plausibles
 * (cintura 30–300 cm, cuello 15–80 cm, cadera 30–300 cm, altura 80–272 cm),
 * la diferencia de circunferencias no es positiva (log indefinido) o el
 * resultado cae fuera de 2–60%.
 */
export function estimateBodyFatNavy({ sex, heightCm, waistCm, neckCm, hipsCm }: NavyBodyFatInput): number | null {
  if (!heightCm || !waistCm || !neckCm) return null
  const h = normalizeHeightCm(heightCm)
  if (h < 80 || h > 272 || waistCm < 30 || waistCm > 300 || neckCm < 15 || neckCm > 80) return null

  const heightIn = h / CM_PER_INCH
  let pct: number
  if (sex === 'female') {
    if (!hipsCm || hipsCm < 30 || hipsCm > 300) return null
    const girthIn = (waistCm + hipsCm - neckCm) / CM_PER_INCH
    if (girthIn <= 0) return null
    pct = 163.205 * Math.log10(girthIn) - 97.684 * Math.log10(heightIn) - 78.387
  } else {
    const girthIn = (waistCm - neckCm) / CM_PER_INCH
    if (girthIn <= 0) return null
    pct = 86.010 * Math.log10(girthIn) - 70.041 * Math.log10(heightIn) + 36.76
  }

  if (!Number.isFinite(pct) || pct < 2 || pct > 60) return null
  return Number(pct.toFixed(1))
}

/** Categorías ACE por sexo (los rangos saludables difieren entre hombres y mujeres). */
export function bodyFatCategoryKey(pct: number, sex: Sex): BodyFatCategoryKey {
  if (sex === 'female') {
    if (pct < 14) return 'bfEssential'
    if (pct < 21) return 'bfAthletic'
    if (pct < 25) return 'bfFit'
    if (pct < 32) return 'bfAverage'
    return 'bfObese'
  }
  if (pct < 6) return 'bfEssential'
  if (pct < 14) return 'bfAthletic'
  if (pct < 18) return 'bfFit'
  if (pct < 25) return 'bfAverage'
  return 'bfObese'
}

/** Tailwind/nativewind text color class for a body-fat category. */
export function bodyFatColorClass(key: BodyFatCategoryKey): string {
  if (key === 'bfObese') return 'text-red-500'
  if (key === 'bfAverage' || key === 'bfEssential') return 'text-amber-400'
  return 'text-emerald-500'
}

export interface BodyFatPoint {
  date: string // YYYY-MM-DD
  pct: number
}

/**
 * Serie temporal de BF% estimable a partir de una lista de medidas (cualquier
 * orden): solo entran los registros con cintura+cuello (+cadera si mujer) que
 * produzcan un estimado válido. Ordenada ascendente por fecha.
 */
export function bodyFatSeries(
  measurements: Array<{ date: string; waist?: number; neck?: number; hips?: number }>,
  profile: { sex?: Sex; heightCm?: number },
): BodyFatPoint[] {
  const { sex, heightCm } = profile
  if (!sex || !heightCm) return []
  const points: BodyFatPoint[] = []
  for (const m of measurements) {
    if (!m.date || !m.waist || !m.neck) continue
    const pct = estimateBodyFatNavy({ sex, heightCm, waistCm: m.waist, neckCm: m.neck, hipsCm: m.hips })
    if (pct != null) points.push({ date: m.date, pct })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

/** Masa magra estimada = peso − masa grasa, redondeada a 1 decimal. */
export function leanMassKg(weightKg: number | null, bodyFatPct: number | null): number | null {
  if (!weightKg || bodyFatPct == null) return null
  if (weightKg < 20 || weightKg > 400 || bodyFatPct < 0 || bodyFatPct >= 100) return null
  return Number((weightKg * (1 - bodyFatPct / 100)).toFixed(1))
}
