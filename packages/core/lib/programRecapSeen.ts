/**
 * La pantalla de cierre (#941) se abre sola UNA vez por inscripción: la
 * primera vez que el inicio enseña «programa terminado». Después solo desde
 * «Tu resumen del programa». Marca local por dispositivo, como los tours: verla
 * en el móvil no la oculta en la web, y está bien así.
 */

import { storage } from '../platform'

const key = (enrollmentId: string) => `calistenia_program_recap_seen_${enrollmentId}`

export function hasSeenProgramRecap(enrollmentId: string | null | undefined): boolean {
  if (!enrollmentId) return true
  try {
    return storage.getItem(key(enrollmentId)) === 'true'
  } catch {
    // Sin storage no se puede recordar: mejor no abrirla sola en cada visita.
    return true
  }
}

export function markProgramRecapSeen(enrollmentId: string | null | undefined): void {
  if (!enrollmentId) return
  try {
    storage.setItem(key(enrollmentId), 'true')
  } catch {
    // Sin storage, nada que guardar.
  }
}
