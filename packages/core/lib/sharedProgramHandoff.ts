/**
 * Lleva el programa compartido al otro lado del registro (#604).
 *
 * El embudo que abre la landing pública es: alguien recibe un enlace, ve el
 * programa sin tener cuenta, pulsa «Crear cuenta para usar este programa» y
 * vuelve… al dashboard, sin ni rastro del programa que venía a ver. El issue
 * daba por hecho que existía un `postLoginRedirect` en `App.tsx` que resolvía
 * esto; no existe. El `onLogin` de la landing es `goToAuth`, que navega a
 * `/auth` y nada más.
 *
 * Mismo mecanismo que `battleInviteHandoff.ts` (#356), con una diferencia
 * importante: aquí lo que se guarda NO es una credencial. Es un id de programa
 * que ya era público —cualquiera con el enlace lo tiene— así que no hace falta
 * tratarlo como un secreto. Lo que sí se conserva es la lectura de un solo uso:
 * un id que se quedara guardado secuestraría el siguiente arranque de la app,
 * mandando a esa persona a un programa que abrió hace semanas.
 */
import { storage } from '../platform'

const PENDING_SHARED_PROGRAM_KEY = 'calistenia_pending_shared_program'

/** Guarda el programa que se estaba viendo antes de mandar a registrarse. */
export function capturePendingSharedProgram(programId: string): void {
  if (!programId) return
  storage.setItem(PENDING_SHARED_PROGRAM_KEY, programId)
}

/**
 * Lee y borra el programa pendiente. De un solo uso a propósito: si no se
 * borrara, el siguiente arranque volvería a redirigir ahí.
 */
export function consumePendingSharedProgram(): string | null {
  const programId = storage.getItem(PENDING_SHARED_PROGRAM_KEY)
  if (programId) storage.removeItem(PENDING_SHARED_PROGRAM_KEY)
  return programId
}

/** Descarta el pendiente sin consumirlo (al cerrar sesión, por ejemplo). */
export function clearPendingSharedProgram(): void {
  storage.removeItem(PENDING_SHARED_PROGRAM_KEY)
}
