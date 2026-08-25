/**
 * De `FeedItem` a texto. Una sola vez, para las dos apps.
 *
 * Antes cada tarjeta armaba sus propias cadenas: la web tenía `'Hizo cardio'`
 * incrustado en el JSX y la nativa `'Completó un entrenamiento'` en otro fichero,
 * las dos en español y las dos distintas. Con seis tipos de actividad esa
 * duplicación deja de ser un detalle: es la garantía de que el muro de la web y
 * el del móvil acaben contando cosas diferentes del mismo evento.
 *
 * Aquí no hay JSX ni estilos: solo qué frase, qué título y qué métricas
 * corresponden a cada tipo. El color sale de `FEED_ACCENTS`/`PHASE_COLORS` y el
 * layout lo pone cada plataforma.
 */
import { findBattlePreset } from '../data/battle-presets'
import { WORKOUTS } from '../data/workouts'
import { formatDuration, formatPace } from './geo'
import { localize } from './i18n-db'
import { currentLanguage, tr } from './i18n-safe'
import { NO_PHASE, isFreeSessionKey, sessionKeyLabel } from './session-key'
import { RANK_MEDALS } from './challenges'
import { FEED_ACCENTS, PHASE_COLORS, type FeedAccent } from './style-tokens'
import type { FeedItem } from '../types/feed'

/** Cuántos ejercicios se nombran antes de resumir con "+N". */
const MAX_NAMED_EXERCISES = 3

export interface FeedItemView {
  /** Frase de acción bajo el autor: "completó una sesión libre 🔥". */
  action: string
  /**
   * Verbo suelto para las listas de una línea (widget de actividad reciente),
   * donde `action` sobra: "Ana completó un entrenamiento 💪 Sesión Libre" dice
   * dos veces lo mismo. Con el verbo queda "Ana completó Sesión Libre".
   */
  verb: string
  /** Título del bloque principal. Nunca vacío. */
  title: string
  /**
   * Segunda línea del bloque: los ejercicios de la sesión, el objetivo del reto,
   * la distancia de la carrera. `null` cuando no hay nada que añadir.
   */
  detail: string | null
  /** Tercera línea, monoespaciada: distancia · duración · ritmo. */
  metrics: string | null
  /** Etiqueta corta a la derecha del título ("Fase 2", "🥇 1º de 4"). */
  badge: string | null
  /** Clases de acento (`border-l-*`, `text-*`) compartidas con NativeWind. */
  accent: { border: string; text: string }
}

/** Etiqueta corta por tipo de actividad cardio. */
export function cardioLabel(activityType: string): string {
  switch (activityType) {
    case 'running': return tr('cardio.running', 'Carrera')
    case 'walking': return tr('cardio.walking', 'Caminata')
    case 'cycling': return tr('cardio.cycling', 'Ciclismo')
    // Un tipo que este build no conoce (lo añadió un cliente más nuevo) se
    // enseña capitalizado antes que dejar la tarjeta sin título.
    default: return activityType
      ? activityType.charAt(0).toUpperCase() + activityType.slice(1)
      : tr('nav.cardio', 'Cardio')
  }
}

/** "12,4 km · 58:20 · 4:42 /km", saltándose lo que no exista. */
function metricsLine(parts: {
  distanceKm?: number | null
  durationSeconds?: number | null
  avgPace?: number | null
}): string | null {
  const out: string[] = []
  if (parts.distanceKm != null && parts.distanceKm > 0) out.push(`${parts.distanceKm.toFixed(2)} km`)
  if (parts.durationSeconds != null && parts.durationSeconds > 0) out.push(formatDuration(parts.durationSeconds))
  if (parts.avgPace != null && parts.avgPace > 0) out.push(`${formatPace(parts.avgPace)} /km`)
  return out.length > 0 ? out.join(' · ') : null
}

/** "Flexiones · Plank · Dips +2" */
function exercisesLine(names: string[]): string | null {
  const clean = names.filter(Boolean)
  if (clean.length === 0) return null
  const shown = clean.slice(0, MAX_NAMED_EXERCISES).join(' · ')
  const rest = clean.length - MAX_NAMED_EXERCISES
  return rest > 0 ? `${shown} +${rest}` : shown
}

/** "🥇 1º de 4" — medalla para el podio, número a partir del cuarto. */
function rankBadge(rank: number | null, total: number): string | null {
  if (rank == null || rank < 1) return null
  const medal = RANK_MEDALS[rank - 1]
  const position = tr('feed.rankOf', `${rank}º de ${total}`, { rank, total })
  return medal ? `${medal} ${position}` : position
}

/**
 * Título de una sesión, resuelto AL PINTAR y no al traerla de PocketBase.
 *
 * `FeedItem.workoutTitle` viene ya resuelto por la consulta, pero esa resolución
 * pasa por i18n y el resultado se queda en la caché de react-query: cambiar el
 * idioma de la app dejaba el muro entero con los títulos del idioma anterior
 * hasta que la caché caducaba. Recalcularlo aquí cuesta un acceso a un objeto y
 * el muro cambia de idioma al instante, sin refetch.
 */
function workoutTitleFor(item: FeedItem): string {
  if (!item.workoutKey) return item.workoutTitle || sessionKeyLabel('')
  return WORKOUTS[item.workoutKey]?.title || sessionKeyLabel(item.workoutKey)
}

function workoutView(item: FeedItem): FeedItemView {
  // La fase no basta para decidir el titular: una clave antigua tipo `lun` no
  // trae fase y no es una sesión libre. Cuando hay clave, manda la clave.
  const isFree = item.workoutKey ? isFreeSessionKey(item.workoutKey) : item.phase === NO_PHASE
  const phaseColor = PHASE_COLORS[item.phase]
  // `?? []` y no `item.exerciseNames` a secas: este item puede venir del caché
  // PERSISTIDO de react-query, escrito por una versión anterior de la app. Antes
  // de #588 `FeedItem` no tenía `exerciseNames` y la clave de la query es la
  // misma (`['feed','sessions',…]`), así que al abrir un build nuevo con caché
  // viejo rehidratado el muro entero reventaba con "Cannot read properties of
  // undefined (reading 'length')" antes de que el refetch trajera la forma
  // nueva. El `buster` de `createCorePersister` corta la causa; esto es el
  // cinturón, porque el presentador no puede confiar en la forma de un dato que
  // lleva 24h en localStorage.
  const exerciseNames = item.exerciseNames ?? []
  const counts: string[] = []
  if (exerciseNames.length > 0) {
    counts.push(tr('progress.exerciseCount', `${exerciseNames.length} ejercicios`, { count: exerciseNames.length }))
  }
  if (item.durationSeconds != null && item.durationSeconds > 0) {
    counts.push(formatDuration(item.durationSeconds))
  }
  return {
    action: isFree
      ? tr('feed.completedFreeSession', 'completó una sesión libre')
      : tr('feed.completedWorkout', 'completó un entrenamiento'),
    verb: tr('widgets.completed', 'completó'),
    title: workoutTitleFor(item),
    detail: exercisesLine(exerciseNames),
    metrics: counts.length > 0 ? counts.join(' · ') : null,
    badge: item.phase > NO_PHASE ? tr('feed.phaseN', `Fase ${item.phase}`, { phase: item.phase }) : null,
    // La sesión libre no tiene fase: sin acento propio salía en el lima del
    // programa y era indistinguible de un día de plan.
    accent: isFree || !phaseColor ? FEED_ACCENTS.free : phaseColor,
  }
}

function cardioView(item: FeedItem): FeedItemView {
  const c = item.cardio
  return {
    action: tr('feed.didCardio', 'hizo cardio'),
    verb: tr('feed.verbDid', 'hizo'),
    title: cardioLabel(c?.activityType ?? ''),
    detail: null,
    metrics: metricsLine(c ?? {}),
    badge: null,
    accent: FEED_ACCENTS.cardio,
  }
}

function circuitView(item: FeedItem): FeedItemView {
  const c = item.circuit
  const rounds = c && c.roundsCompleted > 0
    ? tr('feed.roundsDone', `${c.roundsCompleted} rondas`, { count: c.roundsCompleted })
    : null
  return {
    action: tr('feed.completedCircuit', 'completó un circuito'),
    verb: tr('widgets.completed', 'completó'),
    // `circuit_name` es un campo localizable de PocketBase (`{es, en}`).
    title: localize(c?.name, currentLanguage()) || tr('feed.circuitGeneric', 'Circuito'),
    detail: null,
    metrics: [rounds, c?.durationSeconds ? formatDuration(c.durationSeconds) : null]
      .filter(Boolean).join(' · ') || null,
    // Un circuito abandonado a mitad (2 de 5) merece decirlo, no fingir que
    // cumplió el objetivo.
    badge: c && c.roundsTarget > 0 && c.roundsCompleted < c.roundsTarget
      ? tr('feed.roundsOfTarget', `${c.roundsCompleted}/${c.roundsTarget} rondas`, { done: c.roundsCompleted, target: c.roundsTarget })
      : null,
    accent: FEED_ACCENTS.circuit,
  }
}

function challengeView(item: FeedItem): FeedItemView {
  const c = item.challenge
  return {
    action: c?.role === 'created'
      ? tr('feed.createdChallenge', 'creó un reto')
      : tr('feed.joinedChallenge', 'se apuntó a un reto'),
    verb: c?.role === 'created'
      ? tr('feed.verbCreated', 'creó')
      : tr('feed.verbJoined', 'se apuntó a'),
    title: c?.title || tr('feed.challengeGeneric', 'Reto'),
    detail: c?.metricLabel || null,
    metrics: c && c.goal > 0
      ? tr('feed.challengeGoal', `Objetivo: ${c.goal}`, { goal: c.goal })
      : null,
    badge: null,
    accent: FEED_ACCENTS.challenge,
  }
}

function raceView(item: FeedItem): FeedItemView {
  const r = item.race
  return {
    // `fetchRaces` solo trae participaciones con `status = 'finished'`, así que
    // no hay rama de "se apuntó": mientras la carrera está viva la fila se
    // reescribe con cada punto GPS y el post saltaría al principio del muro sin
    // parar. Ver el comentario de la consulta.
    action: tr('feed.finishedRace', 'terminó una carrera'),
    verb: tr('feed.verbFinished', 'terminó'),
    title: r?.name || tr('feed.raceGeneric', 'Carrera'),
    detail: r?.activityType ? cardioLabel(r.activityType) : null,
    metrics: metricsLine(r ?? {}),
    badge: rankBadge(r?.rank ?? null, r?.totalParticipants ?? 0),
    accent: FEED_ACCENTS.race,
  }
}

function battleView(item: FeedItem): FeedItemView {
  const b = item.battle
  const preset = b ? findBattlePreset(b.templateId) : null
  return {
    action: b?.outcome === 'won'
      ? tr('feed.wonBattle', 'ganó una batalla')
      : tr('feed.finishedBattle', 'terminó una batalla'),
    verb: b?.outcome === 'won'
      ? tr('feed.verbWon', 'ganó')
      : tr('feed.verbFinished', 'terminó'),
    title: preset ? localize(preset.name, currentLanguage()) : tr('feed.battleGeneric', 'Batalla'),
    detail: preset ? localize(preset.description, currentLanguage()) : null,
    metrics: null,
    badge: rankBadge(b?.rank ?? null, b?.totalParticipants ?? 0),
    accent: FEED_ACCENTS.battle,
  }
}

const VIEWS: Record<FeedItem['type'], (item: FeedItem) => FeedItemView> = {
  workout: workoutView,
  cardio: cardioView,
  circuit: circuitView,
  challenge: challengeView,
  race: raceView,
  battle: battleView,
}

/**
 * Primera letra en mayúscula, respetando acentos y emoji.
 *
 * Las frases de acción se guardan en minúscula (`"completó un entrenamiento 💪"`)
 * porque en el widget van a mitad de una oración. En la tarjeta encabezan línea y
 * hay que capitalizarlas: la web podía con `first-letter:uppercase`, pero
 * NativeWind no implementa esa pseudo-clase, así que la app nativa se quedaba en
 * minúscula. Hacerlo aquí deja las dos iguales.
 */
export function capitalizeFirst(text: string): string {
  if (!text) return text
  // `[...text]` y no `text[0]`: partir por unidades UTF-16 rompe un emoji
  // inicial en dos mitades sin sentido.
  const [first, ...rest] = [...text]
  return first.toLocaleUpperCase() + rest.join('')
}

/**
 * Texto de una tarjeta del muro.
 *
 * Un `type` que este build no conoce (fila escrita por un cliente más nuevo) se
 * degrada al de sesión en vez de reventar la lista entera: el muro es la
 * pantalla con más probabilidad de recibir datos de una versión futura.
 */
export function describeFeedItem(item: FeedItem): FeedItemView {
  return (VIEWS[item.type] ?? workoutView)(item)
}

/**
 * A dónde lleva tocar una tarjeta, o `null` si no lleva a ninguna parte.
 *
 * Las REGLAS viven aquí (son de privacidad, iguales en las dos plataformas); la
 * ruta concreta la pone cada app. No todo lo que el muro enseña se puede abrir:
 *
 *  - circuito: `CircuitSessionDetailPage` lee `circuit_sessions`, que es
 *    owner-only desde #386. El circuito de otra persona daría 404.
 *  - batalla: el detalle lo sirve `/api/battles/:id/snapshot`, que solo responde
 *    a quien jugó esa batalla.
 *
 * En ambos casos la tarjeta se pinta sin chevron y sin ser pulsable, que es
 * mejor que prometer un destino y aterrizar en un error.
 */
export interface FeedItemTarget {
  kind: FeedItem['type']
  /** Id del registro que abre la pantalla de destino. */
  id: string
}

export function feedItemTarget(item: FeedItem, isOwnPost: boolean): FeedItemTarget | null {
  switch (item.type) {
    case 'workout': return { kind: 'workout', id: item.id }
    case 'cardio': return { kind: 'cardio', id: item.id }
    case 'circuit': return isOwnPost ? { kind: 'circuit', id: item.id } : null
    case 'challenge': return item.challenge ? { kind: 'challenge', id: item.challenge.challengeId } : null
    case 'race': return item.race ? { kind: 'race', id: item.race.raceId } : null
    case 'battle': return item.battle?.viewerTookPart ? { kind: 'battle', id: item.battle.battleId } : null
    default: return null
  }
}

/** Acento por tipo, para quien solo necesite el color (widgets compactos). */
export function feedAccentFor(item: FeedItem): FeedAccent | null {
  if (item.type === 'workout') return item.phase === NO_PHASE ? 'free' : null
  return item.type as FeedAccent
}
