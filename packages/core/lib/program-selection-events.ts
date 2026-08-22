/**
 * Qué eventos de analytics emite `selectProgram` (#579).
 *
 * Antes se emitía `program_selected` en cada toque de la tarjeta (aunque el
 * programa ya fuera el activo) y `program_joined` cada vez que se re-activaba un
 * enrollment existente, así que OpenPanel contaba 6 y 3 por usuario sin
 * indecisión real. Función pura para poder testearla desde core (node).
 *
 * - `selected`: solo cuando el programa activo cambia de verdad.
 * - `joined`: solo cuando se crea el `user_programs` (primer enrollment).
 */
export interface ExistingEnrollmentLike {
  is_current?: boolean | null
}

export function programSelectionEvents(existing: ExistingEnrollmentLike | null | undefined): {
  selected: boolean
  joined: boolean
} {
  if (!existing) return { selected: true, joined: true }
  return { selected: existing.is_current !== true, joined: false }
}
