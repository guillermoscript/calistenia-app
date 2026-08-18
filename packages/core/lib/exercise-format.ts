// Formateo de campos de ejercicio compartido entre web y mobile. Vivía
// duplicado literalmente en los dos SessionView (#475).
import type { ExerciseTempo } from '../types'

/**
 * Convierte un tempo estructurado en una cadena compacta legible.
 * p. ej. `{ eccentric: 5, pauseTop: 2 }` → "baja 5s · pausa 2s arriba".
 * Devuelve null si no hay tempo o si todos sus campos están vacíos.
 */
export function formatTempo(tempo: ExerciseTempo | undefined): string | null {
  if (!tempo) return null
  const parts: string[] = []
  if (tempo.eccentric != null)   parts.push(`baja ${tempo.eccentric}s`)
  if (tempo.pauseBottom != null) parts.push(`pausa ${tempo.pauseBottom}s abajo`)
  if (tempo.concentric != null)  parts.push(tempo.concentric === 1 ? 'sube explosivo' : `sube ${tempo.concentric}s`)
  if (tempo.pauseTop != null)    parts.push(`pausa ${tempo.pauseTop}s arriba`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Reps por defecto del botón rápido: de un rango "8-12" se queda con el mínimo.
 * "12/lado", "máx" y demás se devuelven tal cual.
 */
export function quickReps(reps: string): string {
  return /^\d+-\d+$/.test(reps) ? reps.split('-')[0] : reps
}
