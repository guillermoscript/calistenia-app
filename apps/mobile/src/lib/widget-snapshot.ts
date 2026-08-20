/**
 * Contrato del snapshot que la app escribe para los widgets (App Group en iOS,
 * AsyncStorage en Android). Ver docs/superpowers/specs/2026-06-10-mobile-widgets-design.md.
 * Puro a propósito: testeable sin react-native.
 */
export interface WidgetSnapshot {
  date: string // YYYY-MM-DD local; el widget lo compara con "hoy"
  /** IANA tz usada por el escritor para calcular `date`. El widget recalcula
   *  "hoy" en esta misma tz: el proceso headless no corre setTimezone() y su
   *  reloj local puede diferir de la tz del perfil → mismatch → "stale". */
  tz: string
  programName: string | null
  workoutToday: {
    title: string
    type: string // strength | rest | cardio | yoga | circuit
    done: boolean
    exerciseCount: number
    programPhase: number
  } | null
  /** Sesión de mañana (NextSessionWidget, #230). null si no hay programa
   *  activo; con programa activo, siempre un objeto (type 'rest' si mañana
   *  toca descanso) — mismo criterio que `workoutToday`. */
  workoutTomorrow: {
    title: string
    type: string
    exerciseCount: number
  } | null
  week: { id: string; done: boolean; type: string }[]
  /** Racha ACTIVA (termina hoy o ayer), no el récord histórico. */
  streak: number
  /** true si hoy ya cuenta para la racha. Distingue "viva" de "en riesgo":
   *  `workoutToday.done` no vale, porque solo mira el workout del programa y
   *  una sesión libre en día de descanso también sostiene la racha. */
  streakToday: boolean
  weeklyDone: number
  weeklyGoal: number
  lang: 'es' | 'en'
}

export const WIDGET_SNAPSHOT_KEY = 'widget_snapshot'

export function buildWidgetSnapshot(args: {
  today: string
  tz: string
  lang: 'es' | 'en'
  programName: string | null
  programPhase: number
  todayId: string
  todayType: string
  tomorrowType: string
  weekDays: { id: string; type: string }[]
  workout: { title: string; exerciseCount: number } | null
  workoutTomorrow: { title: string; exerciseCount: number } | null
  isDone: (key: string) => boolean
  streak: number
  /** Última fecha con sesión ('YYYY-MM-DD'), o null si no hay ninguna. */
  lastSessionDate: string | null
  weeklyDone: number
  weeklyGoal: number
}): WidgetSnapshot {
  const { programPhase } = args
  const hasProgram = args.programName !== null
  return {
    date: args.today,
    tz: args.tz,
    programName: args.programName,
    workoutToday: hasProgram
      ? {
          title: args.workout?.title ?? '',
          type: args.todayType,
          done: args.isDone(`p${programPhase}_${args.todayId}`),
          exerciseCount: args.workout?.exerciseCount ?? 0,
          programPhase,
        }
      : null,
    workoutTomorrow: hasProgram
      ? {
          title: args.workoutTomorrow?.title ?? '',
          type: args.tomorrowType,
          exerciseCount: args.workoutTomorrow?.exerciseCount ?? 0,
        }
      : null,
    week: args.weekDays.map(d => ({
      id: d.id,
      done: args.isDone(`p${programPhase}_${d.id}`),
      type: d.type,
    })),
    streak: args.streak,
    streakToday: args.lastSessionDate === args.today,
    weeklyDone: args.weeklyDone,
    weeklyGoal: args.weeklyGoal,
    lang: args.lang,
  }
}
