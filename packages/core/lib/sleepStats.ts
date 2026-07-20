/**
 * sleepStats.ts — helpers puros de agregación de sueño compartidos por
 * buildInsightContext.ts (F2 #244: enriquecer InsightSummary.sleep con
 * awakenings/caffeine/screen/stress/bedtime-consistency). Sin dependencias de
 * PB ni React — testeables con arrays hechos a mano.
 *
 * mcp-server/src/api/insight-context-server.ts NO puede importar este paquete
 * (evita el cross-package import, ver comentario en ese archivo) y por tanto
 * mantiene una copia inline verbatim de estas mismas funciones — si cambias
 * la lógica aquí, replícala allí.
 */

/**
 * Convierte un bedtime "HH:MM" a minutos desde medianoche, tratando las horas
 * de madrugada (0-11) como "día siguiente" (ej. "01:00" -> 25*60) para que una
 * mezcla de bedtimes tipo 23:30 y 00:45 no vea una dispersión espuria de ~23h.
 * Devuelve null si el string no tiene forma "HH:MM" parseable.
 */
export function bedtimeToMinutes(bedtime: string): number | null {
  const parts = (bedtime || '').split(':').map(Number)
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null
  const [h, m] = parts
  return h < 12 ? (h + 24) * 60 + m : h * 60 + m
}

/**
 * Desviación estándar (poblacional, /n) en minutos de un conjunto de bedtimes
 * "HH:MM". Con 0 o 1 muestra válida no hay dispersión que calcular -> 0.
 */
export function bedtimeConsistencyMinutes(bedtimes: string[]): number {
  const minutes = bedtimes.map(bedtimeToMinutes).filter((n): n is number => n !== null)
  if (minutes.length < 2) return 0
  const mean = minutes.reduce((s, v) => s + v, 0) / minutes.length
  const variance = minutes.reduce((s, v) => s + (v - mean) ** 2, 0) / minutes.length
  return Math.round(Math.sqrt(variance) * 10) / 10
}

/**
 * Porcentaje (0-100) de flags booleanos en `true`, ignorando entradas
 * `undefined` (días sin ese dato). Sin entradas definidas -> 0.
 */
export function pctTrue(flags: Array<boolean | undefined>): number {
  const defined = flags.filter((f): f is boolean => f !== undefined)
  if (defined.length === 0) return 0
  const trueCount = defined.filter(Boolean).length
  return Math.round((trueCount / defined.length) * 100)
}

/**
 * Media de valores numéricos, ignorando entradas `undefined`. Sin entradas
 * definidas -> 0 (no `null`, para que encaje directo en un campo `number`).
 */
export function avgDefined(values: Array<number | undefined>): number {
  const defined = values.filter((v): v is number => v !== undefined)
  if (defined.length === 0) return 0
  return Math.round((defined.reduce((s, v) => s + v, 0) / defined.length) * 10) / 10
}
