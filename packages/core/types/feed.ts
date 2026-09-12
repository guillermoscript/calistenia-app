/**
 * Contrato del muro de actividad.
 *
 * Un `FeedItem` es la unidad que pintan las dos apps. Vive aquí y no dentro del
 * hook porque lo consumen tres capas independientes: `useActivityFeed` (lo
 * produce desde PocketBase), `describeFeedItem` (lo convierte en texto) y las
 * tarjetas de web y móvil (lo pintan). Tenerlo en un sitio evita que una fuente
 * nueva se añada al hook y se olvide en la tarjeta.
 *
 * El discriminante es `type`. Cada tipo trae su propio bloque opcional con lo
 * que solo tiene sentido para él; los campos comunes (autor, fecha, nota) están
 * en la raíz para que la cabecera de la tarjeta sea la misma en todos.
 */

import type { TranslatableField } from '../lib/i18n-db'

/** Fuentes de actividad que el muro sabe pintar. */
export const FEED_ITEM_TYPES = ['workout', 'cardio', 'circuit', 'challenge', 'race', 'battle'] as const

export type FeedItemType = typeof FEED_ITEM_TYPES[number]

/** Métricas de una sesión de cardio (`public_cardio_sessions`). */
export interface FeedCardioMeta {
  activityType: string
  distanceKm: number | null
  durationSeconds: number | null
  avgPace: number | null
}

/** Métricas de un circuito cerrado (`public_circuit_sessions`). */
export interface FeedCircuitMeta {
  /** Nombre localizable tal cual lo guarda la colección (`{es, en}`). */
  name: TranslatableField | null
  mode: string
  roundsCompleted: number
  roundsTarget: number
  durationSeconds: number | null
}

/** Reto al que alguien se apuntó o que alguien creó. */
export interface FeedChallengeMeta {
  challengeId: string
  title: string
  /** `challenges.metric`, ya resuelto a etiqueta legible por el hook. */
  metricLabel: string
  goal: number
  startsAt: string
  endsAt: string
  status: string
  /** Qué hizo el usuario con el reto. */
  role: 'joined' | 'created'
}

/** Participación en una carrera GPS (`race_participants` + `races`). */
export interface FeedRaceMeta {
  raceId: string
  name: string
  activityType: string
  /** `joined` mientras no ha corrido; `finished` cuando cruzó la meta. */
  status: string
  targetDistanceKm: number | null
  distanceKm: number | null
  durationSeconds: number | null
  avgPace: number | null
  /** Puesto final, 1-based. `null` si la carrera aún no lo ha resuelto. */
  rank: number | null
  totalParticipants: number
}

/** Resultado de una batalla cerrada (`public_battle_finishes`). */
export interface FeedBattleMeta {
  battleId: string
  /** `config.workout_template_id`, la clave del preset de batalla. */
  templateId: string
  /** Puesto con empates ya resueltos (ver `battleDisplayRanks`, #453). */
  rank: number | null
  totalParticipants: number
  outcome: 'won' | 'lost' | 'unknown'
  /** true si el usuario que mira participó: solo entonces puede abrir el detalle. */
  viewerTookPart: boolean
}

export interface FeedItem {
  id: string
  type: FeedItemType
  userId: string
  displayName: string
  avatarUrl: string | null
  /**
   * Marca temporal ordenable. Cada fuente aporta la suya (`completed_at`,
   * `finished_at`, `created`…) ya normalizada a ISO con `T`, para que el merge
   * cronológico compare manzanas con manzanas.
   */
  completedAt: string
  date: string
  /** Cadena cruda de la fuente, en el formato EXACTO de su columna. Es el cursor
   *  de paginación: compararla contra la columna es lo único fiable cuando unas
   *  guardan `2026-08-09 16:58:12.000Z` y otras `2026-08-09T16:58:12Z`. */
  cursor: string

  // — sesiones de fuerza (type === 'workout') —
  workoutKey: string
  workoutTitle: string
  /**
   * 1-4 para sesiones de programa. `NO_PHASE` (0) cuando la actividad no tiene
   * fase: todo lo que no es una sesión de programa. Quien lo pinte debe ocultar
   * la etiqueta "Fase" en ese caso.
   */
  phase: number
  /** Nombres de los ejercicios, de `sessions.exercise_timings`. Vacío si la
   *  sesión no cronometró ejercicios (sesiones antiguas, registro manual). */
  exerciseNames: string[]
  /** Duración total en segundos, cuando la fuente la trae. */
  durationSeconds: number | null

  note: string

  cardio?: FeedCardioMeta
  circuit?: FeedCircuitMeta
  challenge?: FeedChallengeMeta
  race?: FeedRaceMeta
  battle?: FeedBattleMeta
}
