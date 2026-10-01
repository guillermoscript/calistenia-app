/**
 * Gente activa para seguir (#806, épica #795): lógica pura.
 *
 * Quien no conoce a nadie en la app no tiene a quién buscar por nombre. La
 * lista sale de `public_user_stats` ordenada por `last_workout_date` (un día
 * `YYYY-MM-DD`, así que ordena como texto) y se cruza con `users` para el
 * nombre y el avatar. Todo lo decidible sin red vive aquí para testearlo en
 * node (core no renderiza hooks): `useSuggestedUsers` solo hace las consultas.
 *
 * PRIVACIDAD
 * ----------
 * - Las views `public_*` ya devuelven 0 filas de una cuenta privada que no
 *   sigues y de quien te ha bloqueado o has bloqueado (#422). Aun así se
 *   filtra aquí `is_private` y los bloqueos: `is_private` sí llega al cliente
 *   (lista blanca de `users_field_privacy.pb.js`) y no se confía en una sola
 *   capa para no sugerir una cuenta privada.
 * - El nombre sale de `authorDisplayName` (#892): display_name → name, nunca el
 *   email.
 * - Con `is_private` desconocido (campo ausente) se trata como PÚBLICA, igual
 *   que las reglas del servidor (`!= true`).
 */
import { authorDisplayName, type AuthorLike } from './author-name'
import { CANONICAL_ANALYTICS_EVENTS, trackCanonicalEvent } from './analytics'

/** Cuántas sugerencias enseña la pantalla de Amigos. */
export const SUGGESTED_USERS_LIMIT = 12
/** Cuántas enseña el vacío del ranking. */
export const SUGGESTED_USERS_LEADERBOARD_LIMIT = 4
/** «Activo» = entrenó en los últimos N días. */
export const SUGGESTED_USERS_ACTIVE_DAYS = 30
/** Filas pedidas a la view: de más, porque luego se filtra en cliente. */
export const SUGGESTED_USERS_FETCH = 60
/** Con tantos seguidos ya no es «sin amigos»: la sección de Amigos se oculta. */
export const SUGGESTED_USERS_MAX_FOLLOWING = 3

/** Fila de `public_user_stats` con lo que usa la lista. */
export interface SuggestionStatsRow {
  user?: string
  total_sessions?: number
  workout_streak_current?: number
  last_workout_date?: string
}

/** Fila de `users` ya recortada por #411. */
export interface SuggestionUserRow extends AuthorLike {
  id: string
  username?: string
  is_private?: boolean
}

export interface SuggestedUser {
  id: string
  displayName: string
  username: string
  /** Lo rellena el hook (necesita `pb`); la lógica pura lo deja en null. */
  avatarUrl: string | null
  totalSessions: number
  currentStreak: number
  /** `YYYY-MM-DD`. */
  lastWorkoutDate: string
}

export interface BuildSuggestionsInput {
  stats: SuggestionStatsRow[]
  users: SuggestionUserRow[]
  selfId: string
  followingIds: Set<string>
  pendingOutgoingIds: Set<string>
  blockedIds: Set<string>
  /** `YYYY-MM-DD`: lo anterior a este día no cuenta como activo. */
  activeSince: string
  limit?: number
}

/** `YYYY-MM-DD` de hace `days` días respecto a `now` (hora local). */
export function activeSinceDay(now: Date, days: number = SUGGESTED_USERS_ACTIVE_DAYS): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Filtra, ordena y recorta. Excluye: uno mismo, a quien ya sigues, a quien ya
 * has solicitado, bloqueados, cuentas privadas, a quien no ha entrenado nunca
 * o no en `activeSince`, y a quien no tiene fila en `users` (borrada u oculta).
 * Orden: último entreno más reciente primero; desempata la racha y luego el id
 * para que el resultado sea estable.
 */
export function buildSuggestedUsers(input: BuildSuggestionsInput): SuggestedUser[] {
  const { stats, users, selfId, followingIds, pendingOutgoingIds, blockedIds, activeSince } = input
  const limit = input.limit ?? SUGGESTED_USERS_LIMIT
  const byId = new Map(users.map(u => [u.id, u]))
  const seen = new Set<string>()
  const out: SuggestedUser[] = []

  for (const s of stats) {
    const id = s.user
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (id === selfId || followingIds.has(id) || pendingOutgoingIds.has(id) || blockedIds.has(id)) continue
    const u = byId.get(id)
    if (!u || u.is_private === true) continue
    const last = typeof s.last_workout_date === 'string' ? s.last_workout_date.slice(0, 10) : ''
    if (!last || last < activeSince) continue
    const total = Number(s.total_sessions) || 0
    if (total <= 0) continue
    out.push({
      id,
      displayName: authorDisplayName(u) || u.username || '?',
      username: u.username || '',
      avatarUrl: null,
      totalSessions: total,
      currentStreak: Number(s.workout_streak_current) || 0,
      lastWorkoutDate: last,
    })
  }

  out.sort((a, b) =>
    b.lastWorkoutDate.localeCompare(a.lastWorkoutDate) ||
    b.currentStreak - a.currentStreak ||
    a.id.localeCompare(b.id),
  )
  return out.slice(0, limit)
}

/** Dónde se enseñan las sugerencias; es el valor de `surface` en los eventos. */
export type SuggestedUsersSurface = 'friends_suggestions' | 'leaderboard_suggestions'

/** `suggested_users_viewed`: una vez por visita, con cuántas se enseñaron. */
export function trackSuggestedUsersViewed(surface: SuggestedUsersSurface, count: number): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.suggestedUsersViewed, {
    surface,
    participant_count: count,
  })
}

/**
 * `suggested_user_followed`: tras seguir desde una sugerencia. `result` es
 * `following` o `requested` (nunca habrá `requested` mientras se excluyan las
 * privadas, pero el servidor decide, no el cliente).
 */
export function trackSuggestedUserFollowed(
  surface: SuggestedUsersSurface,
  targetId: string,
  result: 'following' | 'requested',
  position: number,
): unknown {
  return trackCanonicalEvent(CANONICAL_ANALYTICS_EVENTS.suggestedUserFollowed, {
    surface,
    target_id: targetId,
    result,
    position,
  })
}
