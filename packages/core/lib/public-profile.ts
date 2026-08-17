/**
 * Lógica pura del perfil público (#473).
 *
 * El perfil público de web (`UserProfilePage`) y el de móvil (`u/[id].tsx`)
 * pedían exactamente los mismos datos con dos copias del mismo `useEffect`.
 * Aquí vive todo lo que se puede decidir sin red, para que `usePublicProfile`
 * quede reducido a las consultas y estas funciones se puedan testear en node
 * (los tests de `packages/core` no montan hooks).
 *
 * Nada de esto localiza texto: los títulos y notas salen como
 * `TranslatableField` y quien pinta decide el idioma. Localizar aquí obligaba a
 * meter `l` en las dependencias del efecto, y cambiar de idioma refetcheaba las
 * cinco consultas del perfil.
 */

import { utcToLocalDateStr } from './dateUtils'
import { NO_PHASE, sessionKeyLabel, sessionKeyParts } from './session-key'
import { WORKOUTS } from '../data/workouts'
import type { TranslatableField } from './i18n-db'

/** Fila de la view `public_sessions` tal como llega de PocketBase. */
export interface PublicSessionRow {
  id: string
  workout_key?: string
  phase?: number | null
  completed_at?: string
  created?: string
  note?: TranslatableField | null
}

/** Fila de la view `public_user_stats`. */
export interface PublicUserStatsRow {
  total_sessions?: number
  workout_streak_best?: number
  workout_streak_current?: number
  level?: number
  xp?: number
}

/** Fila de la view `public_prs` (PRs + fase actual del usuario). */
export interface PublicPrsRow {
  phase?: number
  pr_pullups?: number
  pr_pushups?: number
  pr_lsit?: number
  pr_pistol?: number
  pr_handstand?: number
}

export interface ProfilePRs {
  pr_pullups: number
  pr_pushups: number
  pr_lsit: number
  pr_pistol: number
  pr_handstand: number
}

export interface ProfileRecentSession {
  id: string
  workoutKey: string
  /** Crudo a propósito: lo localiza quien lo pinta. */
  workoutTitle: TranslatableField
  /** 1-4 en sesiones de programa; `NO_PHASE` (0) en sesiones libres (#376). */
  phase: number
  completedAt: string
  note: TranslatableField
}

export interface PublicProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  /** Solo lo pinta web; móvil lo ignora. */
  email: string
  memberSince: string
  totalSessions: number
  bestStreak: number
  currentStreak: number
  level: number
  /** Solo lo pinta web. */
  xp: number
  phase: number
  prs: ProfilePRs
  /** Un booleano por cada día del mes en curso: hubo sesión o no. */
  monthActivity: Record<string, boolean>
  recentSessions: ProfileRecentSession[]
  activeProgram: { id: string; name: TranslatableField } | null
}

/** Número de sesiones recientes que pintan las dos pantallas. */
export const RECENT_SESSIONS_LIMIT = 10

/** Días que tiene un mes `YYYY-MM`. */
export function daysInMonth(yearMonth: string): number {
  const year = parseInt(yearMonth.slice(0, 4), 10)
  const month = parseInt(yearMonth.slice(5, 7), 10)
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(year, month, 0).getDate()
}

/**
 * Calendario denso del mes: **todos** los días a `false` y luego a `true` los
 * que tienen sesión. Denso y no disperso porque la cuadrícula pinta el mes
 * entero, incluidos los huecos.
 *
 * El día se deriva con `utcToLocalDateStr`, así que una sesión cerrada de noche
 * cae en el día local del usuario y no en el UTC.
 */
export function buildMonthActivity(
  yearMonth: string,
  sessions: PublicSessionRow[],
): Record<string, boolean> {
  const activity: Record<string, boolean> = {}
  const total = daysInMonth(yearMonth)
  for (let d = 1; d <= total; d++) {
    activity[`${yearMonth}-${String(d).padStart(2, '0')}`] = false
  }

  sessions.forEach(s => {
    const raw = s.completed_at || s.created
    if (!raw) return
    const date = utcToLocalDateStr(raw)
    // Solo marca días de ESTE mes: la consulta pide desde el día 1, pero una
    // sesión del último día del mes anterior puede colarse por zona horaria.
    if (date && Object.prototype.hasOwnProperty.call(activity, date)) {
      activity[date] = true
    }
  })

  return activity
}

/**
 * Últimas sesiones para la lista del perfil, más recientes primero.
 *
 * Reordena en cliente aunque la consulta ya pide `sort: '-completed_at'`: hay
 * sesiones antiguas sin `completed_at` que caen a `created`, y ese fallback el
 * servidor no lo ordena.
 */
export function mapRecentSessions(
  sessions: PublicSessionRow[],
  limit: number = RECENT_SESSIONS_LIMIT,
): ProfileRecentSession[] {
  return sessions
    .filter(s => s.completed_at || s.created)
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.created || 0).getTime() -
        new Date(a.completed_at || a.created || 0).getTime(),
    )
    .slice(0, limit)
    .map(s => {
      const workoutKey = s.workout_key || ''
      const workout = WORKOUTS[workoutKey]
      const { isFree } = sessionKeyParts(workoutKey)
      return {
        id: s.id,
        workoutKey,
        // Sin el fallback, una sesión libre se pintaría con su clave cruda
        // (`free_1783000000`) como título (#376).
        workoutTitle: workout?.title || sessionKeyLabel(workoutKey) || 'Sesión',
        // `?? 1` y no `|| 1`: el 0 de una sesión libre es legítimo y no debe
        // degradarse a "Fase 1".
        phase: isFree ? NO_PHASE : (s.phase ?? 1),
        completedAt: s.completed_at || s.created || '',
        note: s.note || '',
      }
    })
}

/** Nombre visible con los mismos fallbacks que usaban ambas pantallas. */
export function profileDisplayName(user: { display_name?: string; email?: string }): string {
  return user.display_name || user.email?.split('@')[0] || ''
}

/** PRs con ceros por defecto: `public_prs` puede no tener fila todavía. */
export function mapProfilePRs(row: PublicPrsRow): ProfilePRs {
  return {
    pr_pullups: row.pr_pullups || 0,
    pr_pushups: row.pr_pushups || 0,
    pr_lsit: row.pr_lsit || 0,
    pr_pistol: row.pr_pistol || 0,
    pr_handstand: row.pr_handstand || 0,
  }
}
