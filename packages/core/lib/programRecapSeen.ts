/**
 * La pantalla de cierre (#941) se abre sola UNA vez por inscripción: la
 * primera vez que el inicio enseña «programa terminado». Después solo desde
 * «Tu resumen del programa». Marca local por dispositivo, como los tours: verla
 * en el móvil no la oculta en la web, y está bien así.
 */

import { storage } from '../platform'

import { normalizeCycle } from './programCycle'

/**
 * Por inscripción Y vuelta (#939): repetir reabre la MISMA inscripción, y el
 * resumen de la vuelta 2 también tiene que abrirse solo. La vuelta 1 conserva la
 * clave de siempre para no reabrir resúmenes ya vistos.
 */
const key = (enrollmentId: string, cycle?: number | null) => {
  const c = normalizeCycle(cycle)
  return `calistenia_program_recap_seen_${enrollmentId}${c > 1 ? `_c${c}` : ''}`
}

export function hasSeenProgramRecap(enrollmentId: string | null | undefined, cycle?: number | null): boolean {
  if (!enrollmentId) return true
  try {
    return storage.getItem(key(enrollmentId, cycle)) === 'true'
  } catch {
    // Sin storage no se puede recordar: mejor no abrirla sola en cada visita.
    return true
  }
}

export function markProgramRecapSeen(enrollmentId: string | null | undefined, cycle?: number | null): void {
  if (!enrollmentId) return
  try {
    storage.setItem(key(enrollmentId, cycle), 'true')
  } catch {
    // Sin storage, nada que guardar.
  }
}
