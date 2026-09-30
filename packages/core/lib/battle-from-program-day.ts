/**
 * Un día de programa convertido en la configuración de una batalla (#882).
 *
 * La batalla guarda una COPIA fija de lo que se va a hacer, así que aquí no hay nada
 * que resolver en vivo: el día se aplana a «N rondas iguales de estos ejercicios».
 * Es lo que pierde respecto al día real (series distintas por ejercicio) y por eso
 * cada decisión que se aparta del día original sale en `notes`, para que la UI se lo
 * enseñe al creador antes de crear.
 *
 * La función es pura y no traduce nada: devuelve códigos (`notes`, `meta.perSide`,
 * `reason`) y la UI los pinta con su i18n.
 *
 * Los límites son los que #882 fija para `validateConfiguration` (servidor y
 * `battle.ts`): 1-8 ejercicios, 1-10 rondas, reps ≤ 200, segundos ≤ 600, descanso ≤ 300.
 * Aquí el descanso se recorta antes, a 120 s.
 */
import type { DayType, Exercise } from '../types'
import type { BattleConfiguration, BattleExerciseTarget } from '../types/battle'

export const BATTLE_DAY_TEMPLATE_ID = 'program_day'
export const BATTLE_DAY_MAX_EXERCISES = 8
export const BATTLE_DAY_MIN_ROUNDS = 1
export const BATTLE_DAY_MAX_ROUNDS = 10
export const BATTLE_DAY_MAX_REPS = 200
export const BATTLE_DAY_MAX_SECONDS = 600
export const BATTLE_DAY_MAX_REST_SECONDS = 120
/** Series que cuenta un ejercicio cuyo `sets` no es un número («múltiples», «intentos»). */
export const BATTLE_DAY_DEFAULT_SETS = 3
/** Reps cuando el texto no dice ningún número. */
export const BATTLE_DAY_DEFAULT_REPS = 10
/** Segundos cuando un ejercicio por tiempo no dice cuántos. */
export const BATTLE_DAY_DEFAULT_SECONDS = 30

/** Lo mínimo que hace falta de un día: `Workout` y el `WeekDay.type` de su semana. */
export interface BattleSourceDay {
  /** `WeekDay.type`. Ausente = día de fuerza. */
  type?: DayType
  exercises: readonly Exercise[]
}

export interface BattleFromDayOptions {
  /** Rondas elegidas por el creador; gana a las del día. Se recorta a 1-10. */
  rounds?: number
}

export type BattleDayUnconvertibleReason = 'cardio' | 'yoga' | 'rest' | 'no_strength_exercises'

/** Qué lleva «por …» el objetivo, para que la UI pinte «8 c/pierna». */
export type BattlePerSide = 'side' | 'leg' | 'arm' | 'direction'

export type BattleDayNote =
  /** Los ejercicios tenían series distintas: se usó la menor. */
  | { code: 'rounds_flattened'; min: number; max: number }
  /** Algún `sets` no era un número y contó como 3. */
  | { code: 'non_numeric_sets'; exerciseIds: string[] }
  | { code: 'truncated'; dropped: number; max: number }
  /** Un ejercicio repetido en el día; la batalla no admite ids duplicados. */
  | { code: 'duplicates_removed'; exerciseIds: string[] }
  | { code: 'rest_capped'; exerciseIds: string[] }
  | { code: 'targets_capped'; exerciseIds: string[] }
  /** El texto de reps no se pudo leer y se puso el valor por defecto (editable). */
  | { code: 'targets_defaulted'; exerciseIds: string[] }
  | { code: 'rounds_overridden'; from: number; to: number }

/** Una fila por ejercicio de `config.exercises`, en el mismo orden. */
export interface BattleDayExerciseMeta {
  exerciseId: string
  /** Nombre del ejercicio en el programa; para el fallback de nombres. */
  name: string
  perSide: BattlePerSide | null
  /** `true` = el objetivo es un valor por defecto que el creador debería revisar. */
  defaulted: boolean
  /** Las reps eran un rango y se cogió el límite bajo. */
  fromRange: boolean
  supersetGroup?: string
}

export type BattleFromDayResult =
  | {
    ok: true
    config: BattleConfiguration
    /** Rondas que salen del día (antes de `opts.rounds`). */
    dayRounds: number
    meta: BattleDayExerciseMeta[]
    notes: BattleDayNote[]
  }
  | { ok: false; reason: BattleDayUnconvertibleReason }

interface ParsedTarget {
  kind: 'reps' | 'seconds'
  value: number
  perSide: BattlePerSide | null
  defaulted: boolean
  fromRange: boolean
  capped: boolean
}

const SECONDS_RE = /^\s*(\d+)(?:\s*-\s*\d+)?\s*(?:s|seg|segs|segundos)\b/i
const NUMBER_RE = /(\d+)(\s*-\s*\d+)?/

function parsePerSide(text: string): BattlePerSide | null {
  const t = text.toLowerCase()
  if (/c\/\s*pierna|por pierna|per leg|each leg/.test(t)) return 'leg'
  if (/c\/\s*brazo|por brazo|per arm|each arm/.test(t)) return 'arm'
  if (/por direcci[oó]n|per direction/.test(t)) return 'direction'
  if (/c\/\s*lado|por lado|per side|each side/.test(t)) return 'side'
  return null
}

function parseTarget(ex: Exercise): ParsedTarget {
  const text = (ex.reps ?? '').trim()
  const perSide = parsePerSide(text)
  const secondsMatch = SECONDS_RE.exec(text)
  const rangeOf = (m: RegExpExecArray | null) => Boolean(m && m[2])

  if (ex.isTimer || secondsMatch) {
    let value = ex.isTimer && ex.timerSeconds && ex.timerSeconds > 0 ? Math.round(ex.timerSeconds) : 0
    let fromRange = false
    if (!value && secondsMatch) {
      value = Number(secondsMatch[1])
      fromRange = rangeOf(secondsMatch)
    }
    const defaulted = value <= 0
    if (defaulted) value = BATTLE_DAY_DEFAULT_SECONDS
    const capped = value > BATTLE_DAY_MAX_SECONDS
    return {
      kind: 'seconds', value: Math.min(value, BATTLE_DAY_MAX_SECONDS), perSide, defaulted, fromRange, capped,
    }
  }

  const m = NUMBER_RE.exec(text)
  const parsed = m ? Number(m[1]) : 0
  const defaulted = parsed <= 0
  const value = defaulted ? BATTLE_DAY_DEFAULT_REPS : parsed
  return {
    kind: 'reps',
    value: Math.min(value, BATTLE_DAY_MAX_REPS),
    perSide,
    defaulted,
    fromRange: rangeOf(m),
    capped: value > BATTLE_DAY_MAX_REPS,
  }
}

/** «90», «90s», «90 s», «2 min», «1:30». Sin formato reconocible → 0. */
export function parseRestSeconds(rest: unknown): number {
  if (typeof rest === 'number') return Number.isFinite(rest) && rest > 0 ? Math.round(rest) : 0
  if (typeof rest !== 'string') return 0
  const t = rest.trim().toLowerCase()
  const clock = /^(\d+):(\d{2})$/.exec(t)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const m = /^(\d+(?:[.,]\d+)?)\s*(min|m|minutos?|s|seg|segs|segundos?)?\b/.exec(t)
  if (!m) return 0
  const n = Number(m[1].replace(',', '.'))
  const isMinutes = m[2] !== undefined && /^m/.test(m[2]) && !/^(?:s|seg)/.test(m[2])
  return Math.round(isMinutes ? n * 60 : n)
}

function setsOf(ex: Exercise): { sets: number; numeric: boolean } {
  const raw = typeof ex.sets === 'string' ? Number(ex.sets.trim()) : ex.sets
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) return { sets: Math.floor(raw), numeric: true }
  return { sets: BATTLE_DAY_DEFAULT_SETS, numeric: false }
}

/** Los miembros de un superset quedan pegados, detrás del primero que aparece. */
function groupSupersets(exercises: Exercise[]): Exercise[] {
  const out: Exercise[] = []
  const placed = new Set<Exercise>()
  for (const ex of exercises) {
    if (placed.has(ex)) continue
    out.push(ex)
    placed.add(ex)
    if (!ex.supersetGroup) continue
    for (const other of exercises) {
      if (!placed.has(other) && other.supersetGroup === ex.supersetGroup) {
        out.push(other)
        placed.add(other)
      }
    }
  }
  return out
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

export function battleConfigFromProgramDay(
  day: BattleSourceDay,
  opts: BattleFromDayOptions = {},
): BattleFromDayResult {
  if (day.type === 'cardio' || day.type === 'yoga' || day.type === 'rest') {
    return { ok: false, reason: day.type }
  }

  const notes: BattleDayNote[] = []
  const main = day.exercises.filter(
    ex => ex.section !== 'warmup' && ex.section !== 'cooldown' && Boolean(ex.id?.trim()),
  )

  const seen = new Set<string>()
  const unique: Exercise[] = []
  const duplicates: string[] = []
  for (const ex of main) {
    const id = ex.id.trim()
    if (seen.has(id)) duplicates.push(id)
    else {
      seen.add(id)
      unique.push(ex)
    }
  }
  if (unique.length === 0) return { ok: false, reason: 'no_strength_exercises' }
  if (duplicates.length) notes.push({ code: 'duplicates_removed', exerciseIds: duplicates })

  let ordered = groupSupersets(unique)
  if (ordered.length > BATTLE_DAY_MAX_EXERCISES) {
    notes.push({ code: 'truncated', dropped: ordered.length - BATTLE_DAY_MAX_EXERCISES, max: BATTLE_DAY_MAX_EXERCISES })
    ordered = ordered.slice(0, BATTLE_DAY_MAX_EXERCISES)
  }

  const sets = ordered.map(setsOf)
  const nonNumeric = ordered.filter((_, i) => !sets[i].numeric).map(ex => ex.id.trim())
  if (nonNumeric.length) notes.push({ code: 'non_numeric_sets', exerciseIds: nonNumeric })
  const counts = sets.map(s => s.sets)
  const min = Math.min(...counts)
  const max = Math.max(...counts)
  if (min !== max) notes.push({ code: 'rounds_flattened', min, max })
  const dayRounds = clamp(min, BATTLE_DAY_MIN_ROUNDS, BATTLE_DAY_MAX_ROUNDS)

  let rounds = dayRounds
  if (typeof opts.rounds === 'number' && Number.isFinite(opts.rounds)) {
    rounds = clamp(Math.round(opts.rounds), BATTLE_DAY_MIN_ROUNDS, BATTLE_DAY_MAX_ROUNDS)
    if (rounds !== dayRounds) notes.push({ code: 'rounds_overridden', from: dayRounds, to: rounds })
  }

  const restCapped: string[] = []
  const targetsCapped: string[] = []
  const targetsDefaulted: string[] = []
  const meta: BattleDayExerciseMeta[] = []
  const exercises: BattleExerciseTarget[] = ordered.map((ex, position) => {
    const id = ex.id.trim()
    const target = parseTarget(ex)
    if (target.capped) targetsCapped.push(id)
    if (target.defaulted) targetsDefaulted.push(id)
    const rawRest = parseRestSeconds(ex.rest)
    if (rawRest > BATTLE_DAY_MAX_REST_SECONDS) restCapped.push(id)
    meta.push({
      exerciseId: id,
      name: ex.name,
      perSide: target.perSide,
      defaulted: target.defaulted,
      fromRange: target.fromRange,
      ...(ex.supersetGroup ? { supersetGroup: ex.supersetGroup } : {}),
    })
    return {
      exercise_id: id,
      position,
      target: { kind: target.kind, value: target.value },
      rest_seconds: Math.min(rawRest, BATTLE_DAY_MAX_REST_SECONDS),
    }
  })
  if (restCapped.length) notes.push({ code: 'rest_capped', exerciseIds: restCapped })
  if (targetsCapped.length) notes.push({ code: 'targets_capped', exerciseIds: targetsCapped })
  if (targetsDefaulted.length) notes.push({ code: 'targets_defaulted', exerciseIds: targetsDefaulted })

  return {
    ok: true,
    config: {
      workout_template_id: BATTLE_DAY_TEMPLATE_ID,
      rounds,
      scoring_mode: 'rounds_then_reps_then_time',
      exercises,
    },
    dayRounds,
    meta,
    notes,
  }
}
