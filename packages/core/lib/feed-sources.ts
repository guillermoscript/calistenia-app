/**
 * Las seis fuentes del muro, cada una con su consulta y su mapeo a `FeedItem`.
 *
 * Vive fuera de `useActivityFeed` a propósito: el hook solo orquesta (react-query,
 * cursores, merge) y aquí está todo lo que sabe de PocketBase. Añadir una fuente
 * nueva es escribir una función más y meterla en `FEED_SOURCES`; el hook no se
 * toca.
 *
 * TODAS leen de views públicas o de colecciones con regla de bloqueo — nunca de
 * una tabla base cerrada (#386). Ver `pb_migrations/1784600000_feed_activity_sources.js`.
 *
 * ── El cursor ───────────────────────────────────────────────────────────────
 * Cada fuente pagina por su propia columna de tiempo y guarda el valor CRUDO de
 * esa columna, no una fecha normalizada. Es la corrección de un bug real: el
 * cursor común era el `completedAt` ya normalizado a ISO (`2026-08-09T16:58…`),
 * y se comparaba contra `sessions.completed_at`, que PocketBase guarda con
 * espacio (`2026-08-09 16:58…`). Como `' ' < 'T'` en orden lexicográfico, el
 * filtro `completed_at < cursor` dejaba pasar sesiones POSTERIORES del mismo
 * día: la segunda página repetía posts de la primera.
 */
import { pb } from './pocketbase'
import { utcToLocalDateStr } from './dateUtils'
import { WORKOUTS } from '../data/workouts'
import { NO_PHASE, sessionKeyLabel, sessionKeyParts } from './session-key'
import { getMetricLabel } from './challenges'
import { battleDisplayRanks, battleOutcomeFor } from './battle'
import type { BattleStanding } from '../types/battle'
import type { FeedItem } from '../types/feed'

/** Cuántas filas pide cada fuente por página. */
export const FEED_PAGE_SIZE = 20

export interface FeedUserInfo {
  name: string
  avatarUrl: string | null
}

export interface FeedSourceContext {
  /** Usuarios cuyo muro se lee (yo + a quien sigo). */
  userIds: string[]
  /** Quién mira. Necesario para saber si puede abrir el detalle de una batalla. */
  viewerId: string
  userMap: Record<string, FeedUserInfo>
  /** Valor crudo de la columna de tiempo de ESTA fuente, o null en la 1ª página. */
  cursor: string | null
}

export interface FeedSourceResult {
  items: FeedItem[]
  /** true si la consulta devolvió la página entera: puede quedar más. */
  full: boolean
}

export type FeedSourceKey = 'sessions' | 'cardio' | 'circuits' | 'challenges' | 'races' | 'battles'

// ── Utilidades ───────────────────────────────────────────────────────────────

/** `(user = 'a' || user = 'b' || …)` con los ids ya escapados. */
function ownerFilter(userIds: string[], field = 'user'): string {
  return userIds.map(uid => pb.filter(`${field} = {:uid}`, { uid })).join(' || ')
}

/** Une el filtro de dueños con el del cursor, si lo hay. */
function withCursor(base: string, column: string, cursor: string | null, extra?: string): string {
  const clauses = [`(${base})`]
  if (extra) clauses.push(`(${extra})`)
  if (cursor) clauses.push(`(${pb.filter(`${column} < {:c}`, { c: cursor })})`)
  return clauses.join(' && ')
}

/** ISO con `T` y `Z`, para que el merge cronológico compare formatos iguales. */
function toSortableIso(raw: string): string {
  if (!raw) return ''
  let s = raw.replace(' ', 'T')
  if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z'
  return s
}

/**
 * `exercise_timings` llega como array ya parseado desde el SDK, pero una fila
 * antigua puede traer la cadena JSON cruda. Nunca dejes que un JSON corrupto
 * tumbe el muro entero.
 */
function exerciseNamesFrom(timings: unknown): string[] {
  let raw = timings
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((t: unknown) => (t && typeof t === 'object' ? (t as { exerciseName?: string }).exerciseName : null))
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
}

/** Campos comunes de la cabecera de la tarjeta. */
function baseItem(
  rec: { id: string; user: string },
  ctx: FeedSourceContext,
  rawTimestamp: string,
): Omit<FeedItem, 'type'> {
  const iso = toSortableIso(rawTimestamp)
  return {
    id: rec.id,
    userId: rec.user,
    displayName: ctx.userMap[rec.user]?.name || '?',
    avatarUrl: ctx.userMap[rec.user]?.avatarUrl || null,
    completedAt: iso,
    date: utcToLocalDateStr(iso),
    cursor: rawTimestamp,
    workoutKey: '',
    workoutTitle: '',
    phase: NO_PHASE,
    exerciseNames: [],
    durationSeconds: null,
    note: '',
  }
}

/** Una consulta que falla no puede vaciar el muro: devuelve su hueco vacío. */
async function safeList(collection: string, page: number, perPage: number, options: Record<string, unknown>) {
  try {
    const res = await pb.collection(collection).getList(page, perPage, { $autoCancel: false, ...options })
    return (res as { items: unknown[] }).items as Record<string, unknown>[]
  } catch {
    return [] as Record<string, unknown>[]
  }
}

function done(items: FeedItem[], fetched: number): FeedSourceResult {
  return { items, full: fetched >= FEED_PAGE_SIZE }
}

// ── Sesiones de fuerza ───────────────────────────────────────────────────────

async function fetchSessions(ctx: FeedSourceContext): Promise<FeedSourceResult> {
  const rows = await safeList('public_sessions', 1, FEED_PAGE_SIZE, {
    filter: withCursor(ownerFilter(ctx.userIds), 'completed_at', ctx.cursor),
    sort: '-completed_at',
  })

  const items = rows.map((s): FeedItem => {
    const workoutKey = (s.workout_key as string) || ''
    const workout = WORKOUTS[workoutKey]
    const { isFree } = sessionKeyParts(workoutKey)
    const durationSeconds = (s.duration_seconds as number) || null
    return {
      ...baseItem(s as never, ctx, (s.completed_at as string) || ''),
      type: 'workout',
      workoutKey,
      // Sin este respaldo, una sesión libre aparecería con su clave cruda
      // (`free_1783000000`) — o en blanco, que es lo que hacía en la web.
      workoutTitle: workout?.title || sessionKeyLabel(workoutKey),
      // `?? 1` y no `|| 1`: el 0 de una sesión libre es un valor legítimo que no
      // debe degradarse a "Fase 1".
      phase: isFree ? NO_PHASE : ((s.phase as number) ?? 1),
      // Lo único que cuenta QUÉ se entrenó en una sesión libre sin pedir los
      // `sets_log` de otra persona: la view ya publica `exercise_timings`.
      exerciseNames: exerciseNamesFrom(s.exercise_timings),
      durationSeconds,
      note: (s.note as string) || '',
    }
  })
  return done(items, rows.length)
}

// ── Cardio ───────────────────────────────────────────────────────────────────

async function fetchCardio(ctx: FeedSourceContext): Promise<FeedSourceResult> {
  const rows = await safeList('public_cardio_sessions', 1, FEED_PAGE_SIZE, {
    // `finished_at != ''` deja fuera la sesión que aún está corriendo: el muro
    // cuenta lo que alguien HIZO, no lo que está haciendo ahora mismo.
    filter: withCursor(ownerFilter(ctx.userIds), 'finished_at', ctx.cursor, 'finished_at != ""'),
    sort: '-finished_at',
    fields: 'id,user,activity_type,distance_km,duration_seconds,avg_pace,note,started_at,finished_at',
  })

  const items = rows.map((c): FeedItem => ({
    ...baseItem(c as never, ctx, (c.finished_at as string) || (c.started_at as string) || ''),
    type: 'cardio',
    durationSeconds: (c.duration_seconds as number) ?? null,
    note: (c.note as string) || '',
    cardio: {
      activityType: (c.activity_type as string) || '',
      distanceKm: (c.distance_km as number) ?? null,
      durationSeconds: (c.duration_seconds as number) ?? null,
      avgPace: (c.avg_pace as number) ?? null,
    },
  }))
  return done(items, rows.length)
}

// ── Circuitos ────────────────────────────────────────────────────────────────

async function fetchCircuits(ctx: FeedSourceContext): Promise<FeedSourceResult> {
  const rows = await safeList('public_circuit_sessions', 1, FEED_PAGE_SIZE, {
    filter: withCursor(ownerFilter(ctx.userIds), 'finished_at', ctx.cursor, 'finished_at != ""'),
    sort: '-finished_at',
  })

  const items = rows.map((c): FeedItem => ({
    ...baseItem(c as never, ctx, (c.finished_at as string) || ''),
    type: 'circuit',
    durationSeconds: (c.duration_seconds as number) ?? null,
    note: (c.note as string) || '',
    circuit: {
      name: (c.circuit_name as never) ?? null,
      mode: (c.mode as string) || '',
      roundsCompleted: (c.rounds_completed as number) || 0,
      roundsTarget: (c.rounds_target as number) || 0,
      durationSeconds: (c.duration_seconds as number) ?? null,
    },
  }))
  return done(items, rows.length)
}

// ── Retos ────────────────────────────────────────────────────────────────────

async function fetchChallenges(ctx: FeedSourceContext): Promise<FeedSourceResult> {
  const rows = await safeList('challenge_participants', 1, FEED_PAGE_SIZE, {
    // `created` lo añade 1784600000; las filas anteriores no lo tienen y se
    // quedan fuera en vez de aparecer fechadas en 1970.
    filter: withCursor(ownerFilter(ctx.userIds), 'created', ctx.cursor, 'created != ""'),
    sort: '-created',
    expand: 'challenge',
  })

  const items = rows.flatMap((p): FeedItem[] => {
    const challenge = (p.expand as { challenge?: Record<string, unknown> } | undefined)?.challenge
    // Sin `expand` no hay nada que enseñar: el reto se borró, o quien lo creó
    // está bloqueado y su fila no pasa la regla. Se salta la tarjeta entera.
    if (!challenge) return []
    const metric = (challenge.metric as string) || ''
    return [{
      ...baseItem(p as never, ctx, (p.created as string) || ''),
      type: 'challenge',
      challenge: {
        challengeId: challenge.id as string,
        title: (challenge.title as string) || '',
        metricLabel: getMetricLabel(
          metric as never,
          challenge.custom_metric as string,
          challenge.exercise_slug as string,
        ),
        goal: (challenge.goal as number) || 0,
        startsAt: (challenge.starts_at as string) || '',
        endsAt: (challenge.ends_at as string) || '',
        status: (challenge.status as string) || '',
        role: challenge.creator === p.user ? 'created' : 'joined',
      },
    }]
  })
  return done(items, rows.length)
}

// ── Carreras ─────────────────────────────────────────────────────────────────

/**
 * Puesto de cada participante que terminó, por carrera. Una sola consulta para
 * todas las carreras de la página: `getFullList` por carrera multiplicaría las
 * peticiones por el número de posts de carrera del muro.
 */
async function raceRanks(
  raceIds: string[],
): Promise<Map<string, { order: Map<string, number>; total: number }>> {
  const out = new Map<string, { order: Map<string, number>; total: number }>()
  if (raceIds.length === 0) return out

  const rows = await safeList('race_participants', 1, 500, {
    filter: `(${ownerFilter(raceIds, 'race')}) && (status = "finished" && finished_at != "")`,
    sort: 'finished_at',
    fields: 'id,race,finished_at',
  })

  for (const row of rows) {
    const raceId = row.race as string
    let entry = out.get(raceId)
    if (!entry) { entry = { order: new Map(), total: 0 }; out.set(raceId, entry) }
    entry.total += 1
    // Las filas llegan ya ordenadas por `finished_at` ascendente.
    entry.order.set(row.id as string, entry.total)
  }
  return out
}

async function fetchRaces(ctx: FeedSourceContext): Promise<FeedSourceResult> {
  const rows = await safeList('race_participants', 1, FEED_PAGE_SIZE, {
    // Solo carreras TERMINADAS. Apuntarse se descartó a propósito: durante una
    // carrera en vivo la fila se reescribe cada pocos segundos con la posición
    // GPS, así que cualquier orden basado en `updated` haría saltar el post al
    // principio del muro una y otra vez.
    filter: withCursor(ownerFilter(ctx.userIds), 'finished_at', ctx.cursor, 'status = "finished" && finished_at != ""'),
    sort: '-finished_at',
    expand: 'race',
  })

  // Puesto final: `race_participants` no lo guarda, hay que derivarlo. Se ordena
  // por `finished_at` ascendente entre los que terminaron — EXACTAMENTE el mismo
  // criterio que `useRacePRs` usa para contar victorias. Si el muro y el contador
  // de victorias discreparan, el usuario vería una medalla que su perfil niega.
  const raceIds = [...new Set(rows.map(p => p.race as string).filter(Boolean))]
  const ranksByRace = await raceRanks(raceIds)

  const items = rows.flatMap((p): FeedItem[] => {
    const race = (p.expand as { race?: Record<string, unknown> } | undefined)?.race
    if (!race) return []
    const standing = ranksByRace.get(p.race as string)
    return [{
      ...baseItem(p as never, ctx, (p.finished_at as string) || ''),
      type: 'race',
      durationSeconds: (p.duration_seconds as number) ?? null,
      race: {
        raceId: race.id as string,
        name: (race.name as string) || '',
        activityType: (race.activity_type as string) || '',
        status: (p.status as string) || '',
        targetDistanceKm: (race.target_distance_km as number) ?? null,
        distanceKm: (p.distance_km as number) ?? null,
        durationSeconds: (p.duration_seconds as number) ?? null,
        avgPace: (p.avg_pace as number) ?? null,
        rank: standing?.order.get(p.id as string) ?? null,
        totalParticipants: standing?.total ?? 0,
      },
    }]
  })
  return done(items, rows.length)
}

// ── Batallas ─────────────────────────────────────────────────────────────────

async function fetchBattles(ctx: FeedSourceContext): Promise<FeedSourceResult> {
  const rows = await safeList('public_battle_finishes', 1, FEED_PAGE_SIZE, {
    filter: withCursor(ownerFilter(ctx.userIds), 'battle_finished_at', ctx.cursor, 'battle_finished_at != ""'),
    sort: '-battle_finished_at',
  })

  const items = rows.map((b): FeedItem => {
    const standings = (Array.isArray(b.battle_standings) ? b.battle_standings : []) as BattleStanding[]
    const displayRanks = battleDisplayRanks(standings)
    const mine = standings.find(s => s.user === b.user)
    const config = (b.battle_config ?? {}) as { workout_template_id?: string }
    return {
      ...baseItem(b as never, ctx, (b.battle_finished_at as string) || ''),
      type: 'battle',
      battle: {
        battleId: b.battle as string,
        templateId: config.workout_template_id || '',
        rank: mine ? displayRanks.get(mine.participant_id) ?? mine.rank : null,
        totalParticipants: standings.length,
        outcome: battleOutcomeFor(standings, b.user as string) === 'won' ? 'won'
          : standings.length > 0 ? 'lost' : 'unknown',
        // El detalle de una batalla lo sirve `/snapshot`, que solo responde a
        // quien jugó. Sin esto la tarjeta llevaría a un 403.
        viewerTookPart: standings.some(s => s.user === ctx.viewerId),
      },
    }
  })
  return done(items, rows.length)
}

// ── Registro ─────────────────────────────────────────────────────────────────

export const FEED_SOURCES: Record<FeedSourceKey, (ctx: FeedSourceContext) => Promise<FeedSourceResult>> = {
  sessions: fetchSessions,
  cardio: fetchCardio,
  circuits: fetchCircuits,
  challenges: fetchChallenges,
  races: fetchRaces,
  battles: fetchBattles,
}

export const FEED_SOURCE_KEYS = Object.keys(FEED_SOURCES) as FeedSourceKey[]
