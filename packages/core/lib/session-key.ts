import { tr } from './i18n-safe'

/**
 * `workout_key` es la única cosa que distingue una sesión de programa de una
 * sesión libre, y la lógica para interpretarla estaba copiada en media docena
 * de sitios (hook de progreso, feed, perfiles públicos, historial). Este módulo
 * la centraliza para que el mapeo clave → `phase`/`day` sea testeable y no se
 * vuelva a desincronizar del esquema de PocketBase.
 *
 * Formas de clave:
 *   - `p<N>_<día>`   sesión de programa   → phase 1-4, day 'lun' | 'mar' | …
 *   - `free_<ts>`    sesión libre         → sin fase
 *   - `manual_<ts>`  entreno registrado a mano → sin fase
 */

/**
 * Valor de `sessions.phase` para una sesión sin fase (libre o manual).
 *
 * PocketBase trata el 0 de un campo numérico *required* como vacío, así que
 * este valor solo es aceptable con `phase` marcado como opcional — lo hace la
 * migración `1783100000_sessions_phase_optional.js`. Ver issue #376.
 */
export const NO_PHASE = 0

/** Sesiones fuera de programa: libres (`free_`) y manuales (`manual_`). */
export function isFreeSessionKey(workoutKey: string): boolean {
  return workoutKey.startsWith('free_') || workoutKey.startsWith('manual_')
}

const PROGRAM_KEY_RE = /^p(\d+)_(.+)$/

export interface SessionKeyParts {
  /** 1-4 para sesiones de programa; `NO_PHASE` (0) para libres/manuales. */
  phase: number
  /** Día del programa ('lun', 'mar', …); 'free' para libres/manuales. */
  day: string
  /** true si la sesión no pertenece a ningún programa. */
  isFree: boolean
}

/**
 * Deriva el `phase`/`day` que espera la colección `sessions` de PocketBase.
 *
 * Una clave irreconocible se trata como libre en lugar de producir un
 * `phase: NaN`: antes `parseInt('pX')` colaba un NaN en el payload y PocketBase
 * respondía 400 con el error tragado por un `catch`.
 */
export function sessionKeyParts(workoutKey: string): SessionKeyParts {
  if (isFreeSessionKey(workoutKey)) return { phase: NO_PHASE, day: 'free', isFree: true }

  const m = PROGRAM_KEY_RE.exec(workoutKey)
  if (!m) return { phase: NO_PHASE, day: 'free', isFree: true }

  const phase = parseInt(m[1], 10)
  if (!Number.isFinite(phase)) return { phase: NO_PHASE, day: 'free', isFree: true }

  return { phase, day: m[2], isFree: false }
}

/**
 * Etiqueta de una sesión cuyo `workout_key` no está en el catálogo `WORKOUTS`.
 * Sin esto, el feed y los perfiles públicos enseñarían la clave cruda
 * (`free_1783000000`) en cuanto las sesiones libres empezaran a persistirse.
 *
 * Devuelve SIEMPRE una cadena no vacía: con `i18n.t()` a pelo, la copia sin
 * inicializar de i18next que ve core en la web devolvía `undefined` y el muro
 * pintaba el título de toda sesión libre en blanco. Ver [[i18n-safe]].
 */
export function sessionKeyLabel(workoutKey: string): string {
  // Una fila sin `workout_key` (datos corruptos, import antiguo) no puede dejar
  // la tarjeta del muro sin título.
  if (!workoutKey) return tr('feed.workoutGeneric', 'Entrenamiento')
  if (isFreeSessionKey(workoutKey)) return tr('progress.freeSession', 'Sesión Libre')
  // Una clave de programa que no está en `WORKOUTS` (programa propio o de la
  // comunidad) al menos se humaniza: "Fase 2 · mié" en vez de `p2_mie`.
  const parts = sessionKeyParts(workoutKey)
  if (!parts.isFree) {
    const day = tr(`day.${parts.day}`, parts.day)
    return `${tr('session.phase', `Fase ${parts.phase}`, { phase: parts.phase })} · ${day}`
  }
  return workoutKey
}
