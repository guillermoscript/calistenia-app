/**
 * Checklist «Primeros pasos» — derivación pura del estado de los 6 ítems de
 * activación a partir de los outputs de los hooks de datos (issue #233).
 * La UI (GettingStartedCard en mobile, web en el futuro) solo pinta este estado.
 */

export type ChecklistItemId = 'program' | 'workout' | 'meal' | 'cardio' | 'photo' | 'friend'

export interface ChecklistInputs {
  hasActiveProgram: boolean
  totalSessions: number
  mealCount: number
  cardioCount: number
  photoCount: number
  followingCount: number
}

export interface ChecklistItem {
  id: ChecklistItemId
  done: boolean
}

export interface ChecklistState {
  items: ChecklistItem[]
  doneCount: number
  total: number
  allDone: boolean
}

/** Orden de presentación de los ítems (fijo). */
export const CHECKLIST_ITEM_IDS: readonly ChecklistItemId[] = [
  'program',
  'workout',
  'meal',
  'cardio',
  'photo',
  'friend',
]

export function deriveChecklist(i: ChecklistInputs): ChecklistState {
  // «Elige tu programa»: la matrícula actual (is_current) vuelve a null si el
  // usuario abandona el programa — un entreno completado también lo da por hecho.
  const done: Record<ChecklistItemId, boolean> = {
    program: i.hasActiveProgram || i.totalSessions > 0,
    workout: i.totalSessions > 0,
    meal: i.mealCount > 0,
    cardio: i.cardioCount > 0,
    photo: i.photoCount > 0,
    friend: i.followingCount > 0,
  }
  const items = CHECKLIST_ITEM_IDS.map(id => ({ id, done: done[id] }))
  const doneCount = items.filter(it => it.done).length
  return { items, doneCount, total: items.length, allDone: doneCount === items.length }
}

/** Clave de storage del descarte manual («Ocultar») por usuario y dispositivo. */
export const checklistDismissedKey = (userId: string): string =>
  `calistenia_mobile_checklist_dismissed_${userId}`

/** Clave de storage del auto-completado (los 6 hechos) por usuario y dispositivo. */
export const checklistCompletedKey = (userId: string): string =>
  `calistenia_mobile_checklist_completed_${userId}`
