/**
 * Estado del inicio «qué hago hoy» (#853, épica #852).
 *
 * Una función pura que decide QUÉ enseña el bloque «Hoy» de web y móvil. Cada
 * `kind` es un tablero del lienzo de diseño; la UI solo lo pinta. No hace
 * consultas: todo lo que recibe ya lo tiene el cliente (programa activo,
 * `programProgress`, `isWorkoutDone`, sesión en curso, contador de la cuenta
 * de `useHomeStage` y la activación de `activation.ts`). Sin `Date.now()`: el
 * «hoy» entra por parámetro.
 *
 * ## Precedencia (de arriba abajo; gana el primero que aplica)
 *
 * | kind               | Tablero            | Cuándo |
 * |--------------------|--------------------|--------|
 * | `in_progress`      | EnCurso            | Hay actividad sin terminar (fuerza, cardio, circuito, sesión libre o batalla), también si es de otro día |
 * | `program_complete` | ProgramaTerminado  | Programa activo con `isCompleted` y sin `nextDay` |
 * | `no_program`       | SinPrograma        | Sin programa activo y con ≥1 entreno en la cuenta |
 * | `first_workout`    | Dia0               | 0 entrenos en la cuenta (con o sin programa) |
 * | `comeback`         | Vuelta             | ≥7 días desde el último entreno |
 * | `done_today`       | Hecho              | El día de hoy del programa ya está hecho (variante `cardio`) |
 * | `week_complete`    | SemanaCompleta     | Semana cumplida y hoy es descanso |
 * | `rest_day`         | Descanso           | Hoy es descanso o un día «contenido próximamente» |
 * | `training_day`     | Main/Cardio/Descarga | Toca entrenar |
 *
 * Los modificadores (`modifiers`) se suman a cualquier `kind`:
 * - `inactiveDays` (3-6): «Llevas N días sin entrenar», sin rojo.
 * - `firstWeek`: ventana de activación abierta → la meta «3 en 7 días»
 *   sustituye a la línea de racha (tablero PrimeraSemana).
 * - `offline` / `unsynced`: franja fina arriba.
 * - `loading`: esqueleto del bloque a la misma altura. El `kind` se calcula
 *   igual con lo que haya, pero no hay que fiarse de él mientras sea `true`.
 */
import { activationCardMode, ACTIVATION_TARGET_SESSIONS, type ActivationState, type HomeStageView } from './activation'
import { daysBetween, isDayStr, shiftDay } from './calendarWeek'
import { dayIdFromDateStr, type ProgramProgress } from './programProgress'
import { WEEK_ORDER, isTrainableDay } from './training-day'
import type { DayId, DayType, WeekDay } from '../types'

export type HomeStateKind =
  | 'in_progress'
  | 'program_complete'
  | 'no_program'
  | 'first_workout'
  | 'comeback'
  | 'done_today'
  | 'week_complete'
  | 'rest_day'
  | 'training_day'

/** Orden de precedencia: el primero que aplica gana. */
export const HOME_STATE_PRECEDENCE: readonly HomeStateKind[] = [
  'in_progress',
  'program_complete',
  'no_program',
  'first_workout',
  'comeback',
  'done_today',
  'week_complete',
  'rest_day',
  'training_day',
]

/** Días sin entrenar a partir de los cuales el inicio es «Nuevo comienzo». */
export const COMEBACK_AFTER_DAYS = 7
/** Tramo en el que se añade «Llevas N días sin entrenar». */
export const INACTIVE_NOTICE_MIN_DAYS = 3

export type HomeDayType = 'strength' | 'cardio' | 'circuit' | 'yoga'
export type HomeActivityType = 'strength' | 'cardio' | 'circuit' | 'free' | 'battle'

/** Actividad sin terminar. Cada plataforma junta aquí sus fuentes. */
export interface HomeActiveActivity {
  type: HomeActivityType
  /** Día local en que empezó, `YYYY-MM-DD`. */
  startedDay?: string | null
  /** Clave `p{fase}_{día}` si es un día del programa. */
  workoutKey?: string | null
}

/** Un día del programa, listo para pintar «Hoy · día 2 de 4». */
export interface HomeDayRef {
  dayId: DayId
  /** `YYYY-MM-DD` de ese día (hoy, o el siguiente en que toca). */
  date: string
  /** `p{fase}_{día}`. */
  workoutKey: string
  dayType: HomeDayType
  /** Posición entre los días entrenables de la semana (1-based) y total. */
  index: number
  of: number
}

export interface HomeFirstWeek {
  /** Días distintos con entreno dentro de la ventana. */
  done: number
  target: number
  daysRemaining: number
  reached: boolean
}

export interface HomeModifiers {
  /** Días sin entrenar si están entre 3 y 6; `null` en otro caso. */
  inactiveDays: number | null
  firstWeek: HomeFirstWeek | null
  offline: boolean
  unsynced: boolean
  loading: boolean
}

export type HomeState = { modifiers: HomeModifiers } & (
  | { kind: 'in_progress'; activity: HomeActiveActivity; fromAnotherDay: boolean }
  | { kind: 'program_complete' }
  | { kind: 'no_program' }
  /** `showActivationGoal`: la ventana de 7 días sigue abierta (pasados, Dia0 sin meta). */
  | { kind: 'first_workout'; showActivationGoal: boolean }
  /** `day`: el de hoy si toca, si no el siguiente con contenido. */
  | { kind: 'comeback'; daysSinceLast: number; day: HomeDayRef | null }
  | { kind: 'done_today'; day: HomeDayRef; variant: 'default' | 'cardio'; next: HomeDayRef | null }
  | { kind: 'week_complete'; next: HomeDayRef | null }
  /** `comingSoon`: hoy tocaba entreno pero el día aún no tiene contenido. */
  | { kind: 'rest_day'; comingSoon: boolean; next: HomeDayRef | null }
  | { kind: 'training_day'; day: HomeDayRef; deload: boolean }
)

export interface HomeStateInput {
  /** Hoy, `YYYY-MM-DD` local. */
  today: string
  /** Programa activo, o `null`. */
  activeProgram: { id: string } | null
  programProgress: Pick<ProgramProgress, 'nextDay' | 'isDeloadWeek' | 'isCompleted' | 'currentWeek' | 'currentPhase'> | null
  /** Semana tipo de la fase en curso. Sin programa se ignora. */
  weekDays: readonly WeekDay[]
  /**
   * ¿El día tiene algo que hacer? Sin contenido es «próximamente» y cuenta como
   * descanso. Por defecto todos lo tienen. Ver `dayHasContent`.
   */
  dayHasContent?: (day: WeekDay) => boolean
  /** `isWorkoutDone` de `useProgress`. */
  isWorkoutDone: (workoutKey: string, date?: string) => boolean
  /** Último día con entreno de cualquier tipo, `YYYY-MM-DD`, o `null`. */
  lastActivityDay: string | null
  /** Actividad sin terminar, o `null`. */
  activeActivity: HomeActiveActivity | null
  /**
   * Contador de entrenos de TODA la cuenta: la vista de `useHomeStage`. NO vale
   * `getTotalSessions()` (solo el programa activo) ni `user_stats.total_sessions`.
   */
  account: Pick<HomeStageView, 'stage' | 'sessions' | 'pending'>
  /** `deriveActivation(...)`, o `null` si no se conoce el alta. */
  activation: ActivationState | null
  /** Semana de calendario: `getWeekSummary().done` y el objetivo efectivo. */
  week: { done: number; goal: number } | null
  offline?: boolean
  unsynced?: boolean
  loading?: boolean
}

const HOME_DAY_TYPE: Partial<Record<DayType, HomeDayType>> = {
  cardio: 'cardio',
  circuit: 'circuit',
  yoga: 'yoga',
}

export function homeDayType(type: DayType): HomeDayType {
  return HOME_DAY_TYPE[type] ?? 'strength'
}

/**
 * Criterio por defecto de «el día tiene contenido»: cardio con su config,
 * circuito con ejercicios, y fuerza/yoga con algún ejercicio en su entreno.
 * `getWorkout` es el de `useWorkoutActions` (o cualquiera con la misma forma).
 */
export function dayHasContent(
  day: WeekDay,
  workout: { exercises?: readonly unknown[] } | null | undefined,
): boolean {
  if (!isTrainableDay(day)) return false
  if (day.type === 'cardio') return !!day.cardioConfig
  if (day.type === 'circuit') return (day.circuitConfig?.exercises?.length ?? 0) > 0
  return (workout?.exercises?.length ?? 0) > 0
}

export function getHomeState(input: HomeStateInput): HomeState {
  const { today, activeProgram, programProgress, account, activation } = input
  const hasContent = input.dayHasContent ?? (() => true)
  const phase = programProgress?.currentPhase || 1
  const weekDays = activeProgram ? input.weekDays : []
  const trainable = WEEK_ORDER
    .map(id => weekDays.find(d => d.id === id))
    .filter((d): d is WeekDay => isTrainableDay(d))

  const dayRef = (day: WeekDay, date: string): HomeDayRef => ({
    dayId: day.id,
    date,
    workoutKey: `p${phase}_${day.id}`,
    dayType: homeDayType(day.type),
    index: trainable.findIndex(d => d.id === day.id) + 1,
    of: trainable.length,
  })

  const todayId = dayIdFromDateStr(today)
  const todayDay = todayId ? weekDays.find(d => d.id === todayId) : undefined
  const todayTrains = !!todayDay && isTrainableDay(todayDay) && hasContent(todayDay)

  /** Siguiente día (a partir de mañana) que toca y tiene contenido. */
  const nextDay = (): HomeDayRef | null => {
    if (!isDayStr(today)) return null
    for (let i = 1; i <= 7; i++) {
      const date = shiftDay(today, i)
      const id = dayIdFromDateStr(date)
      const day = weekDays.find(d => d.id === id)
      if (day && isTrainableDay(day) && hasContent(day)) return dayRef(day, date)
    }
    return null
  }

  const daysSinceLast = isDayStr(input.lastActivityDay) && isDayStr(today)
    ? Math.max(0, daysBetween(input.lastActivityDay, today))
    : null

  const firstWeekMode = activation ? activationCardMode(activation, today) : 'hidden'
  const modifiers: HomeModifiers = {
    inactiveDays: daysSinceLast !== null && daysSinceLast >= INACTIVE_NOTICE_MIN_DAYS && daysSinceLast < COMEBACK_AFTER_DAYS
      ? daysSinceLast
      : null,
    firstWeek: activation && firstWeekMode !== 'hidden'
      ? {
          done: activation.sessionsInFirst7Days,
          target: ACTIVATION_TARGET_SESSIONS,
          daysRemaining: activation.daysRemaining,
          reached: activation.reached,
        }
      : null,
    offline: !!input.offline,
    unsynced: !!input.unsynced,
    loading: !!input.loading || account.pending,
  }

  // 1. Actividad en curso, sea del día que sea.
  if (input.activeActivity) {
    const started = input.activeActivity.startedDay
    return {
      kind: 'in_progress',
      activity: input.activeActivity,
      fromAnotherDay: isDayStr(started) && started !== today,
      modifiers,
    }
  }

  // 2. Programa terminado.
  if (activeProgram && programProgress?.isCompleted && !programProgress.nextDay) {
    return { kind: 'program_complete', modifiers }
  }

  // 3-4. Sin programa o cuenta nueva. `stage === 'full'` es el flag «ya llegó
  // a 3» del dispositivo: gana a un contador a 0 sin red.
  const isNewAccount = account.sessions <= 0 && account.stage !== 'full'
  if (!activeProgram && !isNewAccount) return { kind: 'no_program', modifiers }
  if (isNewAccount) {
    return { kind: 'first_workout', showActivationGoal: (activation?.daysRemaining ?? 0) > 0, modifiers }
  }

  // 5. Vuelta tras un parón.
  if (daysSinceLast !== null && daysSinceLast >= COMEBACK_AFTER_DAYS) {
    return {
      kind: 'comeback',
      daysSinceLast,
      day: todayTrains ? dayRef(todayDay!, today) : nextDay(),
      modifiers,
    }
  }

  // 6. El día de hoy del programa ya está hecho.
  if (todayDay && isTrainableDay(todayDay) && input.isWorkoutDone(`p${phase}_${todayDay.id}`, today)) {
    const day = dayRef(todayDay, today)
    return {
      kind: 'done_today',
      day,
      variant: day.dayType === 'cardio' ? 'cardio' : 'default',
      next: nextDay(),
      modifiers,
    }
  }

  // 7-8. Hoy no toca entrenar.
  if (!todayTrains) {
    const week = input.week
    if (week && week.goal > 0 && week.done >= week.goal) {
      return { kind: 'week_complete', next: nextDay(), modifiers }
    }
    return {
      kind: 'rest_day',
      comingSoon: !!todayDay && isTrainableDay(todayDay),
      next: nextDay(),
      modifiers,
    }
  }

  // 9. Toca entrenar.
  return {
    kind: 'training_day',
    day: dayRef(todayDay!, today),
    deload: !!programProgress?.isDeloadWeek,
    modifiers,
  }
}
