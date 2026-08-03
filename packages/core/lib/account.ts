/**
 * Borrado de cuenta autoservicio (issue #300).
 *
 * Google Play exige que cualquier app que permita crear una cuenta ofrezca una
 * vía de baja iniciable desde dentro de la propia app. Este módulo se queda en
 * lo puro a propósito —no importa PocketBase— para que los diálogos de web y
 * móvil puedan usarlo sin arrastrar el singleton `pb` a sus tests. El borrado y
 * el barrido de sesión están en `hooks/useDeleteAccount`.
 */

/**
 * ¿Coincide lo escrito con el email de la cuenta?
 *
 * Se exige escribir el email entero (no un "¿seguro?") porque la acción es
 * irreversible. Se comparan sin espacios alrededor y sin distinguir mayúsculas:
 * el email de PocketBase ya es insensible a mayúsculas, y castigar un
 * autocompletado con mayúscula inicial no protege de nada.
 */
export function matchesAccountEmail(input: string, email: string | null | undefined): boolean {
  if (!email) return false
  return input.trim().toLowerCase() === email.trim().toLowerCase()
}
