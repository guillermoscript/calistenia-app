/**
 * Qué día mostrar por defecto en la pantalla de entreno (#574).
 *
 * En web `/workout` sin `?day=` arrancaba vacío y los usuarios nuevos nunca
 * llegaban a un entreno. El móvil ya autoselecciona hoy; esto unifica la regla:
 * hoy si tiene algo que hacer, si no el siguiente día con contenido.
 */
import type { DayId, WeekDay } from '../types'

export const WEEK_ORDER: readonly DayId[] = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']

/** Índice `getDay()` (0 = domingo) → DayId. */
export const DAY_BY_INDEX: readonly DayId[] = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab']

export function isTrainableDay(day: WeekDay | undefined): boolean {
  return !!day && day.type !== 'rest'
}

/**
 * Primer día entrenable a partir de `fromId` (sin incluirlo), dando la vuelta
 * a la semana. `null` si el programa no tiene ningún día entrenable.
 */
export function nextTrainingDay(weekDays: readonly WeekDay[], fromId: DayId): DayId | null {
  const start = WEEK_ORDER.indexOf(fromId)
  for (let i = 1; i <= WEEK_ORDER.length; i++) {
    const id = WEEK_ORDER[(start + i) % WEEK_ORDER.length]
    if (isTrainableDay(weekDays.find(d => d.id === id))) return id
  }
  return null
}

/**
 * Día a seleccionar por defecto: hoy si es entrenable; si no, el siguiente
 * entrenable. `null` si la semana no tiene nada que entrenar.
 */
export function pickTrainingDay(weekDays: readonly WeekDay[], todayId: DayId): DayId | null {
  if (isTrainableDay(weekDays.find(d => d.id === todayId))) return todayId
  return nextTrainingDay(weekDays, todayId)
}
