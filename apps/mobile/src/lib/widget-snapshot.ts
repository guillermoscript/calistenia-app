/**
 * Contrato del snapshot que la app escribe para los widgets (App Group en iOS,
 * AsyncStorage en Android). Ver docs/superpowers/specs/2026-06-10-mobile-widgets-design.md.
 * Puro a propósito: testeable sin react-native.
 */
export interface WidgetSnapshot {
  date: string // YYYY-MM-DD local; el widget lo compara con "hoy"
  programName: string | null
  workoutToday: {
    title: string
    type: string // strength | rest | cardio | yoga | circuit
    done: boolean
    exerciseCount: number
    programPhase: number
  } | null
  week: { id: string; done: boolean; type: string }[]
  streak: number
  weeklyDone: number
  weeklyGoal: number
  lang: 'es' | 'en'
}

export const WIDGET_SNAPSHOT_KEY = 'widget_snapshot'

export function buildWidgetSnapshot(args: {
  today: string
  lang: 'es' | 'en'
  programName: string | null
  programPhase: number
  todayId: string
  todayType: string
  weekDays: { id: string; type: string }[]
  workout: { title: string; exerciseCount: number } | null
  isDone: (key: string) => boolean
  streak: number
  weeklyDone: number
  weeklyGoal: number
}): WidgetSnapshot {
  const { programPhase } = args
  const hasProgram = args.programName !== null
  return {
    date: args.today,
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
    week: args.weekDays.map(d => ({
      id: d.id,
      done: args.isDone(`p${programPhase}_${d.id}`),
      type: d.type,
    })),
    streak: args.streak,
    weeklyDone: args.weeklyDone,
    weeklyGoal: args.weeklyGoal,
    lang: args.lang,
  }
}
