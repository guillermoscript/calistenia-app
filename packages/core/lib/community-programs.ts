/**
 * Programas de comunidad con hitos semanales (#353): funciones puras sobre
 * filas ya descargadas, igual que `cumulative-scoring.ts`, para que todo el
 * cálculo sea testeable en el entorno node de vitest.
 *
 * Decisiones que fija este módulo (documentadas en el issue #353):
 *
 * - **Inscripción rodante**: la semana 1 de cada miembro empieza el día en que
 *   se apuntó (`started_at`), no en una fecha de cohorte común. Las ventanas de
 *   puntuación ya son locales al espectador y no hay planificador en servidor
 *   que coordine una cohorte.
 * - **Los hitos NO se persisten**: el progreso se recalcula en cada lectura a
 *   partir de los registros canónicos (`sessions` / `cardio_sessions`). Por eso
 *   un hito no puede completarse dos veces (no hay estado que duplicar) y
 *   editar o borrar un entreno se refleja solo en la siguiente lectura.
 * - **Semanas = 7 días de CALENDARIO**, con el último día incluido, igual que
 *   los retos. La aritmética se hace con `addDays()` sobre cadenas
 *   `YYYY-MM-DD` (dayjs), nunca con milisegundos: así un cambio de horario de
 *   verano dentro del programa no puede producir una semana de 6 u 8 días,
 *   porque ninguna semana se calcula como «168 horas».
 * - **La actividad anterior a apuntarse no cuenta**: la primera ventana empieza
 *   en `started_at`, así que quien ya llevaba 12 entrenos este mes no termina el
 *   programa al instante.
 */

import { addDays } from './dateUtils'
import { countWorkouts, type CardioRowForTotal, type SessionRowForTotal } from './cumulative-scoring'
import type {
  CommunityProgram,
  CommunityProgramMilestone,
} from '../types/community-program'

export type {
  CommunityMembershipStatus,
  CommunityMilestoneKind,
  CommunityProgram,
  CommunityProgramMember,
  CommunityProgramMilestone,
} from '../types/community-program'

// ─── Ventanas semanales ──────────────────────────────────────────────────────

export interface WeekWindow {
  /** 1-indexada. */
  week: number
  /** Primer día incluido, `YYYY-MM-DD`. */
  startDay: string
  /** Último día incluido, `YYYY-MM-DD`. */
  endDay: string
  /** 1..7. La última semana es más corta si la duración no es múltiplo de 7. */
  days: number
}

/**
 * Ventanas consecutivas de 7 días de calendario desde `startDay`, con el último
 * día incluido. Si `durationDays` no es múltiplo de 7 la última ventana queda
 * recortada al último día del programa: sigue siendo un hito real y se puede
 * completar, solo que dispone de menos días.
 *
 * Devuelve `[]` para duraciones no positivas (contenido mal configurado) en vez
 * de lanzar: la pantalla debe poder renderizar un estado seguro.
 */
export function buildWeekWindows(startDay: string, durationDays: number): WeekWindow[] {
  if (!startDay || !Number.isFinite(durationDays) || durationDays <= 0) return []
  const total = Math.floor(durationDays)
  const weeks = Math.ceil(total / 7)
  const windows: WeekWindow[] = []
  for (let i = 0; i < weeks; i++) {
    const days = Math.min(7, total - i * 7)
    const windowStart = addDays(startDay, i * 7)
    windows.push({
      week: i + 1,
      startDay: windowStart,
      endDay: addDays(windowStart, days - 1),
      days,
    })
  }
  return windows
}

/** Último día incluido del programa, o '' si no hay ventanas. */
export function getProgramEndDay(windows: WeekWindow[]): string {
  return windows.length ? windows[windows.length - 1].endDay : ''
}

/**
 * Ventana que contiene `day`, o null si el día cae fuera del programa.
 * La comparación es lexicográfica: para `YYYY-MM-DD` equivale a la cronológica.
 */
export function getWeekForDay(windows: WeekWindow[], day: string): WeekWindow | null {
  if (!day) return null
  return windows.find(w => day >= w.startDay && day <= w.endDay) ?? null
}

// ─── Progreso por hito ───────────────────────────────────────────────────────

export interface MilestoneProgress {
  milestone: CommunityProgramMilestone
  /** null si el hito apunta a una semana que no existe (contenido inconsistente). */
  window: WeekWindow | null
  completed: number
  target: number
  isComplete: boolean
  /** La ventana ya empezó respecto a `today`. */
  isUnlocked: boolean
  /**
   * El hito no se puede evaluar: semana inexistente, o `kind: 'challenge'` sin
   * un reto resoluble (borrado o preset desconocido). Se muestra en estado
   * seguro y NUNCA cuenta como completado.
   */
  isBroken: boolean
}

export interface MilestoneProgressInput {
  milestones: CommunityProgramMilestone[]
  windows: WeekWindow[]
  /** Filas de `sessions` del miembro dentro (o alrededor) de la ventana total. */
  sessions: SessionRowForTotal[]
  /** Filas de `cardio_sessions` del miembro. */
  cardio: CardioRowForTotal[]
  /** Convierte un timestamp UTC de PB al día local del espectador. */
  utcToLocalDay: (utc: string) => string
  /** Día local de hoy, `YYYY-MM-DD`. */
  today: string
  /**
   * Progreso ya calculado para hitos de tipo `challenge`, indexado por id de
   * hito. Un hito de reto sin entrada aquí se considera roto (reto borrado).
   */
  challengeProgress?: Record<string, number>
}

/**
 * Recuenta los entrenos de una ventana. Reutiliza `countWorkouts` para heredar
 * su contrato de deduplicación —sesiones por (workout_key, día local) y cardio
 * por id—, de modo que registrar dos veces el mismo entreno no infla el hito.
 *
 * Se exporta porque los hitos de tipo `challenge` necesitan el mismo recuento
 * desde el hook, y duplicarlo allí sería duplicar también la deduplicación.
 */
export function countWorkoutsInWindow(
  window: WeekWindow,
  sessions: SessionRowForTotal[],
  cardio: CardioRowForTotal[],
  utcToLocalDay: (utc: string) => string,
): number {
  const inWindow = (timestamp?: string) => {
    if (!timestamp) return false
    const day = utcToLocalDay(timestamp)
    return day >= window.startDay && day <= window.endDay
  }
  return countWorkouts(
    sessions.filter(s => inWindow(s.completed_at)),
    cardio.filter(c => inWindow(c.started_at)),
    utcToLocalDay,
  )
}

/**
 * Progreso de cada hito, recalculado desde cero. El orden de salida respeta
 * `week` y luego `sort_order`, para que la pantalla no dependa del orden del
 * fetch.
 *
 * Una semana perdida se queda perdida: cada hito solo cuenta entrenos DENTRO de
 * su propia ventana, así que llegar a la semana 4 no permite completar la 2.
 * Es la semántica de «hito semanal» y hace que el porcentaje sea determinista.
 */
export function computeMilestoneProgress(input: MilestoneProgressInput): MilestoneProgress[] {
  const { milestones, windows, sessions, cardio, utcToLocalDay, today, challengeProgress } = input

  const sorted = [...milestones].sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })

  return sorted.map(milestone => {
    const window = windows.find(w => w.week === milestone.week) ?? null
    const target = Math.max(0, Math.floor(milestone.target || 0))

    if (!window) {
      // Hito que apunta a una semana inexistente: estado seguro, nunca completo.
      return { milestone, window: null, completed: 0, target, isComplete: false, isUnlocked: false, isBroken: true }
    }

    const isUnlocked = today >= window.startDay

    if (milestone.kind === 'challenge') {
      const external = challengeProgress?.[milestone.id]
      if (external === undefined) {
        // Reto borrado o preset desconocido: se pinta pero no puede completarse.
        return { milestone, window, completed: 0, target, isComplete: false, isUnlocked, isBroken: true }
      }
      return {
        milestone,
        window,
        completed: external,
        target,
        isComplete: target > 0 && external >= target,
        isUnlocked,
        isBroken: false,
      }
    }

    const completed = countWorkoutsInWindow(window, sessions, cardio, utcToLocalDay)
    return {
      milestone,
      window,
      completed,
      target,
      // Un objetivo de 0 no se considera completado: es contenido mal cargado.
      isComplete: target > 0 && completed >= target,
      isUnlocked,
      isBroken: false,
    }
  })
}

/**
 * Estado de un hito para pintarlo. Se calcula aquí y no en cada pantalla para
 * que web y móvil no puedan divergir, y para que la UI reciba UN estado
 * explícito en vez de tres booleanos que hay que combinar bien en dos sitios.
 */
export type MilestoneState = 'unavailable' | 'complete' | 'locked' | 'missed' | 'active'

export function getMilestoneState(progress: MilestoneProgress, today: string): MilestoneState {
  if (progress.isBroken) return 'unavailable'
  if (progress.isComplete) return 'complete'
  if (!progress.isUnlocked) return 'locked'
  // La ventana ya pasó sin llegar al objetivo: esa semana no se recupera.
  if (progress.window && today > progress.window.endDay) return 'missed'
  return 'active'
}

// ─── Resumen del programa ────────────────────────────────────────────────────

export interface CommunityProgramProgress {
  milestones: MilestoneProgress[]
  /** Semana en curso (1-indexada) o null si el programa aún no empezó o ya terminó. */
  currentWeek: number | null
  /** Primer hito sin completar y evaluable; null si no queda ninguno. */
  nextMilestone: MilestoneProgress | null
  completedMilestones: number
  totalMilestones: number
  /** 0..100, redondeado. */
  percent: number
  isComplete: boolean
  /** Días que faltan para el último día incluido; 0 si ya pasó. */
  daysRemaining: number
  startDay: string
  endDay: string
}

export interface ProgramProgressInput extends Omit<MilestoneProgressInput, 'windows'> {
  program: Pick<CommunityProgram, 'duration_days'>
  /** Día local en que el miembro empezó la semana 1. */
  startedOn: string
}

/**
 * Rollup del programa para un miembro. Todo se deriva: no hay ningún registro
 * de «hito completado» que mantener ni que revocar.
 *
 * Un programa sin hitos (contenido a medio cargar) devuelve 0 % y NO se
 * considera completado: «no queda nada por hacer» no es lo mismo que «lo has
 * conseguido», y marcarlo como logro sería mentirle al usuario.
 */
export function computeProgramProgress(input: ProgramProgressInput): CommunityProgramProgress {
  const { program, startedOn, milestones, today } = input
  const windows = buildWeekWindows(startedOn, program.duration_days)
  const endDay = getProgramEndDay(windows)

  const progress = computeMilestoneProgress({ ...input, windows })
  const totalMilestones = progress.length
  const completedMilestones = progress.filter(m => m.isComplete).length

  const currentWindow = getWeekForDay(windows, today)
  const nextMilestone = progress.find(m => !m.isComplete && !m.isBroken) ?? null

  return {
    milestones: progress,
    currentWeek: currentWindow?.week ?? null,
    nextMilestone,
    completedMilestones,
    totalMilestones,
    percent: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
    isComplete: totalMilestones > 0 && completedMilestones === totalMilestones,
    daysRemaining: daysBetween(today, endDay),
    startDay: startedOn,
    endDay,
  }
}

/**
 * Días de calendario de `from` a `to`, ambos como `YYYY-MM-DD`, nunca negativo.
 * Se cuenta avanzando con `addDays` en vez de restar epochs para no reintroducir
 * el error de horario de verano que el resto del módulo evita.
 */
function daysBetween(from: string, to: string): number {
  if (!from || !to || to <= from) return 0
  let count = 0
  let cursor = from
  // Cota de seguridad: ningún programa razonable pasa de ~2 años.
  while (cursor < to && count < 1000) {
    cursor = addDays(cursor, 1)
    count++
  }
  return count
}

/**
 * Rango de fechas que hay que consultar en PocketBase para poder plegar TODAS
 * las semanas: una sola consulta por el programa entero en lugar de una por
 * semana. Devuelve días locales inclusivos.
 */
export function getProgramQueryRange(startedOn: string, durationDays: number): { startDay: string; endDay: string } {
  const windows = buildWeekWindows(startedOn, durationDays)
  return { startDay: startedOn, endDay: getProgramEndDay(windows) || startedOn }
}
